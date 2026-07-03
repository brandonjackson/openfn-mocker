import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { paginate } from '../../engine/response-generator.js';
import { seed } from './seed.js';

/**
 * OpenLMIS v3 (logistics-management Digital Public Good). The openlmis adaptor
 * is a generic client (get/post/put/request) hitting relative paths under /api.
 * Faithful quirks:
 *  - OAuth2 token: POST /api/oauth/token returns `{ access_token, token_type,
 *    expires_in }` (accept-all; the bearer is ignored afterwards).
 *  - Reference-data list endpoints paginate with Spring Data's
 *    `{ content, totalElements, totalPages, size, number, ... }` envelope.
 */

/** Build a Spring Data REST page envelope around a slice of items. */
function springPage(all: any[], req: FastifyRequest): Record<string, any> {
  const q = (req.query ?? {}) as Record<string, any>;
  const size = intParam(q.size, all.length || 1);
  const number = intParam(q.page, 0);
  const page = paginate(all, { offset: number * size, limit: size });
  const totalPages = size > 0 ? Math.ceil(all.length / size) : 1;
  return {
    content: page.items,
    totalElements: all.length,
    totalPages,
    size,
    number,
    numberOfElements: page.items.length,
    first: number === 0,
    last: number >= totalPages - 1,
    sort: { sorted: false, empty: true, unsorted: true },
  };
}

function intParam(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const plugin: MockSystemPlugin = {
  name: 'openlmis',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
      { name: 'clientId', role: 'static', value: 'user-client' },
      { name: 'clientSecret', role: 'secret', secret: { charset: 'hex', length: 32 } },
    ],
  },

  usage: [
    { fn: "get", signature: "get(path, options, callback?)", description: "Send a GET request to retrieve a resource from OpenLMIS.",
      code: "get('/facilities');", apiRef: "ex1" },
    { fn: "post", signature: "post(path, body, callback?)", description: "Send a POST request to create a resource, e.g. initiate a requisition.",
      code: "post(`/requisitions/initiate?program=${$.programId}&facility=${$.facilityId}`, {});", apiRef: "ex4" },
    { fn: "put", signature: "put(path, body, callback?)", description: "Send a PUT request to update an existing OpenLMIS resource.",
      code: "put('/programs/123', { name: 'Essential Meds', code: '123' });" },
    { fn: "request", signature: "request(method, path, body, options, callback?)", description: "Send a custom HTTP request (any method), e.g. to fetch an OAuth token.",
      code: "request('POST', '/oauth/token?grant_type=client_credentials', {});", apiRef: "ex0" },
  ],

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- OAuth2 token (accept any client credentials). ---
    app.post('/api/oauth/token', async (_req, reply) => {
      reply.code(200);
      return {
        access_token: 'mock_openlmis_token',
        token_type: 'bearer',
        expires_in: 3600,
        scope: 'read write',
        referenceDataUserId: randomUUID(),
      };
    });

    // --- Paginated reference-data + requisitions (Spring page envelope). ---
    for (const collection of ['facilities', 'orderables', 'requisitions', 'programs'] as const) {
      app.get(`/api/${collection}`, async (req) => springPage(store.list(collection), req));

      app.get(`/api/${collection}/:id`, async (req, reply) => {
        const id = String((req.params as Record<string, any>).id);
        const found = store.get(collection, id);
        if (found === undefined) {
          reply.code(404);
          return { message: `${collection} ${id} not found`, messageKey: 'error.notFound' };
        }
        return found;
      });
    }

    // --- Create a requisition (POST /api/requisitions/initiate is the real
    // trigger; accept a plain POST /api/requisitions for the generic adaptor). ---
    app.post('/api/requisitions', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = typeof body.id === 'string' && body.id ? body.id : randomUUID();
      const record = { status: 'INITIATED', emergency: false, ...body, id };
      store.create('requisitions', id, record);
      reply.code(201);
      return record;
    });

    // POST /api/requisitions/initiate?program=&facility=&... — OpenLMIS's real
    // initiate endpoint; creates a skeleton requisition.
    app.post('/api/requisitions/initiate', async (req, reply) => {
      const q = (req.query ?? {}) as Record<string, any>;
      const id = randomUUID();
      const record = {
        id,
        status: 'INITIATED',
        emergency: q.emergency === 'true',
        program: { id: q.program },
        facility: { id: q.facility },
        processingPeriod: { id: q.processingPeriod },
        requisitionLineItems: [],
      };
      store.create('requisitions', id, record);
      reply.code(201);
      return record;
    });
  },

  seed,
};

export default plugin;
