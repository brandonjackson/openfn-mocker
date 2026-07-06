import { parseSpec } from '../engine/spec-parser.js';

/**
 * Identify the *data objects* an API exposes: the resource schemas its
 * operations actually return. This is the principled definition of "what data
 * comes in" — a component schema that appears (directly, in an array, or under
 * a list envelope) in a 2xx JSON response. Request-body wrappers and error
 * shapes are deliberately excluded; they are API plumbing, not returned data.
 *
 * Shared by the data-object extractor (spec-registry) so the same notion of
 * "resource" drives both the file set and any downstream tooling.
 */

/** Common list-envelope wrapper keys used across the APIs the adaptors call. */
const ENVELOPE_KEYS = ['data', 'objects', 'results', 'items', 'entry', 'records', 'elements', 'value'];

/** Sibling keys that mark a schema as a paginated list wrapper (not a resource). */
const PAGINATION_HINTS = [
  'pager', 'paging', 'meta', 'page', '_links', 'links', 'next', 'nextPage', 'nextPageToken',
  'count', 'total', 'totalCount', 'total_count', 'hasMore', 'has_more', 'offset', 'cursor',
];

/** Extract a `#/components/schemas/<Name>` ref name from a node, else undefined. */
export function refName(node: any): string | undefined {
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
 * the wrapper — is what counts. Cycle-guarded on ref names.
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
    const inner = envelopeInner(schema, deref);
    return inner.length
      ? inner.flatMap((n) => resourcesFromResponse({ $ref: `#/components/schemas/${n}` }, deref, seen))
      : [direct];
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

/**
 * The set of component-schema names that are returned as data by the API's
 * operations. If the spec's responses carry no component refs (inline-only),
 * falls back to every top-level component schema so nothing is lost.
 */
export function responseResourceNames(rawOpenapi: any): Set<string> {
  const parsed = parseSpec(rawOpenapi);
  const allSchemas: Record<string, any> = rawOpenapi?.components?.schemas ?? {};
  const names = new Set<string>();
  for (const op of parsed.operations) {
    for (const r of resourcesFromResponse(op.responseSchema, parsed.deref)) {
      if (allSchemas[r]) names.add(r);
    }
  }
  if (names.size === 0) for (const n of Object.keys(allSchemas)) names.add(n);
  return names;
}
