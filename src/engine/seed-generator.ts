import { randomUUID } from 'node:crypto';
import type { ParsedSpec } from './spec-parser.js';
import { exampleFromSchema } from './response-generator.js';

/** Produce a plausible string for a field, using name + schema-format heuristics. */
function plausibleString(fieldName: string, schema: any): string {
  const name = fieldName.toLowerCase();
  if (schema?.format === 'date-time') return new Date().toISOString();
  if (schema?.format === 'date') return new Date().toISOString().slice(0, 10);
  if (schema?.format === 'uuid') return randomUUID();
  if (schema?.format === 'email' || name.includes('email')) return 'jane.doe@example.org';
  if (Array.isArray(schema?.enum) && schema.enum.length) return schema.enum[0];
  if (name === 'uuid' || name === 'id' || name.endsWith('_id') || name.endsWith('uid')) return randomUUID();
  if (name.includes('firstname') || name.includes('first_name') || name === 'given') return 'Jane';
  if (name.includes('lastname') || name.includes('last_name') || name.includes('family')) return 'Doe';
  if (name.includes('name')) return 'Jane Doe';
  if (name.includes('phone') || name.includes('msisdn') || name.includes('mobile')) return '+15555550123';
  if (name.includes('country')) return 'Sierra Leone';
  if (name.includes('city') || name.includes('village')) return 'Ngelehun';
  if (name.includes('status')) return 'active';
  if (name.includes('url') || name.includes('uri')) return 'http://localhost';
  if (name.includes('date') || name.includes('time')) return new Date().toISOString();
  return 'sample';
}

function build(schema: any, spec: ParsedSpec, fieldName: string, depth: number): any {
  const s = spec.deref(schema);
  if (!s || typeof s !== 'object') return null;
  if (depth > 6) return exampleFromSchema(s, spec);

  if ('example' in s) return s.example;
  if ('default' in s) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];

  if (Array.isArray(s.allOf)) {
    return s.allOf.reduce((acc: any, part: any) => {
      const v = build(part, spec, fieldName, depth + 1);
      return v && typeof v === 'object' && !Array.isArray(v) ? { ...acc, ...v } : acc;
    }, {});
  }
  if (Array.isArray(s.oneOf) && s.oneOf.length) return build(s.oneOf[0], spec, fieldName, depth + 1);
  if (Array.isArray(s.anyOf) && s.anyOf.length) return build(s.anyOf[0], spec, fieldName, depth + 1);

  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  switch (type) {
    case 'object':
    case undefined: {
      if (s.properties && typeof s.properties === 'object') {
        const obj: Record<string, any> = {};
        for (const [key, ps] of Object.entries<any>(s.properties)) {
          obj[key] = build(ps, spec, key, depth + 1);
        }
        return obj;
      }
      return {};
    }
    case 'array':
      return [s.items ? build(s.items, spec, fieldName, depth + 1) : {}];
    case 'string':
      return plausibleString(fieldName, s);
    case 'integer':
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'null':
      return null;
    default:
      return null;
  }
}

/**
 * Generate one realistic record from a schema. Builds on exampleFromSchema but
 * fills strings with plausible values via field-name heuristics. `overrides`
 * are shallow-merged over the top-level object.
 */
export function generateFromSchema(
  schema: any,
  spec: ParsedSpec,
  opts?: { overrides?: Record<string, any> }
): any {
  const record = build(schema, spec, '', 0);
  if (opts?.overrides && record && typeof record === 'object' && !Array.isArray(record)) {
    return { ...record, ...opts.overrides };
  }
  return record;
}

/** Generate `count` records; `overridesFor(i)` supplies per-record overrides. */
export function generateMany(
  schema: any,
  spec: ParsedSpec,
  count: number,
  opts?: { overridesFor?: (i: number) => Record<string, any> }
): any[] {
  const out: any[] = [];
  for (let i = 0; i < count; i++) {
    const overrides = opts?.overridesFor?.(i);
    out.push(generateFromSchema(schema, spec, overrides ? { overrides } : undefined));
  }
  return out;
}
