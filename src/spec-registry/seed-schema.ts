import { parseSpec } from '../engine/spec-parser.js';

/**
 * Derive the seed-data schema mocker needs from an adaptor's OpenAPI spec.
 *
 * mocker seeds a system from a dump of shape `{ collection: { id: record } }`
 * (see src/datasets.ts). This function reads the OpenAPI operations, finds the
 * resource shapes returned by GET/list endpoints (unwrapping the common list
 * envelopes), and emits an OpenAPI-format document that:
 *
 *   - re-declares those resource shapes under components.schemas, and
 *   - describes the dump envelope as a `SeedData` schema
 *     (collection -> id -> record), and
 *   - records the collection→resource mapping under `x-seed.collections`.
 *
 * The result is deterministic and mechanical; a maintainer can hand-tune the
 * collection names or the resource set afterward.
 */

interface ResourceHit {
  /** Component schema name, e.g. "Patient". */
  name: string;
  /** Suggested seed collection key, e.g. "patients". */
  collection: string;
}

/** Common list-envelope wrapper keys used across the APIs the adaptors call. */
const ENVELOPE_KEYS = ['data', 'objects', 'results', 'items', 'entry', 'records', 'elements', 'value'];

/**
 * Sibling keys that mark a schema as a paginated list wrapper (not a resource).
 * When present, any array-of-$ref property — even one named after the resource,
 * like DHIS2's `organisationUnits` — is treated as the inner resource.
 */
const PAGINATION_HINTS = [
  'pager', 'paging', 'meta', 'page', '_links', 'links', 'next', 'nextPage', 'nextPageToken',
  'count', 'total', 'totalCount', 'total_count', 'hasMore', 'has_more', 'offset', 'cursor',
];

