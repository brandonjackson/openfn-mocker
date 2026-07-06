import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Google Drive v3 (www.googleapis.com/drive/v3). The googledrive adaptor
 * authenticates with a Bearer access token and calls the Drive Files resource:
 * list, get, create and update files/folders. Create/update accept the file
 * metadata either directly or wrapped in a `{ resource }` object (the adaptor's
 * `create('files', { resource: {...} })` shape), so both are unwrapped here.
 */

/** Unwrap the file metadata from a `{ resource }` wrapper or a bare body. */
function resourceOf(body: Record<string, any>): Record<string, any> {
  return (body.resource && typeof body.resource === 'object' ? body.resource : body) as Record<
    string,
    any
  >;
}

const plugin: MockSystemPlugin = {
  name: 'googledrive',
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
    // GET /drive/v3/files — list files.
    app.get('/drive/v3/files', async () => ({
      files: store.list('files'),
      incompleteSearch: false,
      kind: 'drive#fileList',
    }));

    // POST /drive/v3/files — create a file/folder.
    app.post('/drive/v3/files', async (req) => {
      const resource = resourceOf((req.body ?? {}) as Record<string, any>);
      const id = randomUUID();
      const file = {
        id,
        name: resource.name ?? 'Untitled',
        mimeType: resource.mimeType ?? 'application/vnd.google-apps.folder',
        kind: 'drive#file',
      };
      store.create('files', id, file);
      return file;
    });

    // GET /drive/v3/files/:id — a single file.
    app.get('/drive/v3/files/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const file = store.get('files', id);
      if (!file) {
        reply.code(404);
        return { error: { code: 404, message: 'File not found' } };
      }
      return file;
    });

    // PATCH /drive/v3/files/:id — update file metadata.
    app.patch('/drive/v3/files/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      if (!store.get('files', id)) {
        reply.code(404);
        return { error: { code: 404, message: 'File not found' } };
      }
      const resource = resourceOf((req.body ?? {}) as Record<string, any>);
      return store.update('files', id, resource);
    });
  },

  seed,
};

export default plugin;
