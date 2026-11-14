import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * IBM Maximo — OSLC / JSON REST API. The maximo adaptor uses the `request`
 * library and a Base64 `maxauth: <user:pass>` header (accept-all here). The
 * `endpoint` is supplied by the job, resolved against baseUrl; the real Maximo
 * REST surface for an object structure `<os>` is:
 *   GET  /maximo/oslc/os/<os>              -> lean collection { member: [...] }   (fetch)
 *   GET  /maximo/oslc/os/<os>/<id>         -> a single lean member
 *   POST /maximo/oslc/os/<os>              -> create (201)
 *   POST /maximo/oslc/os/<os>/<id>  with header `x-methodoverride: PATCH` +
 *        `patchtype: MERGE`                -> update (Maximo 7.6, JSON body) /
 *                                             update75 (Maximo 7.5, form body)
 * The mock's own /maximo mount is the system namespace, standing for the Maximo
 * host (the adaptor's baseUrl, e.g. https://maximo-demo76.mro.com), so routes keep
 * Maximo's /maximo context root: a job's endpoint is 'maximo/oslc/os/mxasset', as
 * against a real server, and the requests match the spec's /maximo/{apiRoot}/os/...
 * paths. The adaptor's
 * fetch() then POSTs the body it read to an arbitrary `postUrl`; a small /collector
 * sink is provided so that round-trip has somewhere to land. Note: Maximo's PATCH
 * override returns 200 (not 204), which the adaptor treats as success.
 */

/** Project a lean member down to `oslc.select` attributes (href kept). */
function projectSelect(record: any, select: unknown): any {
  if (typeof select !== 'string' || select.trim() === '' || select.includes('*')) return record;
  const attrs = select.split(',').map((s) => s.trim());
  const out: Record<string, any> = {};
  for (const a of attrs) if (a in record) out[a] = record[a];
  if (record.href) out.href = record.href;
  return out;
}

/** Light parse of an `oslc.where` clause: supports `field="value"` / `field=value` (AND-joined). */
function applyWhere(records: any[], where: unknown): any[] {
  if (typeof where !== 'string' || where.trim() === '') return records;
  const clauses = where.split(/\s+and\s+/i).map((c) => c.trim());
  const conditions = clauses
    .map((c) => /^([A-Za-z0-9_.]+)\s*=\s*"?([^"]*)"?$/.exec(c))
    .filter(Boolean) as RegExpExecArray[];
  if (conditions.length === 0) return records;
  return records.filter((r) => conditions.every(([, field, value]) => String(r[field]) === value));
}

/** Business key field for an object structure (assetnum for assets, wonum for WOs). */
function keyField(os: string): string {
  if (os === 'mxasset') return 'assetnum';
  if (os === 'mxwo') return 'wonum';
  if (os === 'mxinventory') return 'itemnum';
  return 'id';
}

/**
 * Legacy MIF REST (/maxrest/rest, Maximo 7.5/7.6) names records by MBO
 * (`workorder`, `asset`) or by object structure (`mxwo`, `mxasset`); both
 * resolve to the same seeded collections as the OSLC routes.
 */
const MBO_COLLECTION: Record<string, string> = { asset: 'mxasset', workorder: 'mxwo', inventory: 'mxinventory', invbalances: 'mxinvbal' };
const OS_MBO: Record<string, string> = Object.fromEntries(Object.entries(MBO_COLLECTION).map(([mbo, os]) => [os, mbo]));

/** A record as the legacy JSON serializer writes it: upper-case attributes, `{ content }` unless _compact=1. */
function legacyRecord(m: Record<string, any>, compact: boolean): Record<string, any> {
  const attrs: Record<string, any> = {};
  for (const [k, v] of Object.entries(m)) {
    if (k === 'href') continue;
    attrs[k.toUpperCase()] = compact ? v : { content: v };
  }
  return { rowstamp: '1000', Attributes: attrs };
}

/** Legacy query filters: any upper-case query parameter is an attribute equality match (STATUS=APPR). */
function legacyFilter(members: Record<string, any>[], q: Record<string, any>): Record<string, any>[] {
  const filters = Object.entries(q).filter(([k]) => !k.startsWith('_') && k === k.toUpperCase());
  return members.filter((m) => filters.every(([k, v]) => String(m[k.toLowerCase()] ?? '') === String(v).replace(/^[=~]+/, '')));
}

