import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Resource Map (facility / resource mapping by collection). The resourcemap
 * adaptor's one business call is submitSite(collection_id, data) -> POST
 * /api/collections/:collection_id/sites.json (JSON body, HTTP Basic auth, with a
 * `content-disposition: form-data; name="site"` header quirk we simply accept).
 * The collection/site GET reads round out the sandbox. Auth is accept-all here.
 */

/** Next numeric site id (max existing + 1). */
function nextSiteId(store: DataStore): number {
  const ids = store.list('sites').map((s) => Number(s.id)).filter(Number.isFinite);
  return (ids.length ? Math.max(...ids) : 1000) + 1;
}

const plugin: MockSystemPlugin = {
  name: 'resourcemap',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // GET /api/collections.json — list collections.
    app.get('/api/collections.json', async () => store.list('collections'));

    // GET /api/collections/:collection_id/sites.json — sites in a collection.
    app.get('/api/collections/:collection_id/sites.json', async (req) => {
      const collectionId = Number((req.params as Record<string, any>).collection_id);
      const sites = store.list('sites', (s) => Number(s.collection_id) === collectionId);
      return { sites, name: 'Sites' };
    });

    // POST /api/collections/:collection_id/sites.json — submitSite.
    app.post('/api/collections/:collection_id/sites.json', async (req, reply) => {
      const collectionId = Number((req.params as Record<string, any>).collection_id);
      const body = (req.body ?? {}) as Record<string, any>;
      const id = body.id != null && String(body.id).length ? Number(body.id) : nextSiteId(store);
      const site = {
        id,
        collection_id: collectionId,
        name: body.name ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        properties: body.properties ?? {},
      };
      store.create('sites', String(id), site);
      reply.code(201);
      return site;
    });
  },

  seed,
};

export default plugin;
