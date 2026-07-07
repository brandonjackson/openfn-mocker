import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * OpenFn Collections — a hosted key/value store keyed by collection name. Bearer
 * token auth. Values live at /collections/:name/:key; listings at
 * /collections/:name. The adaptor's `collections` namespace (get / set / each /
 * remove) maps onto these REST routes. Each stored record is shaped
 * { key, value, created, updated } and kept under a store collection named after
 * `:name`.
 */

/** Turn a `*`-glob key pattern into a RegExp (used by the ?key= filter). */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

const plugin: MockSystemPlugin = {
  name: 'collections',
  // Collections authenticates with a Bearer token.
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-token' },
    fields: [
      { name: 'collections_endpoint', role: 'url' },
      { name: 'collections_token', role: 'secret', secret: { charset: 'hex', length: 40 } },
      { name: 'project_id', role: 'static', value: 'mock-project' },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // GET /collections/:name/:key — fetch one value (static-count route wins).
    app.get('/:name/:key', async (req, reply) => {
      const { name, key } = req.params as Record<string, any>;
      const found = store.get(String(name), String(key));
      if (!found) {
        reply.code(404);
        return { error: 'not_found' };
      }
      return { key: found.key, value: found.value };
    });

    // GET /collections/:name — list values, optionally filtered by ?key= glob.
    app.get('/:name', async (req) => {
      const name = String((req.params as Record<string, any>).name);
      const q = (req.query ?? {}) as Record<string, any>;
      let items = store.list(name);
      if (typeof q.key === 'string' && q.key.length && q.key !== '*') {
        const re = globToRegExp(q.key);
        items = items.filter((it) => re.test(String(it.key)));
      }
      return { items, cursor: null };
    });

    // POST /collections/:name — upsert one or many { key, value } pairs.
    app.post('/:name', async (req) => {
      const name = String((req.params as Record<string, any>).name);
      const body = (req.body ?? {}) as Record<string, any>;
      const incoming: Array<Record<string, any>> = Array.isArray(body.items)
        ? body.items
        : body.key != null
          ? [{ key: body.key, value: body.value }]
          : [];
      const now = nowIso();
      let upserted = 0;
      for (const item of incoming) {
        if (item == null || item.key == null) continue;
        const key = String(item.key);
        const existing = store.get(name, key);
        const record = {
          key,
          value: item.value,
          created: existing?.created ?? now,
          updated: now,
        };
        store.replace(name, key, record);
        upserted++;
      }
      return { upserted };
    });

    // DELETE /collections/:name/:key — remove one value.
    app.delete('/:name/:key', async (req, reply) => {
      const { name, key } = req.params as Record<string, any>;
      const removed = store.destroy(String(name), String(key));
      if (!removed) {
        reply.code(404);
        return { error: 'not_found' };
      }
      return { deleted: 1 };
    });

    // DELETE /collections/:name — remove every value in the collection.
    app.delete('/:name', async (req) => {
      const name = String((req.params as Record<string, any>).name);
      const keys = store.list(name).map((it) => String(it.key));
      for (const k of keys) store.destroy(name, k);
      return { deleted: keys.length };
    });
  },

  seed,
};

export default plugin;
