import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { BUCKET, REGION, objectRecord, seed, type S3Object } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Amazon S3, as reached by `@openfn/language-aws-s3`.
 *
 * The adaptor bundles @aws-sdk/client-s3 v3 and builds its client from the
 * credential's `region`, `accessKeyId` and `secretAccessKey` only (it never
 * reads `endpoint`), so requests go to the real AWS host in the SDK's default
 * virtual-hosted style: `https://<bucket>.s3.<region>.amazonaws.com/<key>`.
 * With the credential's `bucket` = mock-bucket and `region` = us-east-1 that is
 * one fixed host, aliased to this mock (`hostAliases`). So every route here is
 * relative to a bucket: the bucket comes from the Host header when it is an S3
 * virtual-hosted name, and is `mock-bucket` otherwise (the sandbox, tests).
 *
 * Served (restXml, as AWS's Smithy model in openfn-api-specs describes):
 *  - PUT  /<key>?x-id=PutObject          → put()   200, ETag header, empty body
 *  - GET  /?list-type=2&prefix=…         → list()  ListBucketResult XML
 *  - GET  /<key>?x-id=GetObject          → get()   the object's bytes
 * Errors use S3's XML envelope (`<Error><Code>NoSuchKey</Code>…`). The SigV4
 * signature is not verified, so auth is accept-all.
 */

const NS = 'http://s3.amazonaws.com/doc/2006-03-01/';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal XML writer: `el('Key', 'a')` → `<Key>a</Key>`; arrays of children are joined. */
function el(name: string, value: string | number | boolean | string[] | undefined): string {
  if (value === undefined) return '';
  const inner = Array.isArray(value) ? value.join('') : esc(String(value));
  return `<${name}>${inner}</${name}>`;
}

const requestId = () => randomBytes(8).toString('hex').toUpperCase();

function s3Error(reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, string> = {}) {
  const id = requestId();
  reply
    .code(status)
    .header('content-type', 'application/xml')
    .header('x-amz-request-id', id);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Error>${el('Code', code)}${el('Message', message)}${Object.entries(extra)
    .map(([k, v]) => el(k, v))
    .join('')}${el('RequestId', id)}</Error>`;
}

/** The bucket a request addresses: from an S3 virtual-hosted Host header, else the mock's one bucket. */
function bucketOf(req: FastifyRequest): string {
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(':')[0];
  const m = host.match(/^(.+?)\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/);
  return m ? m[1] : BUCKET;
}

/** The object key: the rest of the path, URL-decoded (keys may contain slashes). */
function keyOf(req: FastifyRequest): string {
  const raw = (req.params as Record<string, string>)['*'] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const plugin: MockSystemPlugin = {
  name: 'aws-s3',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'accessKeyId', role: 'username', value: 'AKIAMOCKMOCKMOCKMOCK' },
      { name: 'secretAccessKey', role: 'secret', secret: { charset: 'alnum', length: 40 } },
      { name: 'region', role: 'static', value: REGION },
      { name: 'bucket', role: 'static', value: BUCKET },
      // In the adaptor's configuration-schema ("useful for LocalStack"), but no
      // release reads it, so it is inert: requests reach the mock through the
      // host alias below, not through this URL.
      { name: 'endpoint', role: 'url' },
    ],
  },
  // The adaptor ignores `endpoint` and lets the SDK derive
  // https://<bucket>.s3.<region>.amazonaws.com, so `pnpm test:usage` aliases
  // that host (bucket and region are the static values above) to the mock.
  // See src/systems/types.ts `hostAliases`.
  hostAliases: [`${BUCKET}.s3.${REGION}.amazonaws.com`],
  // @openfn/language-aws-s3 1.1.3 and 1.1.4 (latest) fail to load at all:
  // their ESM bundle inlines @aws-sdk/client-s3's CommonJS, which calls
  // require("stream"), so importing the adaptor throws "Dynamic require of
  // "stream" is not supported" before any request is made. 1.1.2 is the last
  // release that runs (and the version adaptors-storybook documents).
  adaptorVersion: '1.1.2',

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // Object bodies are opaque bytes whatever their Content-Type (put() often
    // sends application/json), so keep every request body raw in this scope.
    app.removeAllContentTypeParsers();
    app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req: unknown, body: Buffer, done: (err: Error | null, body?: any) => void) =>
      done(null, body)
    );

    const objectId = (bucket: string, key: string) => `${bucket}/${key}`;

    // GET / — ListObjectsV2 (`list-type=2`). The v1 ListObjects shares the
    // path; it is not served, as the adaptor never calls it.
    app.get('/', async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      if (q['list-type'] !== '2') {
        return s3Error(reply, 501, 'NotImplemented', 'This mock serves ListObjectsV2 (list-type=2) only.');
      }
      const bucket = bucketOf(req);
      const prefix = q.prefix ?? '';
      const maxKeys = Math.max(0, Math.min(1000, Number.parseInt(q['max-keys'] ?? '1000', 10) || 0));
      const startAfter = q['continuation-token']
        ? Buffer.from(q['continuation-token'], 'base64url').toString('utf8')
        : q['start-after'] ?? '';
      const all = (store.list('objects', (o: S3Object) => o.bucket === bucket) as S3Object[])
        .filter((o) => o.key.startsWith(prefix) && o.key > startAfter)
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      const page = all.slice(0, maxKeys);
      const truncated = all.length > page.length;
      const contents = page.map((o) =>
        el('Contents', [el('Key', o.key), el('LastModified', o.lastModified), el('ETag', o.etag), el('Size', o.size), el('StorageClass', 'STANDARD')])
      );
      reply.header('content-type', 'application/xml').header('x-amz-request-id', requestId());
      return (
        `<?xml version="1.0" encoding="UTF-8"?>\n<ListBucketResult xmlns="${NS}">` +
        el('Name', bucket) +
        el('Prefix', prefix) +
        (q['start-after'] ? el('StartAfter', q['start-after']) : '') +
        (q['continuation-token'] ? el('ContinuationToken', q['continuation-token']) : '') +
        el('KeyCount', page.length) +
        el('MaxKeys', maxKeys) +
        el('IsTruncated', truncated) +
        (truncated && page.length ? el('NextContinuationToken', Buffer.from(page[page.length - 1].key).toString('base64url')) : '') +
        contents.join('') +
        '</ListBucketResult>'
      );
    });

    // PUT /<key> — PutObject (the SDK adds ?x-id=PutObject).
    app.put('/*', async (req, reply) => {
      const bucket = bucketOf(req);
      const key = keyOf(req);
      if (!key) return s3Error(reply, 400, 'InvalidRequest', 'An object key is required.');
      const raw = req.body;
      const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw == null ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw));
      const contentType = String(req.headers['content-type'] ?? 'application/octet-stream');
      const record = objectRecord(bucket, key, bytes, contentType);
      store.upsert('objects', objectId(bucket, key), record);
      reply
        .code(200)
        .header('etag', record.etag)
        .header('x-amz-server-side-encryption', 'AES256')
        .header('x-amz-request-id', requestId());
      return '';
    });

    // GET /<key> — GetObject (the SDK adds ?x-id=GetObject).
    app.get('/*', async (req, reply) => {
      const bucket = bucketOf(req);
      const key = keyOf(req);
      const o = store.get('objects', objectId(bucket, key)) as S3Object | undefined;
      if (!o) return s3Error(reply, 404, 'NoSuchKey', 'The specified key does not exist.', { Key: key });
      reply
        .code(200)
        .header('content-type', o.contentType)
        .header('content-length', String(o.size))
        .header('etag', o.etag)
        .header('last-modified', new Date(o.lastModified).toUTCString())
        .header('accept-ranges', 'bytes')
        .header('x-amz-server-side-encryption', 'AES256')
        .header('x-amz-request-id', requestId());
      return Buffer.from(o.base64, 'base64');
    });
  },

  seed,
};

export default plugin;
