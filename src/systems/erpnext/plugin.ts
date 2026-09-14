import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowStamp } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * ERPNext / Frappe — REST DocType API. The erpnext adaptor drives it through
 * `frappe-js-sdk`, which authenticates with `Authorization: token <apiKey>:<apiSecret>`
 * (accept-all here) and speaks the standard Frappe REST surface:
 *   GET    /api/resource/<DocType>            -> { data: [ ...docs ] }   (getList)
 *   POST   /api/resource/<DocType>            -> { data: { ...doc } }    (create)
 *   GET    /api/resource/<DocType>/<name>     -> { data: { ...doc } }    (read)
 *   PUT    /api/resource/<DocType>/<name>     -> { data: { ...doc } }    (update)
 *   DELETE /api/resource/<DocType>/<name>     -> { message: "ok" }       (deleteRecord)
 *   GET    /api/method/frappe.client.get_count -> { message: <int> }     (getCount)
 *
 * Resource reads/writes wrap the document in a `data` envelope; the *method* API
 * (get_count) and DELETE return a `message` envelope — the SDK reads
 * `response.data.data` vs `response.data.message` accordingly, so the mock mirrors
 * both. Records live in a store collection named after the DocType, keyed by the
 * document `name` (Frappe's primary key).
 */

const RESOURCE = '/api/resource/:doctype';

/** Parse a Frappe `fields` query value (JSON array like `["name","customer_name"]`). */
function parseFields(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : undefined;
  } catch {
    return undefined;
  }
}

/** Project a document to the requested fields (`["*"]` or empty = whole doc). */
function projectFields(doc: any, fields: string[] | undefined): any {
  if (!fields || fields.length === 0 || fields.includes('*')) return doc;
  const out: Record<string, any> = { name: doc.name };
  for (const f of fields) if (f in doc) out[f] = doc[f];
  return out;
}

/** Apply one Frappe filter condition [field, op, value] to a document. */
function matchCondition(doc: any, cond: any[]): boolean {
  if (!Array.isArray(cond) || cond.length < 3) return true;
  const [field, op, value] = cond;
  const actual = doc[field];
  switch (String(op).toLowerCase()) {
    case '=':
    case '==':
      return String(actual) === String(value);
    case '!=':
      return String(actual) !== String(value);
    case '>':
      return actual > value;
    case '>=':
      return actual >= value;
    case '<':
      return actual < value;
    case '<=':
      return actual <= value;
    case 'like':
      return String(actual ?? '').toLowerCase().includes(String(value).replace(/%/g, '').toLowerCase());
    case 'in':
      return Array.isArray(value) && value.map(String).includes(String(actual));
    default:
      return true;
  }
}

/** True if `doc` satisfies a parsed `filters`/`or_filters` value (list of triples
 * ANDed, or `{ field: value }` ANDed) — the shared half of applyFilters. */
function matchesParsedFilter(doc: any, parsed: any): boolean {
  if (Array.isArray(parsed)) {
    const conditions = parsed.filter((c) => Array.isArray(c));
    return conditions.every((c) => matchCondition(doc, c));
  }
  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed).every(([k, v]) => String(doc[k]) === String(v));
  }
  return true;
}

/**
 * Filter documents by Frappe `filters` (ANDed) and `or_filters` (ORed) query
 * values. Frappe accepts either a list of `[field, op, value]` triples or a
 * `{ field: value }` object for each; support both since the adaptor passes
 * whichever the job author wrote. When both are given a document must satisfy
 * every `filters` condition AND at least one `or_filters` condition.
 */
