import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Azure Blob Storage, as reached by `@openfn/language-azure-storage`. The real
 * REST surface is `PUT/GET/HEAD https://<account>.blob.core.windows.net/<container>/<blob>`
 * authenticated with a SharedKey signature. The mock keeps blobs in an in-memory
 * 'blobs' collection keyed `<container>/<blob>`; blob names can contain slashes,
 * so routes use a `/:container/*` wildcard and rebuild the key from it. The
 * SharedKey signature is not modeled, so auth is accept-all.
 *  - PUT    -> upload (201, empty body, ETag/Last-Modified headers)
 *  - GET    -> download the stored content (404 BlobNotFound if missing)
 *  - HEAD   -> blob properties (headers only, no body)
 */

const plugin: MockSystemPlugin = {
  name: 'azure-storage',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'accountName', role: 'static', value: 'mockaccount' },
      { name: 'accountKey', role: 'secret', secret: { charset: 'alnum', length: 64 } },
      { name: 'containerName', role: 'static', value: 'mock-container' },
    ],
  },
  // The adaptor hardcodes https://<accountName>.blob.core.windows.net and never
  // reads a base URL (the `baseUrl` field above is inert), so `pnpm test:usage`
  // aliases the derived host (accountName is the static `mockaccount`) to the
  // mock. See src/systems/types.ts `hostAliases`.
  hostAliases: ['mockaccount.blob.core.windows.net'],

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // Blob names can contain slashes, so the blob path is the `*` wildcard; the
    // store key is `<container>/<blobName>`.
    const blobKey = (req: FastifyRequest): string => {
      const params = req.params as Record<string, any>;
      return `${params.container}/${params['*'] ?? ''}`;
    };

    // PUT /:container/<blob> — upload (create/overwrite) a block blob.
    app.put('/:container/*', async (req, reply) => {
      const key = blobKey(req);
      const raw = req.body;
      const content = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw);
      store.create('blobs', key, {
        key,
        content,
        contentType: String(req.headers['content-type'] ?? 'application/octet-stream'),
        contentLength: Buffer.byteLength(content),
        lastModified: nowIso(),
        etag: '"0x8MOCK"',
      });
      reply.code(201).header('etag', '"0x8MOCK"').header('last-modified', nowIso());
      return null; // Azure returns an empty body on a successful PUT Blob.
    });

    // GET /:container/<blob> — download blob content. exposeHeadRoute:false so
    // the explicit HEAD route below (getBlobProperties) doesn't collide with an
    // auto-generated HEAD.
    app.get('/:container/*', { exposeHeadRoute: false }, async (req, reply) => {
      const key = blobKey(req);
      const blob = store.get('blobs', key);
      if (!blob) {
        reply.code(404);
        return { error: 'BlobNotFound' };
      }
      // The adaptor's downloadBlob validates the response ETag, so echo the
      // blob's stored etag/last-modified (as the real Get Blob response does).
      reply
        .header('content-type', blob.contentType ?? 'application/octet-stream')
        .header('etag', blob.etag ?? '"0x8MOCK"')
        .header('last-modified', blob.lastModified ?? nowIso());
      return blob.content;
    });

    // HEAD /:container/<blob> — blob properties (headers only, no body).
    app.head('/:container/*', async (req, reply) => {
      const key = blobKey(req);
      const blob = store.get('blobs', key);
      if (!blob) {
        reply.code(404);
        return null;
      }
      reply
        .code(200)
        .header('content-length', String(blob.contentLength ?? 0))
        .header('last-modified', blob.lastModified ?? nowIso())
        .header('x-ms-blob-type', 'BlockBlob');
      return null;
    });
  },

  seed,
};

export default plugin;