const plugin: MockSystemPlugin = {
  name: 'maximo',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'maxadmin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // GET /maximo/oslc/os/<os> — lean collection (fetch). Honours oslc.select / oslc.where / oslc.pageSize.
    app.get('/maximo/oslc/os/:os', async (req) => {
      const { os } = req.params as { os: string };
      const q = (req.query ?? {}) as Record<string, any>;
      let members = applyWhere(store.list(os), q['oslc.where']);
      const pageSize = Number(q['oslc.pageSize']);
      if (Number.isFinite(pageSize) && pageSize > 0) members = members.slice(0, pageSize);
      const projected = members.map((m) => projectSelect(m, q['oslc.select']));
      return { member: projected, responseInfo: { totalCount: members.length } };
    });

    // GET /maximo/oslc/os/<os>/<id> — a single lean member.
    app.get('/maximo/oslc/os/:os/:id', async (req, reply) => {
      const { os, id } = req.params as { os: string; id: string };
      const member = store.get(os, id);
      if (!member) {
        reply.code(404);
        return { Error: { reasonCode: 'BMXAA0024E', message: `${os} ${id} not found` } };
      }
      return member;
    });

    // POST /maximo/oslc/os/<os> — create a new object (201, Location header).
    app.post('/maximo/oslc/os/:os', async (req, reply) => {
      const { os } = req.params as { os: string };
      const body = (req.body ?? {}) as Record<string, any>;
      const kf = keyField(os);
      const id = String(body[kf] ?? `MOCK-${store.count(os) + 1}`);
      const href = `/maximo/oslc/os/${os}/${id}`;
      const member = { ...body, [kf]: id, href };
      store.create(os, id, member);
      reply.code(201);
      reply.header('location', href);
      return member;
    });

    // POST /maximo/oslc/os/<os>/<id> — update via method override (update / update75).
    // Maximo tunnels PATCH through POST with `x-methodoverride: PATCH`.
    app.post('/maximo/oslc/os/:os/:id', async (req, reply) => {
      const { os, id } = req.params as { os: string; id: string };
      const existing = store.get(os, id);
      if (!existing) {
        reply.code(404);
        return { Error: { reasonCode: 'BMXAA0024E', message: `${os} ${id} not found` } };
      }
      const merged = store.update(os, id, (req.body ?? {}) as object);
      reply.code(200);
      return merged;
    });

    // --- Legacy MIF REST (/maxrest/rest), the API the adaptor's README examples use ---
    // GET /maxrest/rest/mbo/<mbo> and /maxrest/rest/os/<os>: a filtered set in the
    // <MBO>MboSet / Query<OS>Response envelope, paged by _rsStart / _maxItems.
    const legacyQuery = (kind: 'mbo' | 'os') => async (req: any, reply: any) => {
      const name = String(req.params.name).toLowerCase();
      const mbo = kind === 'mbo' ? name : OS_MBO[name] ?? name.replace(/^mx/, '');
      const collection = MBO_COLLECTION[mbo] ?? (kind === 'os' ? name : mbo);
      const q = (req.query ?? {}) as Record<string, any>;
      const all = legacyFilter(store.list(collection), q);
      const start = Number(q._rsStart) || 0;
      const max = Number(q._maxItems) || all.length;
      const page = all.slice(start, start + max).map((m) => legacyRecord(m, String(q._compact) === '1'));
      const set = { rsStart: start, rsCount: page.length, rsTotal: all.length };
      const MBO = mbo.toUpperCase();
      reply.code(200);
      return kind === 'mbo'
        ? { [`${MBO}MboSet`]: { ...set, [MBO]: page } }
        : { [`Query${name.toUpperCase()}Response`]: { ...set, [`${name.toUpperCase()}Set`]: { [MBO]: page } } };
    };
    // GET /maxrest/rest/mbo/<mbo>/<id>: one record by its key.
    const legacyGet = async (req: any, reply: any) => {
      const name = String(req.params.name).toLowerCase();
      const found = store.get(MBO_COLLECTION[name] ?? name, String(req.params.id));
      if (!found) {
        reply.code(404);
        return { Error: { reasonCode: 'BMXAA0024E', message: `${name} ${req.params.id} not found`, statusCode: '404' } };
      }
      return { [name.toUpperCase()]: legacyRecord(found, String((req.query ?? {})._compact) === '1') };
    };
    // POST /maxrest/rest/mbo/<mbo>/<id>: update (update / update75 send JSON or a
    // form body, with x-method-override: PATCH); answers with the updated record.
    const legacyUpdate = async (req: any, reply: any) => {
      const mbo = String(req.params.name).toLowerCase();
      const collection = MBO_COLLECTION[mbo] ?? mbo;
      const id = String(req.params.id);
      if (!store.get(collection, id)) {
        reply.code(404);
        return { Error: { reasonCode: 'BMXAA0024E', message: `${mbo} ${id} not found`, statusCode: '404' } };
      }
      const body = Object.fromEntries(Object.entries((req.body ?? {}) as Record<string, any>).map(([k, v]) => [k.toLowerCase(), v]));
      const record = store.update(collection, id, body) as Record<string, any>;
      reply.code(200);
      return { [mbo.toUpperCase()]: legacyRecord(record, true) };
    };
    // Only what the adaptor's documented calls reach: fetch() on an MBO or object
    // structure, a record read, and update()/update75() on an MBO record.
    app.get('/maxrest/rest/mbo/:name', legacyQuery('mbo'));
    app.get('/maxrest/rest/mbo/:name/:id', legacyGet);
    app.post('/maxrest/rest/mbo/:name/:id', legacyUpdate);
    app.get('/maxrest/rest/os/:name', legacyQuery('os'));

    // Sink for fetch()'s `postUrl` — the adaptor re-POSTs the body it fetched here.
    app.post('/collector', async () => ({ status: 'received' }));
  },

  seed,
};

export default plugin;
