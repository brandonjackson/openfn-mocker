import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Ibipimo viral-load lab integration. The adaptor authenticates with a Bearer
 * token and talks to a small v1 REST surface: it POSTs viral-load requests,
 * POSTs to fetch queued results, and GETs the list of sites and sample
 * statuses. The generic get/post/request verbs target the same paths.
 */

const plugin: MockSystemPlugin = {
  name: 'ibipimo',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiToken', role: 'secret', secret: { charset: 'hex', length: 40 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST /api/v1/post-viral-load-requests — queue a viral-load request.
    app.post('/api/v1/post-viral-load-requests', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const requestId = randomUUID();
      store.create('vlrequests', requestId, { requestId, ...body, status: 'queued', created: nowIso() });
      reply.code(201);
      return { success: true, requestId, message: 'Viral load request queued' };
    });

    // POST /api/v1/ask-for-vl-results — fetch available viral-load results.
    app.post('/api/v1/ask-for-vl-results', async () => ({
      success: true,
      results: store.list('vlresults'),
    }));

    // GET /api/v1/sites — list configured sites.
    app.get('/api/v1/sites', async () => ({ sites: store.list('sites') }));

    // GET /api/v1/samples/status — list sample statuses.
    app.get('/api/v1/samples/status', async () => ({ samples: store.list('samples') }));
  },

  seed,
};

export default plugin;
