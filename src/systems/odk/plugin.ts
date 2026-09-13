import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso, odkSystem } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * ODK Central (Open Data Kit — a data-collection Digital Public Good).
 *
 * Faithful quirks the odk adaptor relies on:
 *  - Session auth: POST /v1/sessions returns `{ token, expiresAt, createdAt }`
 *    and later calls send `Authorization: Bearer <token>` (accept-all here).
 *  - REST resources under /v1: projects and per-project forms are bare arrays.
 *  - Submissions are served through the OData endpoint
 *    GET /v1/projects/:id/forms/:xmlFormId.svc/Submissions, which returns
 *    `{ "@odata.context", value: [...] }` — each row carries ODK's `__id` and
 *    `__system` metadata (getSubmissions).
 *  - Those OData tables are read-only: Central creates a submission from XML
 *    (or OpenRosa), never from a JSON POST to the table. The JSON write path a
 *    workflow can drive is submission comments,
 *    GET/POST .../submissions/:instanceId/comments.
 */

/** The numeric id of the actor (user) the mock attributes writes to. */
const ACTOR_ID = 5;

/** Drop the mock's own bookkeeping keys (`_foo`) before returning a record. */
function stripInternal(record: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => !k.startsWith('_')));
}

/**
 * Central's REST serializer (`Frame.forApi()`) skips any field that is null or
 * undefined — an unencrypted project has no `keyId` key at all, a never-edited
 * form no `updatedAt` — so a seeded null must not reach the wire. This does not
 * apply to the OData submission tables, whose columns are fixed and where
 * `__system.reviewState` and friends really do come back as null.
 */
function forApi<T extends Record<string, any>>(record: T): Record<string, any> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== null && v !== undefined));
}

/** Submissions for one form, shaped as ODK OData rows (drops internal _formId). */
function submissionRows(store: DataStore, formId: string): any[] {
  return store
    .list('submissions', (s) => s._formId === formId)
    .map(({ _formId, ...row }) => row);
}

const plugin: MockSystemPlugin = {
  name: 'odk',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'email', role: 'email', value: 'fieldworker@example.org' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const origin = `http://localhost:${config.port}`;

    // --- Session token exchange (accept any credentials). ---
    app.post('/v1/sessions', async (_req, reply) => {
      reply.code(200);
      return {
        // Real ODK session tokens are long, URL-safe bearer strings.
        token: 'mockodkGZ4rF8pQ7wbN2vKcX1sYtLd6mHjE0auRoTp3ViSlB9nWfCkMbAgUeZ',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        createdAt: nowIso(),
      };
    });

    // --- Projects ---
    app.get('/v1/projects', async () => store.list('projects').map(forApi));
    app.get('/v1/projects/:projectId', async (req, reply) => {
      const id = String((req.params as Record<string, any>).projectId);
      const found = store.get('projects', id);
      if (found === undefined) {
        reply.code(404);
        return { code: 404.1, message: 'Could not find the resource you were looking for.' };
      }
      return forApi(found);
    });

    // --- Forms for a project ---
    app.get('/v1/projects/:projectId/forms', async (req) => {
      const projectId = Number((req.params as Record<string, any>).projectId);
      return store.list('forms', (f) => f.projectId === projectId).map(forApi);
    });
    app.get('/v1/projects/:projectId/forms/:xmlFormId', async (req, reply) => {
      const { projectId, xmlFormId } = req.params as Record<string, any>;
      const found = store.get('forms', `${projectId}/${xmlFormId}`);
      if (found === undefined) {
        reply.code(404);
        return { code: 404.1, message: 'Could not find the resource you were looking for.' };
      }
      return forApi(found);
    });

    // --- Submission attachments ---
    // GET .../submissions/:instanceId/attachments — list attachment names.
    // Real Central returns `[{ name, exists }]`; the adaptor reaches this (and
    // the download below) through its generic get()/request().
    app.get(
      '/v1/projects/:projectId/forms/:xmlFormId/submissions/:instanceId/attachments',
      async (req) => {
        const { instanceId } = req.params as Record<string, any>;
        return store
          .list('attachments', (a) => a.instanceId === String(instanceId))
          .map((a) => ({ name: a.name, exists: true }));
      }
    );

    // GET .../submissions/:instanceId/attachments/:filename — download the bytes.
    app.get(
      '/v1/projects/:projectId/forms/:xmlFormId/submissions/:instanceId/attachments/:filename',
      async (req, reply) => {
        const { instanceId, filename } = req.params as Record<string, any>;
        const att = store.get('attachments', `${instanceId}/${filename}`);
        if (!att) {
          reply.code(404);
          return { code: 404.1, message: 'Could not find the resource you were looking for.' };
        }
        reply.type(att.mimeType ?? 'application/octet-stream');
        return reply.send(Buffer.from(att.base64, 'base64'));
      }
    );

    // --- OData submissions: GET .../forms/:xmlFormId.svc/Submissions ---
    // Fastify treats the ".svc" as part of the literal segment; the adaptor
    // requests exactly `${xmlFormId}.svc`. Match on a param and strip the suffix.
    app.get('/v1/projects/:projectId/forms/:formSvc/Submissions', async (req, reply) => {
      const { projectId, formSvc } = req.params as Record<string, any>;
      const xmlFormId = String(formSvc).replace(/\.svc$/, '');
      const formKey = `${projectId}/${xmlFormId}`;
      if (store.get('forms', formKey) === undefined) {
        reply.code(404);
        return { code: 404.1, message: 'Could not find the resource you were looking for.' };
      }
      const rows = submissionRows(store, xmlFormId);
      const q = (req.query ?? {}) as Record<string, any>;
      const withCount = q.$count === 'true' || q.$count === true;
      const base = `${origin}/v1/projects/${projectId}/forms/${xmlFormId}.svc`;
      return {
        '@odata.context': `${base}/$metadata#Submissions`,
        ...(withCount ? { '@odata.count': rows.length } : {}),
        value: rows,
      };
    });

    // --- Submission comments: the real write path a JSON POST can drive ---
    // Central's OData tables are read-only (a submission is created by posting
    // XML to .../submissions, or through OpenRosa), so the generic `post()` demo
    // targets comments: POST .../submissions/:instanceId/comments { body }.
    const commentsRoute =
      '/v1/projects/:projectId/forms/:xmlFormId/submissions/:instanceId/comments';

    app.get(commentsRoute, async (req, reply) => {
      const { instanceId } = req.params as Record<string, any>;
      if (store.get('submissions', String(instanceId)) === undefined) {
        reply.code(404);
        return { code: 404.1, message: 'Could not find the resource you were looking for.' };
      }
      return store.list('comments').filter((c: any) => c._instanceId === instanceId).map(stripInternal);
    });

    app.post(commentsRoute, async (req, reply) => {
      const { instanceId } = req.params as Record<string, any>;
      if (store.get('submissions', String(instanceId)) === undefined) {
        reply.code(404);
        return { code: 404.1, message: 'Could not find the resource you were looking for.' };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      if (typeof body.body !== 'string' || body.body === '') {
        reply.code(400);
        return { code: 400.2, message: 'Required parameter body missing.' };
      }
      const comment = {
        body: body.body,
        actorId: ACTOR_ID,
        createdAt: nowIso(),
        _instanceId: String(instanceId),
      };
      store.create('comments', `${instanceId}/${store.list('comments').length + 1}`, comment);
      return stripInternal(comment);
    });
  },

  seed,
};

export default plugin;
