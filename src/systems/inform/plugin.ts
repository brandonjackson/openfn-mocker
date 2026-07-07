import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * UNICEF InForm — a KoboToolbox/KPI-based form deployment. Token auth
 * ("Authorization: Token <access_token>"). The adaptor builds every request as
 * `<baseUrl>/api/<apiVersion>/<path>` (apiVersion pinned to `v2`), so routes
 * live under `/api/v2/...` (forms, forms/:id, data/:id, data/:id/:subId,
 * media/:id); list endpoints return a { count, results } envelope.
 */

const plugin: MockSystemPlugin = {
  name: 'inform',
  // InForm authenticates with `Authorization: Token <access_token>`.
  auth: { required: true, schemes: ['token'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'token', value: 'mock-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'access_token', role: 'secret', secret: { charset: 'hex', length: 40 } },
      { name: 'apiVersion', role: 'static', value: 'v2' },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Forms -------------------------------------------------------------
    // getForms — list deployed forms.
    app.get('/api/v2/forms', async () => ({
      count: store.count('forms'),
      results: store.list('forms'),
    }));

    // getAttachmentMetadata / downloadAttachment — media by id.
    // (registered before /forms/:id so the routes stay unambiguous)
    app.get('/api/v2/media/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('media', id);
      if (!found) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      return found;
    });

    // getForm — form structure (JSON schema of fields).
    app.get('/api/v2/forms/:id/form.json', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const form = store.get('forms', id);
      if (!form) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      return {
        name: form.name ?? 'Form',
        children: [
          { name: 'name', type: 'text', label: 'Name' },
          { name: 'age', type: 'integer', label: 'Age' },
        ],
      };
    });

    // getForm — single form by id.
    app.get('/api/v2/forms/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('forms', id);
      if (!found) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      return found;
    });

    // --- Data (submissions) ------------------------------------------------
    // getSubmission — single submission by id (static-count route wins).
    app.get('/api/v2/data/:id/:subId', async (req, reply) => {
      const { subId } = req.params as Record<string, any>;
      const found = store.get('submissions', String(subId));
      if (!found) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      return found;
    });

    // getSubmissions — submissions for a form.
    app.get('/api/v2/data/:id', async () => ({
      count: store.count('submissions'),
      results: store.list('submissions'),
    }));
  },

  seed,
};

export default plugin;
