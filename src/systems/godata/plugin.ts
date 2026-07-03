import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, LOGIN_TOKEN } from './seed.js';

/**
 * Go.Data — WHO outbreak investigation platform (a Digital Public Good).
 *
 * Faithful quirks the godata adaptor relies on:
 *  - Token auth by login: POST /users/login returns `{ id: <token>, ttl, userId }`
 *    and every later call carries the token as an `?access_token=` query param
 *    (accept-all here; the param is ignored).
 *  - List endpoints return BARE ARRAYS (no envelope): GET /outbreaks,
 *    /outbreaks/:id/cases, /outbreaks/:id/contacts, /locations, /reference-data.
 *  - A `?filter=` query param carries a JSON Loopback filter ({ where: {...} });
 *    the adaptor's get/upsert helpers use it to look records up before writing.
 *  - Upserts are a GET-then-POST/PUT the adaptor performs itself, so this mock
 *    only needs plain list/get/create/update per resource.
 */

/** Parse Go.Data's `?filter=` Loopback JSON param, tolerating malformed input. */
function parseFilter(value: unknown): any {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Apply the `where` clause of a Loopback filter (flat equality only). */
function applyFilter(items: any[], filter: any): any[] {
  const where = filter && typeof filter === 'object' ? filter.where : undefined;
  let out = items;
  if (where && typeof where === 'object') {
    out = out.filter((it) =>
      Object.entries(where).every(([k, v]) => {
        // Loopback `{ field: { eq: value } }` or bare `{ field: value }`.
        if (v && typeof v === 'object' && !Array.isArray(v) && 'eq' in (v as any)) {
          return String(it[k]) === String((v as any).eq);
        }
        return String(it[k]) === String(v);
      })
    );
  }
  if (filter && typeof filter.limit === 'number') out = out.slice(0, filter.limit);
  return out;
}

/** List a collection honouring a `?filter=` param if present. */
function listWithFilter(store: DataStore, collection: string, req: FastifyRequest): any[] {
  const q = (req.query ?? {}) as Record<string, any>;
  const filter = parseFilter(q.filter);
  const items = store.list(collection);
  return filter ? applyFilter(items, filter) : items;
}

const plugin: MockSystemPlugin = {
  name: 'godata',

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Token exchange (accept any credentials). ---
    app.post('/users/login', async (_req, reply) => {
      reply.code(200);
      return {
        id: LOGIN_TOKEN,
        ttl: 1209600,
        created: new Date().toISOString(),
        userId: 'user-mock-1',
      };
    });

    // --- Outbreaks ---
    app.get('/outbreaks', async (req) => listWithFilter(store, 'outbreaks', req));
    app.get('/outbreaks/count', async () => ({ count: store.count('outbreaks') }));
    app.get('/outbreaks/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('outbreaks', id);
      if (found === undefined) {
        reply.code(404);
        return { error: { statusCode: 404, name: 'Error', message: `Unknown "outbreak" id "${id}".` } };
      }
      return found;
    });
    app.post('/outbreaks', async (req, reply) => {
      const record = makeRecord(req.body, {});
      store.create('outbreaks', record.id, record);
      reply.code(200);
      return record;
    });
    app.put('/outbreaks/:id', async (req) => replaceRecord(store, 'outbreaks', req));

    // --- Cases + contacts (outbreak-scoped) ---
    for (const kind of ['cases', 'contacts'] as const) {
      app.get(`/outbreaks/:outbreakId/${kind}`, async (req) => {
        const outbreakId = String((req.params as Record<string, any>).outbreakId);
        const scoped = store.list(kind, (r) => r.outbreakId === outbreakId);
        const filter = parseFilter((req.query as Record<string, any>).filter);
        return filter ? applyFilter(scoped, filter) : scoped;
      });
      app.get(`/outbreaks/:outbreakId/${kind}/:id`, async (req, reply) => {
        const id = String((req.params as Record<string, any>).id);
        const found = store.get(kind, id);
        if (found === undefined) {
          reply.code(404);
          return { error: { statusCode: 404, message: `Unknown "${kind}" id "${id}".` } };
        }
        return found;
      });
      app.post(`/outbreaks/:outbreakId/${kind}`, async (req, reply) => {
        const outbreakId = String((req.params as Record<string, any>).outbreakId);
        const record = makeRecord(req.body, { outbreakId });
        store.create(kind, record.id, record);
        reply.code(200);
        return record;
      });
      app.put(`/outbreaks/:outbreakId/${kind}/:id`, async (req) => replaceRecord(store, kind, req));
    }

    // --- Reference data (locations, reference-data) ---
    for (const [route, collection] of [
      ['/locations', 'locations'],
      ['/reference-data', 'referenceData'],
    ] as const) {
      app.get(route, async (req) => listWithFilter(store, collection, req));
      app.get(`${route}/:id`, async (req, reply) => {
        const id = String((req.params as Record<string, any>).id);
        const found = store.get(collection, id);
        if (found === undefined) {
          reply.code(404);
          return { error: { statusCode: 404, message: `Unknown id "${id}".` } };
        }
        return found;
      });
      app.post(route, async (req, reply) => {
        const record = makeRecord(req.body, {});
        store.create(collection, record.id, record);
        reply.code(200);
        return record;
      });
      app.put(`${route}/:id`, async (req) => replaceRecord(store, collection, req));
    }
  },

  seed,
};

/** Build a stored record: keep the body, assign an id if none was supplied. */
function makeRecord(body: any, extra: Record<string, any>): Record<string, any> {
  const base = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  const id = typeof base.id === 'string' && base.id ? base.id : randomUUID();
  return { ...base, ...extra, id };
}

/** PUT handler shared by every resource: merge onto the existing record. */
function replaceRecord(store: DataStore, collection: string, req: FastifyRequest): any {
  const id = String((req.params as Record<string, any>).id);
  const existing = store.get(collection, id) ?? {};
  const body = (req.body ?? {}) as Record<string, any>;
  const merged = { ...existing, ...body, id };
  store.replace(collection, id, merged);
  return merged;
}

export default plugin;
