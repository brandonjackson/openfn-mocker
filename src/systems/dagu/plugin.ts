import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Dagu workflow engine. The dagu adaptor first logs in (POST /account/login
 * with `{ username, password }` JSON, reading `body.token.access_token`), then
 * sends that token as a Bearer credential on the generic get / post / request
 * verbs over the Dagu v1 REST API (under /api/v1). Listings come back under
 * `{ DAGs, Errors, HasError }`; a single DAG is wrapped in `{ DAG }`, and
 * actions (start/stop) are POSTed to the DAG path.
 */

const plugin: MockSystemPlugin = {
  name: 'dagu',
  // The adaptor authenticates via a login handshake, not a header on the first
  // request, so /account/login must be reachable without credentials.
  auth: { required: true, schemes: ['bearer'], exemptPaths: ['/account/login'] },
  credential: {
    type: 'userpass',
    authHeader: { scheme: 'basic', userField: 'username', passField: 'password' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Login handshake ---
    // The adaptor POSTs { username, password } here before any call and reads
    // body.token.access_token, which it then sends as a Bearer token.
    app.post('/account/login', async () => ({
      token: { access_token: 'mock-access-token' },
    }));

    // --- List DAGs ---
    app.get('/api/v1/dags', async () => ({
      DAGs: store.list('dags'),
      Errors: [],
      HasError: false,
    }));

    // --- Fetch one DAG by name ---
    app.get('/api/v1/dags/:name', async (req, reply) => {
      const name = String((req.params as Record<string, any>).name);
      const found = store.get('dags', name);
      if (!found) {
        reply.code(404);
        return { DAG: null, Errors: [`DAG ${name} not found`], HasError: true };
      }
      return { DAG: found, Errors: [], HasError: false };
    });

    // --- Trigger an action on a DAG (start / stop / retry) ---
    app.post('/api/v1/dags/:name', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const name = String((req.params as Record<string, any>).name);
      const existing = store.get('dags', name);
      if (existing && body.action === 'start') {
        store.update('dags', name, { status: 'running' });
      }
      return { ok: true };
    });
  },

  seed,
};

export default plugin;
