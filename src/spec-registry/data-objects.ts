import { responseResourceNames } from './resources.js';

/**
 * Extract an adaptor's **data objects** as one standalone schema file each.
 *
 * These files are the clean, reusable type source — what data coming from a
 * system looks like — for downstream tooling (Lightning triggers/expected
 * payloads, data-mapping, type-checking). They carry NO seed/mocker artifacts:
 * the mocker seed shape is assembled from these objects at generation time, not
 * embedded here, so the two concerns stay separate.
 *
 * The object set is the transitive `$ref` closure of the API's response
 * resources (see resources.ts): every domain object the API returns, plus every
 * nested type those objects reference. Request-body wrappers and error shapes
 * that aren't reachable from a returned resource are left out.
 *
 * Each file is JSON Schema 2020-12 (OpenAPI 3.0-isms like `nullable` are
 * normalised), with internal `#/components/schemas/X` refs rewritten to sibling
 * files (`X.json`). The verbatim OpenAPI form of every schema still lives in the
 * adaptor's openapi.json, so both dialects are available.
 */

export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

export interface DataObjectFile {
  name: string; // component schema name, e.g. "Patient"
  file: string; // sanitised file name, e.g. "Patient.json"
  isResource: boolean; // true if returned directly by an operation (vs. a nested type)
  schema: any; // the standalone JSON Schema document
}

export interface DataObjectsResult {
  objects: DataObjectFile[];
  index: {
    adaptor: string;
    capturedAt: string;
    dialect: string;
    source: string;
    resources: string[];
    objects: Array<{ name: string; file: string; resource: boolean }>;
  };
}

/** File-safe name for a schema (mirrors adaptors-storybook's data-schemas convention). */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

const SCHEMA_REF = /^#\/components\/schemas\/(.+)$/;

/** All component-schema names a node references (transitively within the node). */
function collectRefs(node: any, out: Set<string> = new Set()): Set<string> {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const x of node) collectRefs(x, out);
    return out;
  }
  if (typeof node.$ref === 'string') {
    const m = node.$ref.match(SCHEMA_REF);
    if (m) out.add(decodeURIComponent(m[1]));
  }
  for (const v of Object.values(node)) collectRefs(v, out);
  return out;
}

/**
 * Copy a schema node into JSON Schema 2020-12 form: rewrite in-document schema
 * refs to sibling files, convert `nullable` and boolean `exclusiveMin/Max`.
 */
function toJsonSchema(node: any, fileFor: (name: string) => string): any {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((x) => toJsonSchema(x, fileFor));

  if (typeof node.$ref === 'string') {
    const m = node.$ref.match(SCHEMA_REF);
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref') out.$ref = m ? fileFor(decodeURIComponent(m[1])) : v;
      else out[k] = toJsonSchema(v, fileFor);
    }
    return out;
  }

  const nullable = node.nullable === true;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'nullable') continue;
    out[k] = toJsonSchema(v, fileFor);
  }

  // OpenAPI 3.0 boolean exclusive bounds -> JSON Schema numeric bounds.
  if (typeof out.exclusiveMinimum === 'boolean') {
    if (out.exclusiveMinimum && 'minimum' in out) {
      out.exclusiveMinimum = out.minimum;
      delete out.minimum;
    } else delete out.exclusiveMinimum;
  }
  if (typeof out.exclusiveMaximum === 'boolean') {
    if (out.exclusiveMaximum && 'maximum' in out) {
      out.exclusiveMaximum = out.maximum;
      delete out.maximum;
    } else delete out.exclusiveMaximum;
  }

  if (nullable) {
    if (Array.isArray(out.type)) {
      if (!out.type.includes('null')) out.type = [...out.type, 'null'];
    } else if (typeof out.type === 'string') {
      out.type = [out.type, 'null'];
    } else if (typeof out.$ref === 'string') {
      // nullable ref: express as anyOf so the ref stays intact.
      const { $ref, ...rest } = out;
      return { anyOf: [{ $ref }, { type: 'null' }], ...rest };
    }
  }

  return out;
}

/** Build the standalone data-object files + index for one raw OpenAPI spec. */
export function extractDataObjects(
  rawOpenapi: any,
  adaptor: string,
  capturedAt: string
): DataObjectsResult {
  const allSchemas: Record<string, any> = rawOpenapi?.components?.schemas ?? {};
  const resources = responseResourceNames(rawOpenapi);

  // Transitive closure: resources + everything they reference.
  const closure = new Set<string>();
  const queue = [...resources];
  while (queue.length) {
    const name = queue.shift()!;
    if (closure.has(name) || !allSchemas[name]) continue;
    closure.add(name);
    for (const ref of collectRefs(allSchemas[name])) {
      if (!closure.has(ref)) queue.push(ref);
    }
  }

  const fileFor = (name: string) => `${sanitize(name)}.json`;

  const objects: DataObjectFile[] = [...closure].sort().map((name) => {
    const body = toJsonSchema(allSchemas[name], fileFor);
    const schema = {
      $schema: JSON_SCHEMA_DIALECT,
      $id: `${adaptor}/${sanitize(name)}`,
      title: name,
      'x-openfn-adaptor': adaptor,
      'x-source': {
        openapi: `#/components/schemas/${name}`,
        capturedAt,
      },
      ...body,
    };
    return { name, file: fileFor(name), isResource: resources.has(name), schema };
  });

  const index = {
    adaptor,
    capturedAt,
    dialect: JSON_SCHEMA_DIALECT,
    source: 'openapi.json',
    resources: objects.filter((o) => o.isResource).map((o) => o.name),
    objects: objects.map((o) => ({ name: o.name, file: o.file, resource: o.isResource })),
  };

  return { objects, index };
}
