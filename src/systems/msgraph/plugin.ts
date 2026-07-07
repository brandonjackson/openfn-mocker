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
  // The adaptor hardcodes graph.microsoft.com (no configurable base URL — the
  // `baseUrl` field above is inert), so `pnpm test:usage` aliases that host to
  // the mock. See src/systems/types.ts `hostAliases`.
  hostAliases: ['graph.microsoft.com'],

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

    // GET /v1.0/drives/:driveId/items/:itemId/children — folder children by
    // item id. getFolder always addresses a folder as items/<id>/children
    // (with 'root' as the id for the top level), so this is the route it hits.
    app.get('/v1.0/drives/:driveId/items/:itemId/children', async () => ({
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

    // PUT /v1.0/_uploadSession/:id — the second leg of uploadFile's resumable
    // upload. createUploadSession (below) hands the adaptor this URL; it then
    // PUTs the bytes here and expects the finished driveItem back.
    app.put('/v1.0/_uploadSession/:id', async (req, reply) => {
      const body = req.body;
      const size =
        typeof body === 'string'
          ? Buffer.byteLength(body)
          : Buffer.byteLength(JSON.stringify(body ?? ''));
      const id = randomUUID();
      const item = {
        id,
        name: 'uploaded',
        size,
        file: { mimeType: 'application/octet-stream' },
        lastModifiedDateTime: nowIso(),
      };
      store.create('items', id, item);
      reply.code(201);
      return item;
    });

    // POST /v1.0/* — generic create(resource, data), plus uploadFile's
    // createUploadSession leg. Graph echoes the created resource with a
    // generated id; a `.../createUploadSession` POST instead returns an
    // uploadUrl the adaptor then PUTs to (see /_uploadSession above). Registered
    // last so any specific POST routes take precedence.
    app.post('/v1.0/*', async (req, reply) => {
      const tail = String((req.params as Record<string, any>)['*'] ?? '');
      if (tail.endsWith('createUploadSession')) {
        // Point the upload URL back at this same origin. uploadFile only runs
        // through the alias-proxy (graph.microsoft.com over TLS), so the host
        // here is that aliased host and https is correct.
        const host = req.headers.host ?? '127.0.0.1';
        const sessionId = randomUUID().replace(/-/g, '').slice(0, 16);
        return {
          uploadUrl: `https://${host}/v1.0/_uploadSession/${sessionId}`,
          expirationDateTime: nowIso(),
        };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      reply.code(201);
      return { id: randomUUID(), ...body, createdDateTime: nowIso() };
    });
  },

  seed,
};

export default plugin;
