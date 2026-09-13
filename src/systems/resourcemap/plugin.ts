import { randomUUID } from 'node:crypto';
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
 * The collection reads round out the sandbox. Auth is accept-all here.
 *
 * Two site shapes, as in the real Rails app:
 *  - the *record* (`lat`/`lng`, `uuid`, `version`, `created_at`), which is what
 *    `Api::SitesController#create` renders — with `status: 200`, not 201;
 *  - the *query projection* (`lat`/`long`, `createdAt`), returned by the query
 *    endpoint GET /api/collections/:id.json inside
 *    `{ name, count, totalPages, sites }`. There is no
 *    GET /api/collections/:id/sites.json: the `api` namespace declares only
 *    `post 'sites'` on that member path.
 */

/** Default page size of the collection query endpoint. */
const PAGE_SIZE = 50;

/** Next numeric site id (max existing + 1). */
function nextSiteId(store: DataStore): number {
  const ids = store.list('sites').map((s) => Number(s.id)).filter(Number.isFinite);
  return (ids.length ? Math.max(...ids) : 1000) + 1;
}

/** Read a positive integer query param with a fallback. */
function intParam(q: Record<string, any>, key: string, fallback: number): number {
  const n = parseInt(String(q[key] ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Project a stored site record into the query API's site shape. */
function toQuerySite(site: Record<string, any>): Record<string, any> {
  return {
    id: site.id,
    name: site.name,
    createdAt: site.created_at,
    updatedAt: site.updated_at,
    lat: site.lat ?? null,
    long: site.lng ?? null,
    properties: site.properties ?? {},
    groups: site.groups ?? [],
  };
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
    /** Number of sites in a collection. */
    const siteCount = (collectionId: number): number =>
      store.list('sites', (s) => Number(s.collection_id) === collectionId).length;

    // GET /api/collections.json — list collections, each with its site count.
    app.get('/api/collections.json', async () =>
      store.list('collections').map((c) => ({ ...c, count: siteCount(Number(c.id)) }))
    );

    // GET /api/collections/:id.json — the query endpoint: a page of the sites in
    // a collection, under { name, count, totalPages, sites }.
    app.get('/api/collections/:id.json', async (req, reply) => {
      const id = Number((req.params as Record<string, any>).id);
      const collection = store.get('collections', String(id));
      if (!collection) {
        reply.code(422);
        return { message: 'Collection not found', error_code: 2 };
      }
      const q = (req.query ?? {}) as Record<string, any>;
      const pageSize = intParam(q, 'page_size', PAGE_SIZE);
      const page = intParam(q, 'page', 1);

      let sites = store.list('sites', (s) => Number(s.collection_id) === id);
      if (typeof q.name === 'string' && q.name.length) {
        sites = sites.filter((s) => String(s.name) === q.name);
      }
      if (typeof q.search === 'string' && q.search.length) {
        const needle = q.search.toLowerCase();
        sites = sites.filter((s) => JSON.stringify(s).toLowerCase().includes(needle));
      }

      const count = sites.length;
      const totalPages = Math.max(1, Math.ceil(count / pageSize));
      const pageSites = sites.slice((page - 1) * pageSize, page * pageSize);
      return {
        name: collection.name,
        count,
        totalPages,
        sites: pageSites.map(toQuerySite),
      };
    });

    // POST /api/collections/:collection_id/sites.json — submitSite. Rails
    // renders the created site record with `status: 200`.
    app.post('/api/collections/:collection_id/sites.json', async (req, reply) => {
      const collectionId = Number((req.params as Record<string, any>).collection_id);
      const body = (req.body ?? {}) as Record<string, any>;
      const id = body.id != null && String(body.id).length ? Number(body.id) : nextSiteId(store);
      const now = new Date().toISOString();
      const site = {
        id,
        collection_id: collectionId,
        name: body.name ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        properties: body.properties ?? {},
        location_mode: body.lat != null && body.lng != null ? 'manual' : 'none',
        uuid: randomUUID(),
        version: 1,
        created_at: now,
        updated_at: now,
      };
      store.create('sites', String(id), site);
      reply.code(200);
      return site;
    });
  },

  seed,
};

export default plugin;
