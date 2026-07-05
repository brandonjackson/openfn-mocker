import { randomUUID, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { DataStore } from '../store.js';
import type { ParsedOperation, ParsedSpec } from './spec-parser.js';
import { exampleFromSchema } from './response-generator.js';

/**
 * Spec-backed fallback — the middle tier of the mock's fidelity ladder.
 *
 * Hand-written plugin routes are the top tier ('modeled'): full semantic
 * fidelity, stateful, custom envelopes. This module answers what those routes
 * do NOT cover, using the system's committed OpenAPI subset in specs/ as the
 * map of the documented API. It is wired as the system's not-found handler
 * (see registerSystem), so a hand-written route always shadows it — the spec
 * can never contradict plugin logic, only extend past it. That precedence is
 * what makes this safe where the old "derive code from the spec" approach
 * drifted: there is no generated code, and the spec only speaks when nothing
 * else matched.
 *
 * What a matched operation gets:
 *  - the spec's success status code;
 *  - a response shaped by the operation's response schema (per-property
 *    `example` values in the spec subset become the payload — author them);
 *  - stateful CRUD layered on the store using http-generic's path-keyed
 *    convention (collection = concrete path, id = the last templated segment),
 *    so a POST through the fallback is readable by a later GET through it.
 *
 * Honest limitations (by design — this tier claims structural fidelity, not
 * semantic): query params are ignored for matching and filtering; error
 * bodies are generic; fallback state is path-keyed and NOT shared with the
 * collections a plugin's modeled routes use. When a tail endpoint needs real
 * semantics or shared state, promote it to a modeled route.
 */

/** A `{ statusCode, payload }` answer, or undefined when no operation matched. */
export interface SpecFallbackResult {
  statusCode: number;
  payload: any;
}

interface CompiledSegment {
  /** Exact string for a static segment (mutually exclusive with regex). */
  literal?: string;
  /** Matcher for a segment containing `{param}` placeholders. */
  regex?: RegExp;
  /** Param names bound by regex capture groups, in order. */
  params: string[];
}

interface CompiledOperation {
  op: ParsedOperation;
  segments: CompiledSegment[];
  /** Static-segment count; more static segments = more specific match. */
  staticCount: number;
  /** Name of the param bound in the LAST segment, when the path is item-like. */
  itemParam?: string;
}

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

function compileSegment(seg: string): CompiledSegment {
  if (!seg.includes('{')) return { literal: seg, params: [] };
  const params: string[] = [];
  const pattern = seg
    .replace(ESCAPE_RE, (c) => '\\' + c)
    .replace(/\\\{([A-Za-z0-9_-]+)\\\}/g, (_m, name: string) => {
      params.push(name);
      return '([^/]+)';
    });
  return { regex: new RegExp(`^${pattern}$`), params };
}

function compileOperation(op: ParsedOperation): CompiledOperation {
  const segments = op.path.split('/').filter(Boolean).map(compileSegment);
  const last = segments[segments.length - 1];
  return {
    op,
    segments,
    staticCount: segments.filter((s) => s.literal !== undefined).length,
    itemParam: last && last.params.length ? last.params[last.params.length - 1] : undefined,
  };
}

interface Match {
  compiled: CompiledOperation;
  params: Record<string, string>;
}

/** Match a concrete method+path against the compiled operations (most-specific wins). */
function matchOperation(
  operations: CompiledOperation[],
  method: string,
  pathSegments: string[]
): Match | undefined {
  let best: Match | undefined;
  for (const compiled of operations) {
    if (compiled.op.method !== method) continue;
    if (compiled.segments.length !== pathSegments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pathSegments.length; i++) {
      const seg = compiled.segments[i];
      if (seg.literal !== undefined) {
        if (seg.literal !== pathSegments[i]) {
          ok = false;
          break;
        }
        continue;
      }
      const m = seg.regex!.exec(pathSegments[i]);
      if (!m) {
        ok = false;
        break;
      }
      seg.params.forEach((name, j) => {
        params[name] = m[j + 1];
      });
    }
    if (!ok) continue;
    if (!best || compiled.staticCount > best.compiled.staticCount) best = { compiled, params };
  }
  return best;
}

/** Strip a `.json` / `.xml` format suffix (Twilio-style) from a path segment. */
function stripFormatSuffix(seg: string): string {
  return seg.replace(/\.(json|xml)$/i, '');
}

/** Normalize a body into an object base (raw string/primitive -> { _raw }). */
function objectBase(body: any): Record<string, any> {
  if (body && typeof body === 'object' && !Array.isArray(body)) return { ...body };
  if (body === undefined || body === null) return {};
  return { _raw: body };
}

/**
 * Overlay `record` onto a fully-worked example of `schema`, so every documented
 * response field is present (from the spec's examples) while the caller's own
 * values win. Non-object examples leave the record unchanged.
 */
function shapeFull(record: Record<string, any>, schema: any, spec: ParsedSpec): Record<string, any> {
  if (!schema) return record;
  const example = exampleFromSchema(schema, spec);
  if (example && typeof example === 'object' && !Array.isArray(example)) {
    return { ...example, ...record };
  }
  return record;
}

const ID_KEYS = ['id', 'sid', 'uuid', '_id'];

/** Generate a fresh id in the same format as an example value (SM<hex> -> SM<hex>). */
function generateIdLike(example: unknown): string {
  if (typeof example === 'string') {
    const m = example.match(/^([A-Za-z]+)([0-9a-fA-F]+)$/);
    if (m && m[2].length >= 8) {
      return m[1] + randomBytes(Math.ceil(m[2].length / 2)).toString('hex').slice(0, m[2].length);
    }
  }
  return randomUUID();
}

/**
 * Pick (or mint) the store key for a created record: a caller-supplied id wins;
 * otherwise the first id-like field is regenerated in its example's format so
 * repeated creates never collide on the schema's fixed example value.
 */
function assignCreateId(record: Record<string, any>, base: Record<string, any>): string {
  for (const key of ID_KEYS) {
    if (base[key] !== undefined && base[key] !== null && String(base[key]).length > 0) {
      return String(base[key]);
    }
  }
  for (const key of ID_KEYS) {
    if (record[key] !== undefined) {
      record[key] = generateIdLike(record[key]);
      return String(record[key]);
    }
  }
  const id = randomUUID();
  record.id = id;
  return id;
}

/**
 * Build a list payload: the schema's example envelope with its (first) array
 * property replaced by the stored items. A bare-array schema returns the items
 * directly; no schema returns the items as-is.
 */
function listPayload(items: any[], schema: any, spec: ParsedSpec): any {
  if (!schema) return items;
  const s = spec.deref(schema);
  if (!s || typeof s !== 'object') return items;
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  if (type === 'array') return items;
  if (s.properties && typeof s.properties === 'object') {
    const envelope = exampleFromSchema(s, spec) ?? {};
    for (const [key, propSchema] of Object.entries<any>(s.properties)) {
      const ps = spec.deref(propSchema);
      const pt = ps && (Array.isArray(ps.type) ? ps.type[0] : ps.type);
      if (pt === 'array') {
        envelope[key] = items;
        break;
      }
    }
    return envelope;
  }
  return exampleFromSchema(s, spec);
}

/**
 * Create the fallback handler for one system. The returned function inspects a
 * request that no registered route matched and either answers it from the spec
 * (returning `{ statusCode, payload }`) or declines (returning undefined, in
 * which case the caller should 404). Callable both from a not-found handler
 * (how registerSystem wires it) and from inside a plugin's own wildcard route.
 */
export function createSpecFallback(
  spec: ParsedSpec,
  store: DataStore
): (req: FastifyRequest, mountPath?: string) => SpecFallbackResult | undefined {
  const operations = spec.operations.map(compileOperation);

  return function specFallback(req, mountPath = '') {
    let path = (req.url ?? '').split('?')[0];
    if (mountPath && path.startsWith(mountPath)) path = path.slice(mountPath.length) || '/';
    const segments = path.split('/').filter(Boolean);

    const match = matchOperation(operations, req.method, segments);
    if (!match) return undefined;

    const { op, itemParam } = match.compiled;
    const schema = op.responseSchema;

    // Storage coordinates, following http-generic's path-keyed convention.
    // Item paths (last segment binds a param): id = the bound value, collection
    // = the concrete parent path. Collection paths: the concrete path with any
    // format suffix stripped, so POST /a/Things.json and GET /a/Things/{id}.json
    // agree on the collection name 'a/Things'.
    const itemId = itemParam !== undefined ? match.params[itemParam] : undefined;
    const collection =
      itemParam !== undefined
        ? segments.slice(0, -1).join('/') || 'root'
        : [...segments.slice(0, -1), stripFormatSuffix(segments[segments.length - 1] ?? '')]
            .filter(Boolean)
            .join('/') || 'root';

    switch (req.method) {
      case 'GET': {
        if (itemId !== undefined) {
          // Capture touched-ness before reading: store.get lazily creates the
          // collection it reads, which would make every miss look "touched".
          const touched = store.collections().includes(collection);
          const record = store.get(collection, itemId);
          if (record !== undefined) {
            return { statusCode: op.successStatus, payload: shapeFull(record, schema, spec) };
          }
          // Once writes have touched the collection, honor absence with a 404;
          // an untouched collection serves a representative example instead, so
          // read-only jobs against an unseeded tail still get shaped data.
          if (touched) {
            return { statusCode: 404, payload: { error: 'not found' } };
          }
          return {
            statusCode: op.successStatus,
            payload: schema ? exampleFromSchema(schema, spec) : {},
          };
        }
        const items = store.list(collection);
        if (items.length === 0) {
          return {
            statusCode: op.successStatus,
            payload: schema ? exampleFromSchema(schema, spec) : [],
          };
        }
        return { statusCode: op.successStatus, payload: listPayload(items, schema, spec) };
      }

      case 'POST': {
        const base = objectBase(req.body);
        if (itemId !== undefined) {
          // POST-to-item (update-by-post): merge into the record, creating it if absent.
          const updated = store.update(collection, itemId, base) ?? store.create(collection, itemId, base);
          return { statusCode: op.successStatus, payload: shapeFull(updated, schema, spec) };
        }
        const record = shapeFull(base, schema, spec);
        const key = assignCreateId(record, base);
        store.create(collection, key, record);
        return { statusCode: op.successStatus, payload: record };
      }

      case 'PUT': {
        if (itemId === undefined) {
          return { statusCode: op.successStatus, payload: schema ? exampleFromSchema(schema, spec) : {} };
        }
        const record = shapeFull(objectBase(req.body), schema, spec);
        store.replace(collection, itemId, record);
        return { statusCode: op.successStatus, payload: record };
      }

      case 'PATCH': {
        if (itemId === undefined) {
          return { statusCode: op.successStatus, payload: schema ? exampleFromSchema(schema, spec) : {} };
        }
        const patch = objectBase(req.body);
        const updated = store.update(collection, itemId, patch) ?? store.create(collection, itemId, patch);
        return { statusCode: op.successStatus, payload: shapeFull(updated, schema, spec) };
      }

      case 'DELETE': {
        if (itemId !== undefined) store.destroy(collection, itemId);
        if (op.successStatus === 204) return { statusCode: 204, payload: '' };
        return {
          statusCode: op.successStatus,
          payload: schema ? exampleFromSchema(schema, spec) : { deleted: itemId !== undefined ? [itemId] : [] },
        };
      }

      default:
        return undefined;
    }
  };
}
