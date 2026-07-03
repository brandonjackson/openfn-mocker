import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { parseMethodCall, serializeResponse, serializeFault } from '../shared/xmlrpc.js';
import { seed, UID } from './seed.js';

/**
 * OpenSPP (social-protection Digital Public Good, built on Odoo). The openspp
 * adaptor uses `odoo-await`, which speaks Odoo's XML-RPC external API over two
 * endpoints:
 *   POST /xmlrpc/2/common — `version` and `authenticate` (returns a uid int).
 *   POST /xmlrpc/2/object — `execute_kw(db, uid, pw, model, method, args, kwargs)`
 *     with method in { search_read, search, read, create, write, unlink }.
 *
 * Records live in store collections keyed by the Odoo model name (res.partner,
 * g2p.program, spp.area, ...). Domains are applied with the common Odoo
 * operators; requests and responses are XML, so this plugin parses/serializes
 * XML-RPC by hand (see ../shared/xmlrpc). Auth is accept-all.
 */

/** Apply one Odoo domain condition [field, op, value] to a record. */
function matchCondition(record: any, cond: any[]): boolean {
  if (!Array.isArray(cond) || cond.length < 3) return true;
  const [field, op, value] = cond;
  let actual = record[field];
  // Odoo many2one fields are stored as [id, label]; compare against the id.
  if (Array.isArray(actual)) actual = actual[0];
  switch (op) {
    case '=':
    case '==':
      return String(actual) === String(value);
    case '!=':
    case '<>':
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
    case 'ilike':
    case '=like':
    case '=ilike':
      return String(actual ?? '').toLowerCase().includes(String(value).toLowerCase());
    case 'in':
      return Array.isArray(value) && value.map(String).includes(String(actual));
    case 'not in':
      return Array.isArray(value) && !value.map(String).includes(String(actual));
    default:
      return true;
  }
}

/** Filter records by an Odoo domain (logical operators '&' '|' '!' are ANDed). */
function applyDomain(records: any[], domain: any): any[] {
  if (!Array.isArray(domain) || domain.length === 0) return records;
  const conditions = domain.filter((d) => Array.isArray(d));
  return records.filter((r) => conditions.every((c) => matchCondition(r, c)));
}

/** Project a record down to the requested fields (id always included). */
function projectFields(record: any, fields: any): any {
  if (!Array.isArray(fields) || fields.length === 0) return record;
  const out: Record<string, any> = { id: record.id };
  for (const f of fields) if (f in record) out[f] = record[f];
  return out;
}

/** Next integer id for a model collection (max existing + 1). */
function nextId(store: DataStore, model: string): number {
  const ids = store.list(model).map((r) => Number(r.id)).filter(Number.isFinite);
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

function executeKw(store: DataStore, params: any[]): any {
  // params: [db, uid, password, model, method, args, kwargs]
  const model = params[3];
  const method = params[4];
  const args: any[] = Array.isArray(params[5]) ? params[5] : [];
  const kwargs: Record<string, any> = params[6] && typeof params[6] === 'object' ? params[6] : {};

  switch (method) {
    case 'search_read': {
      const domain = args[0] ?? kwargs.domain ?? [];
      let records = applyDomain(store.list(model), domain);
      const offset = Number(kwargs.offset ?? 0) || 0;
      const limit = kwargs.limit != null ? Number(kwargs.limit) : undefined;
      if (offset) records = records.slice(offset);
      if (limit != null) records = records.slice(0, limit);
      return records.map((r) => projectFields(r, kwargs.fields));
    }
    case 'search': {
      const domain = args[0] ?? kwargs.domain ?? [];
      return applyDomain(store.list(model), domain).map((r) => Number(r.id));
    }
    case 'read': {
      const ids: any[] = Array.isArray(args[0]) ? args[0] : [args[0]];
      return ids
        .map((id) => store.get(model, String(id)))
        .filter((r) => r !== undefined)
        .map((r) => projectFields(r, kwargs.fields));
    }
    case 'create': {
      const values = args[0] && typeof args[0] === 'object' ? args[0] : {};
      const id = nextId(store, model);
      store.create(model, String(id), { id, ...values });
      return id;
    }
    case 'write': {
      const ids: any[] = Array.isArray(args[0]) ? args[0] : [args[0]];
      const values = args[1] && typeof args[1] === 'object' ? args[1] : {};
      for (const id of ids) store.update(model, String(id), values);
      return true;
    }
    case 'unlink': {
      const ids: any[] = Array.isArray(args[0]) ? args[0] : [args[0]];
      for (const id of ids) store.destroy(model, String(id));
      return true;
    }
    case 'fields_get':
      return {};
    default:
      throw new Error(`Unsupported model method: ${method}`);
  }
}

const plugin: MockSystemPlugin = {
  name: 'openspp',

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    const xml = (reply: FastifyReply) => reply.type('text/xml; charset=utf-8');

    // POST /xmlrpc/2/common — version / authenticate.
    app.post('/xmlrpc/2/common', async (req: FastifyRequest, reply) => {
      xml(reply);
      const call = parseMethodCall(String(req.body ?? ''));
      if (call.methodName === 'version') {
        return serializeResponse({
          server_version: '16.0',
          server_version_info: [16, 0, 0, 'final', 0, ''],
          server_serie: '16.0',
          protocol_version: 1,
        });
      }
      // authenticate(db, login, password, {}) -> uid (accept any credentials).
      return serializeResponse(UID);
    });

    // POST /xmlrpc/2/object — execute_kw dispatch.
    app.post('/xmlrpc/2/object', async (req: FastifyRequest, reply) => {
      xml(reply);
      const call = parseMethodCall(String(req.body ?? ''));
      if (call.methodName !== 'execute_kw') {
        return serializeFault(1, `Unsupported method: ${call.methodName}`);
      }
      try {
        return serializeResponse(executeKw(store, call.params));
      } catch (e) {
        return serializeFault(2, (e as Error).message);
      }
    });
  },

  seed,
};

export default plugin;
