import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, makeDisplayId } from './seed.js';

/**
 * Primero (port 4017) — child protection case management.
 *
 * Quirks this plugin models faithfully:
 *  - Token-exchange auth: POST /api/v2/tokens returns a bearer token. Subsequent
 *    calls are still accept-all (handled globally by createSystemServer).
 *  - Business fields are nested under a `data` object on every record.
 *  - List responses use the envelope `{ data: [...], metadata: { total, per, page } }`.
 *  - Single responses use `{ data: {...} }`.
 *
 * Endpoints are not plain CRUD (nested envelope + display-id generation), so
 * they are registered as custom handlers rather than via registerCrud.
 */

const DEFAULT_PER = 20;

/** Pull the entity out of a `{ data }` write envelope, tolerating a bare body. */
function extractData(body: any): Record<string, any> {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
      return { ...body.data };
    }
    return { ...body };
  }
  return {};
}

function toInt(v: unknown, fallback: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Loose free-text match against the JSON of a record's `data` block. */
function matchesQuery(record: any, query: string): boolean {
  if (!query) return true;
  const haystack = JSON.stringify(record?.data ?? record ?? {}).toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function listCollection(
  store: DataStore,
  collection: string,
  req: FastifyRequest
): { data: any[]; metadata: { total: number; per: number; page: number } } {
  const q = (req.query ?? {}) as Record<string, any>;
  const query = typeof q.query === 'string' ? q.query : Array.isArray(q.query) ? q.query[0] : '';
  const per = toInt(q.per, DEFAULT_PER);
  const page = toInt(q.page, 1);

  let items = store.list(collection);
  if (query) items = items.filter((it) => matchesQuery(it, query));
  const total = items.length;
  const start = (page - 1) * per;
  const pageItems = items.slice(start, start + per);
  return { data: pageItems, metadata: { total, per, page } };
}

const plugin: MockSystemPlugin = {
  name: 'primero',
  defaultPort: 4017,
  specFile: 'primero.schema.json',

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Token exchange: accept ANY body, never validate. ---
    app.post('/api/v2/tokens', async (_req, reply) => {
      reply.code(200);
      return { token: 'mock_primero_token' };
    });

    // --- Cases ---
    app.get('/api/v2/cases', async (req) => listCollection(store, 'cases', req));

    app.get('/api/v2/cases/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('cases', id);
      if (found === undefined) {
        reply.code(404);
        return { error: 'not found' };
      }
      return { data: found };
    });

    app.post('/api/v2/cases', async (req, reply) => {
      const data = extractData(req.body);
      const now = new Date();
      const seq = store.count('cases') + 1;
      const id = randomUUID();
      const record = {
        id,
        case_id: makeDisplayId('CP', now.getFullYear(), seq),
        status: 'open',
        registration_date: now.toISOString().slice(0, 10),
        owned_by: (req.mockAuth as any)?.username ?? 'caseworker1',
        created_at: now.toISOString(),
        data,
      };
      store.create('cases', id, record);
      reply.code(201);
      return { data: record };
    });

    app.patch('/api/v2/cases/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const existing = store.get('cases', id);
      if (existing === undefined) {
        reply.code(404);
        return { error: 'not found' };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const patchData = extractData(body);
      // Merge nested data; allow updating top-level status/owned_by if present.
      const merged = {
        ...existing,
        ...(typeof body.status === 'string' ? { status: body.status } : {}),
        ...(typeof body.owned_by === 'string' ? { owned_by: body.owned_by } : {}),
        data: { ...(existing.data ?? {}), ...patchData },
      };
      store.replace('cases', id, merged);
      return { data: merged };
    });

    // --- Incidents ---
    app.get('/api/v2/incidents', async (req) => listCollection(store, 'incidents', req));

    app.get('/api/v2/incidents/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('incidents', id);
      if (found === undefined) {
        reply.code(404);
        return { error: 'not found' };
      }
      return { data: found };
    });

    app.post('/api/v2/incidents', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const data = extractData(body);
      const now = new Date();
      const seq = store.count('incidents') + 1;
      const id = randomUUID();
      const record = {
        id,
        incident_id: makeDisplayId('IN', now.getFullYear(), seq),
        status: 'open',
        owned_by: (req.mockAuth as any)?.username ?? 'caseworker1',
        created_at: now.toISOString(),
        case_id: typeof body.case_id === 'string' ? body.case_id : data.case_id,
        data,
      };
      store.create('incidents', id, record);
      reply.code(201);
      return { data: record };
    });

    // --- Referrals ---
    app.post('/api/v2/referrals', async (req, reply) => {
      const data = extractData(req.body);
      const id = randomUUID();
      const record = {
        id,
        status: 'in_progress',
        created_at: new Date().toISOString(),
        data,
      };
      store.create('referrals', id, record);
      reply.code(200);
      return { data: record };
    });
  },

  seed,
};

export default plugin;
