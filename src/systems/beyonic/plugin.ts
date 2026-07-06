import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso, genId } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Beyonic mobile-money payments. The adaptor authenticates with
 * `Authorization: Token <apiToken>` and talks to a DRF-style REST API mounted
 * under `/api`: creates return the created object, listings wrap records in
 * `{ results: [...] }`. The adaptor exposes createPayment, createContact and
 * createCollectionRequest; read endpoints are added for lookups. Ids are
 * integers.
 */

const plugin: MockSystemPlugin = {
  name: 'beyonic',
  auth: { required: true, schemes: ['token'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'token', value: 'mock-token' },
    fields: [
      { name: 'apiUrl', role: 'url' },
      { name: 'apiToken', role: 'secret', secret: { charset: 'hex', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Payments ---
    app.get('/payments', async () => ({ results: store.list('payments') }));

    app.post('/payments', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = genId();
      const payment = { ...body, id, state: 'scheduled', created: nowIso() };
      store.create('payments', String(id), payment);
      reply.code(201);
      return payment;
    });

    // --- Contacts ---
    app.get('/contacts', async () => ({ results: store.list('contacts') }));

    app.post('/contacts', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = genId();
      const contact = { ...body, id, created: nowIso() };
      store.create('contacts', String(id), contact);
      reply.code(201);
      return contact;
    });

    // --- Collection requests ---
    app.post('/collectionrequests', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = genId();
      const request = { ...body, id, status: 'pending', created: nowIso() };
      store.create('collectionrequests', String(id), request);
      reply.code(201);
      return request;
    });
  },

  seed,
};

export default plugin;
