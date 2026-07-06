import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Microsoft Graph (graph.microsoft.com, v1.0). The msgraph adaptor authenticates
 * with `Authorization: Bearer <access_token>` and calls Graph REST resources —
 * the current user (/me), OneDrive/SharePoint drives, folders and files. Graph
 * wraps collections in a `{ value: [...] }` envelope; single resources are bare
 * objects. `create(resource, data)` maps to a generic POST against any resource,
 * so a wildcard POST handles it (registered last so specific routes win — there
 * are none for POST here, but the pattern is kept for clarity).
 */

const plugin: MockSystemPlugin = {
  name: 'msgraph',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-access-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'access_token', role: 'secret', secret: { charset: 'hex', length: 40 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // GET /v1.0/me — the signed-in user.
    app.get('/v1.0/me', async () => ({
      id: '00000000-0000-0000-0000-000000000001',
      displayName: 'Mock User',
      mail: 'user@contoso.com',
      userPrincipalName: 'user@contoso.com',
    }));

    // GET /v1.0/sites/:siteId/drives — drives on a site (collection envelope).
    app.get('/v1.0/sites/:siteId/drives', async () => ({
      value: store.list('drives'),
    }));

    // GET /v1.0/drives/:driveId/root/children — folder (root) contents.
    app.get('/v1.0/drives/:driveId/root/children', async () => ({
      value: store.list('items'),
    }));

    // GET /v1.0/drives/:driveId/items/:itemId — a single drive item.
    app.get('/v1.0/drives/:driveId/items/:itemId', async (req, reply) => {
      const { itemId } = req.params as Record<string, any>;
      const item = store.get('items', String(itemId));
      if (!item) {
        reply.code(404);
        return { error: { code: 'itemNotFound', message: 'The resource could not be found.' } };
      }
      return item;
    });

    // PUT /v1.0/drives/:driveId/items/:itemId/content — upload file content.
    app.put('/v1.0/drives/:driveId/items/:itemId/content', async (req, reply) => {
      const { itemId } = req.params as Record<string, any>;
      const body = req.body;
      const size =
        typeof body === 'string'
          ? Buffer.byteLength(body)
          : Buffer.byteLength(JSON.stringify(body ?? ''));
      const item = {
        id: String(itemId),
        name: 'uploaded',
        size,
        file: { mimeType: 'application/octet-stream' },
        lastModifiedDateTime: nowIso(),
      };
      store.create('items', item.id, item);
      reply.code(201);
      return item;
    });

    // GET /v1.0/drives/:driveId — a single drive.
    app.get('/v1.0/drives/:driveId', async (req, reply) => {
      const { driveId } = req.params as Record<string, any>;
      const drive = store.get('drives', String(driveId));
      if (!drive) {
        reply.code(404);
        return { error: { code: 'itemNotFound', message: 'The resource could not be found.' } };
      }
      return drive;
    });

    // POST /v1.0/* — generic create(resource, data). Graph echoes the created
    // resource with a generated id. Registered last so any specific POST routes
    // (none today) take precedence.
    app.post('/v1.0/*', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      reply.code(201);
      return { id: randomUUID(), ...body, createdDateTime: nowIso() };
    });
  },

  seed,
};

export default plugin;
