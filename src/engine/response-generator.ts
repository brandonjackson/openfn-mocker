import type { ParsedSpec } from './spec-parser.js';

/** Convert an OpenAPI path to a Fastify path: '/v3/{domain}/messages' -> '/v3/:domain/messages'. */
export function toFastifyPath(openApiPath: string): string {
  return openApiPath.replace(/\{([^}]+)\}/g, ':$1');
}

function deref(schema: any, spec?: ParsedSpec): any {
  if (schema && typeof schema === 'object' && typeof schema.$ref === 'string') {
    return spec ? spec.deref(schema) : {};
  }
  return schema;
}

/**
 * Build a representative value from a JSON schema. Precedence: example ->
 * examples -> default -> enum[0] -> by-type defaults. Objects recurse into
 * properties; arrays produce a single-item array. $refs resolved via `spec`.
 */
export function exampleFromSchema(schema: any, spec?: ParsedSpec): any {
  const s = deref(schema, spec);
  if (!s || typeof s !== 'object') return undefined;

  if ('example' in s) return s.example;
  if (s.examples && typeof s.examples === 'object') {
    const first = Object.values(s.examples)[0] as any;
    if (first && typeof first === 'object' && 'value' in first) return first.value;
    if (first !== undefined) return first;
  }
  if ('default' in s) return s.default;
  if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];

  if (Array.isArray(s.allOf)) {
    return s.allOf.reduce((acc: any, part: any) => {
      const v = exampleFromSchema(part, spec);
      return v && typeof v === 'object' && !Array.isArray(v) ? { ...acc, ...v } : acc;
    }, {});
  }
  if (Array.isArray(s.oneOf) && s.oneOf.length) return exampleFromSchema(s.oneOf[0], spec);
  if (Array.isArray(s.anyOf) && s.anyOf.length) return exampleFromSchema(s.anyOf[0], spec);

  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  switch (type) {
    case 'object':
    case undefined: {
      if (s.properties && typeof s.properties === 'object') {
        const obj: Record<string, any> = {};
        for (const [key, propSchema] of Object.entries<any>(s.properties)) {
          obj[key] = exampleFromSchema(propSchema, spec);
        }
        return obj;
      }
      return {};
    }
    case 'array':
      return [s.items ? exampleFromSchema(s.items, spec) : {}];
    case 'string':
      if (s.format === 'date-time') return new Date().toISOString();
      if (s.format === 'date') return new Date().toISOString().slice(0, 10);
      if (s.format === 'email') return 'user@example.org';
      if (s.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
      return typeof s.title === 'string' ? s.title : 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
    default:
      return null;
  }
}

/**
 * Fill in any schema-required or defaulted fields that are missing from
 * `record`, WITHOUT clobbering values the record already has. Non-object
 * records / non-object schemas are returned unchanged.
 */
export function shapeRecord(record: any, schema: any, spec?: ParsedSpec): any {
  const s = deref(schema, spec);
  if (!s || typeof s !== 'object' || !s.properties) return record;
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return record;
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  if (type && type !== 'object') return record;

  const out: any = { ...record };
  const required: string[] = Array.isArray(s.required) ? s.required : [];
  for (const [key, propSchema] of Object.entries<any>(s.properties)) {
    if (out[key] !== undefined) continue;
    const ps = deref(propSchema, spec);
    if (required.includes(key)) {
      out[key] = exampleFromSchema(ps, spec);
    } else if (ps && typeof ps === 'object' && 'default' in ps) {
      out[key] = ps.default;
    }
  }
  return out;
}

/** Slice `items` by offset/limit and report pagination metadata. */
export function paginate<T>(
  items: T[],
  opts: { offset?: number; limit?: number }
): { items: T[]; total: number; offset: number; limit: number; hasMore: boolean } {
  const total = items.length;
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const limit = opts.limit === undefined ? total : Math.max(0, Math.floor(opts.limit));
  const page = items.slice(offset, offset + limit);
  return { items: page, total, offset, limit, hasMore: offset + page.length < total };
}
