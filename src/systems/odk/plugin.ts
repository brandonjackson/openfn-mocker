import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';

/**
 * ODK Central (Open Data Kit — a data-collection Digital Public Good).
 *
 * Faithful quirks the odk adaptor relies on:
 *  - Session auth: POST /v1/sessions returns `{ token, expiresAt }` and later
 *    calls send `Authorization: Bearer <token>` (accept-all here).
 *  - REST resources under /v1: projects and per-project forms are bare arrays.
 *  - Submissions are served through the OData endpoint
 *    GET /v1/projects/:id/forms/:xmlFormId.svc/Submissions, which returns
 *    `{ "@odata.context", value: [...] }` — each row carries ODK's `__id` and
 *    `__system` metadata (getSubmissions).
 */

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

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const origin = `http://localhost:${config.port}`;

    // --- Session token exchange (accept any credentials). ---
    app.post('/v1/sessions', async (_req, reply) => {
      reply.code(200);
      return {
        token: 'mock_odk_session_token',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        createdAt: nowIso(),
      };
    });

    // --- Projects ---
    app.get('/v1/projects', async () => store.list('projects'));
    app.get('/v1/projects/:projectId', async (req, reply) => {
      const id = String((req.params as Record<string, any>).projectId);
      const found = store.get('projects', id);
      if (found === undefined) {
        reply.code(404);
        return { code: 404.1, message: 'Could not find the resource you were looking for.' };
      }
      return found;
    });

    // --- Forms for a project ---
    app.get('/v1/projects/:projectId/forms', async (req) => {
      const projectId = Number((req.params as Record<string, any>).projectId);
      return store.list('forms', (f) => f.projectId === projectId);
    });
    app.get('/v1/projects/:projectId/forms/:xmlFormId', async (req, reply) => {
      const { projectId, xmlFormId } = req.params as Record<string, any>;
      const found = store.get('forms', `${projectId}/${xmlFormId}`);
      if (found === undefined) {
        reply.code(404);
        return { code: 404.1, message: 'Could not find the resource you were looking for.' };
      }
      return found;
    });

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

    // POST a new submission through the OData table (generic create path used by
    // http.post) — assigns an instance id and stores it against the form.
    app.post('/v1/projects/:projectId/forms/:formSvc/Submissions', async (req, reply) => {
      const { formSvc } = req.params as Record<string, any>;
      const xmlFormId = String(formSvc).replace(/\.svc$/, '');
      const body = (req.body ?? {}) as Record<string, any>;
      const __id = typeof body.__id === 'string' && body.__id ? body.__id : `uuid:${randomUUID()}`;
      const row = {
        ...body,
        __id,
        __system: {
          submissionDate: nowIso(),
          submitterId: '5',
          submitterName: (req.mockAuth as any)?.username ?? 'apiuser',
          reviewState: null,
        },
        _formId: xmlFormId,
      };
      store.create('submissions', __id, row);
      reply.code(200);
      const { _formId, ...out } = row as Record<string, any>;
      return out;
    });
  },

  seed,
};

export default plugin;
