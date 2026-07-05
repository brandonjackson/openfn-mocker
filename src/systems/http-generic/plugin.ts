import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * http-generic (port 4014) — a spec-less catch-all. Any path works.
 *
 * Collection key = the request path minus its leading slash. So:
 *   POST /api/v1/referrals            -> stores under collection 'api/v1/referrals'
 *   GET  /api/v1/referrals            -> lists that collection
 *   GET  /api/v1/referrals/<id>       -> single record (collection 'api/v1/referrals', id <id>)
 *   PUT/PATCH/DELETE /api/v1/referrals/<id> -> replace / update / destroy
 *
 * Every stored/echoed record carries `id`, `_createdAt`, and a `_mock` echo
 * ({ method, path, headers, body }). This plugin is the reference for spec-less
 * systems; the store is a plain per-path Map.
 */

function mockEcho(req: FastifyRequest, path: string): Record<string, any> {
  return {
    method: req.method,
    path: '/' + path,
    headers: req.headers,
    body: req.body ?? null,
  };
}

/** Normalize a body into an object base (raw string/primitive -> { _raw }). */
function objectBase(body: any): Record<string, any> {
  if (body && typeof body === 'object' && !Array.isArray(body)) return { ...body };
  if (body === undefined || body === null) return {};
  return { _raw: body };
}

function toRecord(body: any, req: FastifyRequest, path: string): Record<string, any> {
  const base = objectBase(body);
  return {
    ...base,
    id: base.id ?? randomUUID(),
    _createdAt: new Date().toISOString(),
    _mock: mockEcho(req, path),
  };
}

const plugin: MockSystemPlugin = {
  name: 'http-generic',
  // The OpenFn adaptor for this catch-all is @openfn/language-http.
  adaptorName: 'http',
  // The generic http adaptor talks to arbitrary endpoints with arbitrary (or no)
  // auth, so this catch-all never requires credentials.
  auth: { required: false },
  credential: {
    type: 'none',
    fields: [{ name: 'baseUrl', role: 'url' }],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // Everything this catch-all serves is echo-grade, not a modeled API shape;
    // tag it so the request log reports fidelity honestly.
    app.addHook('onRequest', async (req) => {
      req.mockFidelity = 'generic';
    });

    const wildPath = (req: FastifyRequest): string =>
      String((req.params as Record<string, any>)['*'] ?? '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
    const hasCollection = (name: string): boolean => store.collections().includes(name);

    // POST /* -> create under collection = full path.
    app.post('/*', async (req, reply) => {
      const path = wildPath(req);
      const collection = path || 'root';
      const record = toRecord(req.body, req, path);
      store.create(collection, String(record.id), record);
      reply.code(201);
      return record;
    });

    // GET /* -> single (parent/id) if it resolves, else list, else empty echo.
    app.get('/*', async (req) => {
      const path = wildPath(req);
      if (hasCollection(path)) {
        const items = store.list(path);
        return { items, count: items.length, _mock: mockEcho(req, path) };
      }
      const segs = path.split('/').filter(Boolean);
      if (segs.length > 1) {
        const id = segs[segs.length - 1];
        const parent = segs.slice(0, -1).join('/');
        if (hasCollection(parent)) {
          const item = store.get(parent, id);
          if (item !== undefined) return item;
        }
      }
      return { items: [], _mock: mockEcho(req, path) };
    });

    const parentAndId = (path: string): { parent: string; id: string } => {
      const segs = path.split('/').filter(Boolean);
      const id = segs[segs.length - 1] ?? '';
      const parent = segs.slice(0, -1).join('/') || 'root';
      return { parent, id };
    };

    // PUT /* -> full replace.
    app.put('/*', async (req) => {
      const path = wildPath(req);
      const { parent, id } = parentAndId(path);
      const record = {
        ...objectBase(req.body),
        id,
        _updatedAt: new Date().toISOString(),
        _mock: mockEcho(req, path),
      };
      store.replace(parent, id, record);
      return record;
    });

    // PATCH /* -> shallow update, or create-then-update if the record is absent.
    // This mock is permissive: any path works, so a PATCH to an unseeded path
    // upserts rather than 404s (a fresh record is created and the patch applied).
    app.patch('/*', async (req) => {
      const path = wildPath(req);
      const { parent, id } = parentAndId(path);
      const patch = {
        ...objectBase(req.body),
        _updatedAt: new Date().toISOString(),
      };
      const updated = store.update(parent, id, patch);
      if (updated !== undefined) return updated;
      const record = {
        ...patch,
        id,
        _createdAt: new Date().toISOString(),
        _mock: mockEcho(req, path),
      };
      store.create(parent, id, record);
      return record;
    });

    // DELETE /* -> destroy. Idempotent: deleting an absent record still 200s,
    // matching this mock's "any path works" philosophy.
    app.delete('/*', async (req) => {
      const path = wildPath(req);
      const { parent, id } = parentAndId(path);
      store.destroy(parent, id);
      return { deleted: [id] };
    });
  },

  // Catch-all needs no seed data.
  seed(_store: DataStore, _config: SystemConfig): void {
    /* intentionally empty */
  },
};

export default plugin;