/** Extract a `#/components/schemas/<Name>` ref name from a node, else undefined. */
function refName(node: any): string | undefined {
  const ref = node?.$ref;
  if (typeof ref !== 'string') return undefined;
  const m = ref.match(/#\/components\/schemas\/(.+)$/);
  return m ? m[1] : undefined;
}

/** Resource refs carried under a schema's envelope keys (array or single). */
function envelopeInner(node: any, deref: (n: any) => any): string[] {
  const props = deref(node)?.properties ?? {};

  // 1. Well-known envelope keys (data/objects/results/...).
  const known: string[] = [];
  for (const key of ENVELOPE_KEYS) {
    const p = props[key];
    if (!p) continue;
    const arr = deref(p) ?? p;
    const item = refName(arr?.items) ?? refName(p) ?? refName(arr);
    if (item) known.push(item);
  }
  if (known.length) return known;

  // 2. Paginated wrapper with a resource-named array property (e.g. DHIS2's
  //    { pager, organisationUnits: [OrganisationUnit] }): unwrap array-of-$ref
  //    props only when a pagination sibling confirms this is a list wrapper.
  const keys = Object.keys(props);
  const paginated = keys.some((k) => PAGINATION_HINTS.includes(k));
  if (!paginated) return [];
  const out: string[] = [];
  for (const p of Object.values(props)) {
    const arr = deref(p) ?? p;
    const item = refName((arr as any)?.items);
    if (item) out.push(item);
  }
  return out;
}

/**
 * Given a 2xx JSON response schema, find the underlying resource component
 * schema(s) it carries, unwrapping list envelopes (both anonymous inline ones
 * and named wrapper schemas like `OrganisationUnitList`) so the resource — not
 * the wrapper — is what becomes a seed collection. Cycle-guarded on ref names.
 */
function resourcesFromResponse(
  schema: any,
  deref: (n: any) => any,
  seen: Set<string> = new Set()
): string[] {
  if (!schema || typeof schema !== 'object') return [];

  const direct = refName(schema);
  if (direct) {
    if (seen.has(direct)) return [direct];
    seen.add(direct);
    // If the referenced schema is itself an envelope, unwrap to the inner resource.
    const inner = envelopeInner(schema, deref);
    return inner.length ? inner.flatMap((n) => resourcesFromResponse({ $ref: `#/components/schemas/${n}` }, deref, seen)) : [direct];
  }

  const s = deref(schema) ?? schema;
  if (s?.type === 'array' || s?.items) {
    const item = refName(s.items) ?? refName(deref(s.items));
    return item ? resourcesFromResponse({ $ref: `#/components/schemas/${item}` }, deref, seen) : [];
  }
  return envelopeInner(schema, deref).flatMap((n) =>
    resourcesFromResponse({ $ref: `#/components/schemas/${n}` }, deref, seen)
  );
}

/** Best-effort collection key from a resource name: lower-camel, pluralised. */
function collectionKey(resource: string): string {
  const camel = resource.charAt(0).toLowerCase() + resource.slice(1);
  if (/[sxz]$/.test(camel) || /(ch|sh)$/.test(camel)) return camel + 'es';
  if (/[^aeiou]y$/.test(camel)) return camel.slice(0, -1) + 'ies';
  if (/s$/.test(camel)) return camel;
  return camel + 's';
}

export interface SeedSchemaResult {
  schema: any;
  collections: number;
}

/** Build the seed-schema document (OpenAPI 3.0 form) from a raw OpenAPI spec. */
export function deriveSeedSchema(rawOpenapi: any, adaptor: string, capturedAt: string): SeedSchemaResult {
  const parsed = parseSpec(rawOpenapi);
  const allSchemas: Record<string, any> = rawOpenapi?.components?.schemas ?? {};

  // Collect resource schema names from every 2xx JSON response (GET-heavy, but
  // POST/PUT returns are resources too).
  const resourceNames = new Set<string>();
  for (const op of parsed.operations) {
    for (const r of resourcesFromResponse(op.responseSchema, parsed.deref)) {
      if (allSchemas[r]) resourceNames.add(r);
    }
  }

  // Fallback: if responses carried no component refs (inline-only specs), treat
  // every top-level component schema as a candidate resource so the seed still
  // has structure to fill.
  if (resourceNames.size === 0) {
    for (const name of Object.keys(allSchemas)) resourceNames.add(name);
  }

  const resources: ResourceHit[] = [...resourceNames]
    .sort()
    .map((name) => ({ name, collection: collectionKey(name) }));

  // Copy the referenced schemas (and keep the rest available for $ref resolution).
  const components: Record<string, any> = {};
  for (const name of Object.keys(allSchemas)) components[name] = allSchemas[name];

  const seedProps: Record<string, any> = {};
  const xCollections: Record<string, any> = {};
  for (const { name, collection } of resources) {
    seedProps[collection] = {
      type: 'object',
      description: `Records keyed by id for the ${collection} collection.`,
      additionalProperties: { $ref: `#/components/schemas/${name}` },
    };
    xCollections[collection] = { resource: name, schema: { $ref: `#/components/schemas/${name}` } };
  }

  const schema = {
    openapi: '3.0.3',
    info: {
      title: `${adaptor} — mocker seed-data schema`,
      version: '1.0.0',
      description:
        `Schema for the seed data openfn-mocker needs to impersonate ${adaptor}. Derived from ` +
        `the adaptor's OpenAPI spec. A seed dump is { collection: { id: record } }; each record ` +
        `validates against its resource schema below.`,
      'x-openfn-adaptor': adaptor,
      'x-derived-from': 'openapi.json',
      'x-captured-at': capturedAt,
    },
    'x-seed': {
      shape: '{ collection: { id: record } }',
      collections: xCollections,
    },
    components: {
      schemas: {
        SeedData: {
          type: 'object',
          description: 'Full seed dump loaded by mocker: one property per collection.',
          properties: seedProps,
          additionalProperties: false,
        },
        ...components,
      },
    },
  };

  return { schema, collections: resources.length };
}
