import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Memento Database API v1. The adaptor targets https://api.mementodatabase.com/v1
 * and passes the API token as a `?token=` query parameter (there is no auth
 * header), so this system leaves auth open. It exposes libraries (with a field
 * schema) and their entries.
 */

/** Memento not-found error envelope. */
function notFound(message: string): Record<string, any> {
  return { error: 'Not Found', message };
}

const plugin: MockSystemPlugin = {
  name: 'memento',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiVersion', role: 'static', value: 'v1' },
      { name: 'token', role: 'secret', secret: { charset: 'alnum', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // GET /v1/libraries — list libraries.
    app.get('/v1/libraries', async () => ({ libraries: store.list('libraries') }));

    // GET /v1/libraries/:id — a library, including its field schema.
    app.get('/v1/libraries/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const library = store.get('libraries', id);
      if (!library) {
        reply.code(404);
        return notFound(`No library with id ${id}`);
      }
      return library;
    });

    // GET /v1/libraries/:id/entries — entries of a library.
    app.get('/v1/libraries/:id/entries', async () => ({ entries: store.list('entries') }));

    // GET /v1/libraries/:id/entries/:entryId — one entry.
    app.get('/v1/libraries/:id/entries/:entryId', async (req, reply) => {
      const entryId = String((req.params as Record<string, any>).entryId);
      const entry = store.get('entries', entryId);
      if (!entry) {
        reply.code(404);
        return notFound(`No entry with id ${entryId}`);
      }
      return entry;
    });

    // POST /v1/libraries/:id/entries — create an entry.
    app.post('/v1/libraries/:id/entries', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = randomUUID();
      const entry = {
        id,
        author: 'mock',
        createdTime: nowIso(),
        modifiedTime: nowIso(),
        ...body,
      };
      store.create('entries', id, entry);
      return entry;
    });

    // PUT /v1/libraries/:id/entries/:entryId — update/replace an entry.
    app.put('/v1/libraries/:id/entries/:entryId', async (req, reply) => {
      const entryId = String((req.params as Record<string, any>).entryId);
      const body = (req.body ?? {}) as Record<string, any>;
      const updated = store.update('entries', entryId, { ...body, modifiedTime: nowIso() });
      if (!updated) {
        reply.code(404);
        return notFound(`No entry with id ${entryId}`);
      }
      return updated;
    });
  },

  seed,
};

export default plugin;