function applyFilters(docs: any[], rawFilters: unknown, rawOrFilters?: unknown): any[] {
  const parse = (raw: unknown): any => {
    if (typeof raw !== 'string') return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  const filters = parse(rawFilters);
  const orFilters = parse(rawOrFilters);
  return docs.filter((d) => {
    if (filters !== undefined && !matchesParsedFilter(d, filters)) return false;
    if (Array.isArray(orFilters) && orFilters.length > 0) {
      const conditions = orFilters.filter((c) => Array.isArray(c));
      if (conditions.length > 0 && !conditions.some((c) => matchCondition(d, c))) return false;
    }
    return true;
  });
}

const plugin: MockSystemPlugin = {
  name: 'erpnext',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiKey', role: 'secret', secret: { charset: 'hex', length: 15 } },
      { name: 'apiSecret', role: 'secret', secret: { charset: 'hex', length: 15 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // GET /api/resource/<DocType> — getList. Honours fields/filters/or_filters/limit
    // params. The adaptor's frappe-js-sdk always sends `limit`, never
    // `limit_page_length` (Frappe's REST layer treats them as aliases, so both are
    // accepted here — see openfn-api-specs' erpnext source.json for the SDK read
    // that caught this: the mock's pagination never actually triggered from real
    // adaptor calls before this fix).
    app.get(RESOURCE, async (req) => {
      const { doctype } = req.params as { doctype: string };
      const q = (req.query ?? {}) as Record<string, any>;
      let docs = applyFilters(store.list(doctype), q.filters, q.or_filters);
      const fields = parseFields(q.fields);
      const start = Number(q.limit_start ?? 0) || 0;
      const limit = q.limit ?? q.limit_page_length;
      const pageLen = limit != null ? Number(limit) : undefined;
      if (start) docs = docs.slice(start);
      if (pageLen != null && pageLen > 0) docs = docs.slice(0, pageLen);
      return { data: docs.map((d) => projectFields(d, fields)) };
    });

    // POST /api/resource/<DocType> — create. Frappe autonames when `name` is
    // omitted. Real Frappe never sets an explicit status here (frappe/api/v1.py
    // create_doc), so the response falls through to the framework default, 200 —
    // not the 201 a generic REST convention would suggest.
    app.post(RESOURCE, async (req) => {
      const { doctype } = req.params as { doctype: string };
      const body = (req.body ?? {}) as Record<string, any>;
      const name = String(body.name ?? `${doctype}-${store.count(doctype) + 1}`.replace(/\s+/g, '-'));
      const doc = {
        doctype,
        ...body,
        name,
        creation: nowStamp(),
        modified: nowStamp(),
        owner: 'Administrator',
      };
      store.create(doctype, name, doc);
      return { data: doc };
    });

    // GET /api/resource/<DocType>/<name> — read a single document.
    app.get(`${RESOURCE}/:name`, async (req, reply) => {
      const { doctype, name } = req.params as { doctype: string; name: string };
      const doc = store.get(doctype, name);
      if (!doc) {
        reply.code(404);
        return { exc_type: 'DoesNotExistError', _server_messages: `${doctype} ${name} not found` };
      }
      return { data: doc };
    });

    // PUT /api/resource/<DocType>/<name> — update (shallow merge of the changes).
    app.put(`${RESOURCE}/:name`, async (req, reply) => {
      const { doctype, name } = req.params as { doctype: string; name: string };
      const existing = store.get(doctype, name);
      if (!existing) {
        reply.code(404);
        return { exc_type: 'DoesNotExistError', _server_messages: `${doctype} ${name} not found` };
      }
      const merged = store.update(doctype, name, { ...(req.body as object), modified: nowStamp() });
      return { data: merged };
    });

    // DELETE /api/resource/<DocType>/<name> — Frappe replies { message: "ok" }
    // with status 202 (frappe/api/v1.py delete_doc sets http_status_code = 202
    // explicitly; it is not the 200/204 a generic REST convention would suggest).
    app.delete(`${RESOURCE}/:name`, async (req, reply) => {
      const { doctype, name } = req.params as { doctype: string; name: string };
      if (!store.destroy(doctype, name)) {
        reply.code(404);
        return { exc_type: 'DoesNotExistError', _server_messages: `${doctype} ${name} not found` };
      }
      reply.code(202);
      return { message: 'ok' };
    });

    // GET /api/method/frappe.client.get_count — getCount. Replies { message: <int> }.
    app.get('/api/method/frappe.client.get_count', async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      const doctype = String(q.doctype ?? '');
      const count = applyFilters(store.list(doctype), q.filters).length;
      return { message: count };
    });
  },

  seed,
};

export default plugin;
