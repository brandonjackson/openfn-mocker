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
 * Since the mock mounts at /maximo, routes are registered relative to that mount
 * (so /oslc/os/... lines up with the real /maximo/oslc/os/... path). The adaptor's
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
  return 'id';
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
    // GET /oslc/os/<os> — lean collection (fetch). Honours oslc.select / oslc.where / oslc.pageSize.
    app.get('/oslc/os/:os', async (req) => {
      const { os } = req.params as { os: string };
      const q = (req.query ?? {}) as Record<string, any>;
      let members = applyWhere(store.list(os), q['oslc.where']);
      const pageSize = Number(q['oslc.pageSize']);
      if (Number.isFinite(pageSize) && pageSize > 0) members = members.slice(0, pageSize);
      const projected = members.map((m) => projectSelect(m, q['oslc.select']));
      return { member: projected, responseInfo: { totalCount: members.length } };
    });

    // GET /oslc/os/<os>/<id> — a single lean member.
    app.get('/oslc/os/:os/:id', async (req, reply) => {
      const { os, id } = req.params as { os: string; id: string };
      const member = store.get(os, id);
      if (!member) {
        reply.code(404);
        return { Error: { reasonCode: 'BMXAA0024E', message: `${os} ${id} not found` } };
      }
      return member;
    });

    // POST /oslc/os/<os> — create a new object (201, Location header).
    app.post('/oslc/os/:os', async (req, reply) => {
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

    // POST /oslc/os/<os>/<id> — update via method override (update / update75).
    // Maximo tunnels PATCH through POST with `x-methodoverride: PATCH`.
    app.post('/oslc/os/:os/:id', async (req, reply) => {
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

    // Sink for fetch()'s `postUrl` — the adaptor re-POSTs the body it fetched here.
    app.post('/collector', async () => ({ status: 'received' }));
  },

  seed,
};

export default plugin;
