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

/**
 * Filter documents by a Frappe `filters` query value. Frappe accepts either a
 * list of `[field, op, value]` triples or a `{ field: value }` object; support
 * both since the adaptor passes whichever the job author wrote.
 */
function applyFilters(docs: any[], raw: unknown): any[] {
  if (typeof raw !== 'string') return docs;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return docs;
  }
  if (Array.isArray(parsed)) {
    const conditions = parsed.filter((c) => Array.isArray(c));
    return docs.filter((d) => conditions.every((c) => matchCondition(d, c)));
  }
  if (parsed && typeof parsed === 'object') {
    const entries = Object.entries(parsed);
    return docs.filter((d) => entries.every(([k, v]) => String(d[k]) === String(v)));
  }
  return docs;
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
    // GET /api/resource/<DocType> — getList. Honours fields/filters/limit params.
    app.get(RESOURCE, async (req) => {
      const { doctype } = req.params as { doctype: string };
      const q = (req.query ?? {}) as Record<string, any>;
      let docs = applyFilters(store.list(doctype), q.filters);
      const fields = parseFields(q.fields);
      const start = Number(q.limit_start ?? 0) || 0;
      const pageLen = q.limit_page_length != null ? Number(q.limit_page_length) : undefined;
      if (start) docs = docs.slice(start);
      if (pageLen != null && pageLen > 0) docs = docs.slice(0, pageLen);
      return { data: docs.map((d) => projectFields(d, fields)) };
    });

    // POST /api/resource/<DocType> — create. Frappe autonames when `name` is omitted.
    app.post(RESOURCE, async (req, reply) => {
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
      reply.code(201);
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

    // DELETE /api/resource/<DocType>/<name> — Frappe replies { message: "ok" }.
    app.delete(`${RESOURCE}/:name`, async (req, reply) => {
      const { doctype, name } = req.params as { doctype: string; name: string };
      if (!store.destroy(doctype, name)) {
        reply.code(404);
        return { exc_type: 'DoesNotExistError', _server_messages: `${doctype} ${name} not found` };
      }
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
