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
 * list, get, create and update files. The metadata routes (POST/PATCH
 * /drive/v3/files) create/patch by JSON body; the adaptor's typed create/update
 * instead stream file content as a multipart upload to the /upload/drive/v3
 * endpoints, which are modelled separately below. Create/update metadata may be
 * sent directly or wrapped in a `{ resource }` object, so both are unwrapped.
 */

/** Unwrap the file metadata from a `{ resource }` wrapper or a bare body. */
function resourceOf(body: Record<string, any>): Record<string, any> {
  return (body.resource && typeof body.resource === 'object' ? body.resource : body) as Record<
    string,
    any
  >;
}

/** Best-effort extract the "name" from a multipart/related upload body. */
function nameFromUploadBody(body: unknown): string | undefined {
  const raw = typeof body === 'string' ? body : body == null ? '' : JSON.stringify(body);
  return raw.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Drop the internal `contentBase64` field so it never leaks into a metadata response. */
function metadataOf(file: Record<string, any>): Record<string, any> {
  const { contentBase64: _omit, ...meta } = file;
  return meta;
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
  // The googleapis client hardcodes www.googleapis.com (no configurable base URL
  // — the `baseUrl` field above is inert), so `pnpm test:usage` aliases that host
  // to the mock. See src/systems/types.ts `hostAliases`.
  hostAliases: ['www.googleapis.com'],

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // GET /drive/v3/files — list files.
    app.get('/drive/v3/files', async () => ({
      files: store.list('files').map(metadataOf),
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

    // GET /drive/v3/files/:id — a single file. The adaptor's get() fires two
    // requests at this path: a metadata read (?fields=...) and, for the bytes, a
    // content download (?alt=media, responseType arraybuffer). We branch on
    // alt=media to return the raw file bytes; every other call returns metadata.
    app.get('/drive/v3/files/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const file = store.get('files', id);
      if (!file) {
        reply.code(404);
        return { error: { code: 404, message: 'File not found' } };
      }
      if ((req.query as Record<string, any>).alt === 'media') {
        const bytes = file.contentBase64 ? Buffer.from(file.contentBase64, 'base64') : Buffer.alloc(0);
        reply.type(file.mimeType ?? 'application/octet-stream');
        return reply.send(bytes);
      }
      return metadataOf(file);
    });

    // PATCH /drive/v3/files/:id — update file metadata.
    app.patch('/drive/v3/files/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      if (!store.get('files', id)) {
        reply.code(404);
        return { error: { code: 404, message: 'File not found' } };
      }
      const resource = resourceOf((req.body ?? {}) as Record<string, any>);
      return metadataOf(store.update('files', id, resource) ?? {});
    });

    // POST /upload/drive/v3/files — create() streams content here as a
    // multipart/related upload (uploadType=multipart), not to the metadata
    // endpoint above. The file metadata (name) rides in the multipart body.
    app.post('/upload/drive/v3/files', async (req) => {
      const id = randomUUID();
      const name = nameFromUploadBody(req.body) ?? 'Untitled';
      const file = {
        id,
        name,
        mimeType: 'application/octet-stream',
        kind: 'drive#file',
        webViewLink: `https://drive.google.com/file/d/${id}/view`,
        size: '11',
        createdTime: nowIso(),
      };
      store.create('files', id, file);
      return file;
    });

    // PATCH /upload/drive/v3/files/:id — update() streams replacement content
    // here (uploadType=multipart). Echo back the updated file.
    app.patch('/upload/drive/v3/files/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const existing = store.get('files', id);
      if (!existing) {
        reply.code(404);
        return { error: { code: 404, message: 'File not found' } };
      }
      const updated = store.update('files', id, {
        size: '11',
        webViewLink: `https://drive.google.com/file/d/${id}/view`,
      });
      return { id, name: updated?.name ?? existing.name, webViewLink: updated?.webViewLink, size: '11' };
    });
  },

  seed,
};

export default plugin;
