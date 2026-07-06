import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * OpenFn platform (Lightning API). The openfn adaptor exposes thin generic verbs
 * — request / get / post — over the Lightning REST API, authenticated with a
 * Bearer personal access token. Listings come back under an `{ items: [...] }`
 * envelope; a missing record yields 404 `{ error: 'not_found' }`. These
 * representative /jobs and /projects resources let a job list, create and read.
 */

const plugin: MockSystemPlugin = {
  name: 'openfn',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'access_token', role: 'secret', secret: { charset: 'hex', length: 40 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Jobs ---
    app.get('/jobs', async () => ({ items: store.list('jobs') }));

    app.post('/jobs', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = randomUUID();
      const job = {
        id,
        name: body.name ?? null,
        adaptor: body.adaptor ?? '@openfn/language-common',
        enabled: body.enabled ?? true,
        ...body,
        inserted_at: nowIso(),
      };
      job.id = id; // keep our id even if the body carried one
      store.create('jobs', id, job);
      reply.code(201);
      return job;
    });

    app.get('/jobs/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('jobs', id);
      if (!found) {
        reply.code(404);
        return { error: 'not_found' };
      }
      return found;
    });

    // --- Projects ---
    app.get('/projects', async () => ({ items: store.list('projects') }));

    app.get('/projects/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('projects', id);
      if (!found) {
        reply.code(404);
        return { error: 'not_found' };
      }
      return found;
    });
  },

  seed,
};

export default plugin;
