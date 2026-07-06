import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Zata tax compliance. The zata adaptor exposes generic get / post / put /
 * request verbs over the Zata REST API, authenticated with a Bearer API token.
 * A sale is POSTed to /transaction/sale and echoed back with a generated id and
 * an `accepted` status; transactions can then be read by id or listed.
 */

const plugin: MockSystemPlugin = {
  name: 'zata',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiToken', role: 'secret', secret: { charset: 'hex', length: 32 } },
      { name: 'apiVersion', role: 'static', value: 'v1' },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Record a sale ---
    app.post('/transaction/sale', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = randomUUID();
      const transaction = {
        status: 'accepted',
        ...body,
        id,
        timestamp: nowIso(),
      };
      store.create('transactions', id, transaction);
      reply.code(201);
      return transaction;
    });

    // --- Read one transaction by id ---
    app.get('/transaction/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('transactions', id);
      if (!found) {
        reply.code(404);
        return { error: 'not_found' };
      }
      return found;
    });

    // --- List transactions ---
    app.get('/transactions', async () => ({ transactions: store.list('transactions') }));
  },

  seed,
};

export default plugin;
