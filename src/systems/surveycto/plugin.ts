import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * SurveyCTO. A form-collection server reached over HTTP Basic auth. The adaptor
 * fetches submissions as a bare "wide JSON" array from
 * /api/v2/forms/data/wide/json/:formId (fetchSubmissions), and manages server
 * datasets under /api/v2/datasets (list / upsertDataset / upsertRecord /
 * uploadCsvRecords). `cursor` and `jsonToCSVBuffer` are pure client-side helpers
 * with no endpoint.
 */

const plugin: MockSystemPlugin = {
  name: 'surveycto',
  // SurveyCTO authenticates with HTTP Basic (username/password).
  auth: { required: true, schemes: ['basic'] },
  credential: {
    type: 'userpass',
    authHeader: { scheme: 'basic', userField: 'username', passField: 'password' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'servername', role: 'static', value: 'mockserver' },
      { name: 'username', role: 'username', value: 'user@example.com' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
      { name: 'apiVersion', role: 'static', value: 'v2' },
    ],
  },
  // The adaptor builds https://<servername>.surveycto.com/api/<apiVersion> and
  // never reads a base URL (the `baseUrl` field above is inert), so
  // `pnpm test:usage` aliases the derived host to the mock. See
  // src/systems/types.ts `hostAliases`.
  hostAliases: ['mockserver.surveycto.com'],

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- fetchSubmissions: wide JSON export (bare array) --------------------
    // The `?date=` param filters submissions after a date; we treat it as a
    // no-op and return every seeded submission for the form.
    const wideJson = async () => store.list('submissions');
    app.get('/api/v2/forms/data/wide/json/:formId', wideJson);
    app.get('/api/v1/forms/data/wide/json/:formId', wideJson);
    app.get('/forms/data/wide/json/exports/:formId', wideJson);

    // --- Datasets ----------------------------------------------------------
    // list('datasets') — the adaptor pages over a { data, nextCursor } envelope.
    app.get('/api/v2/datasets', async () => ({ data: store.list('datasets'), nextCursor: null }));

    // upsertDataset first GETs the dataset by id to decide create vs update
    // (200 -> PUT update, 404 -> POST create).
    app.get('/api/v2/datasets/:datasetId', async (req, reply) => {
      const id = String((req.params as Record<string, any>).datasetId);
      const dataset = store.get('datasets', id);
      if (!dataset) {
        reply.code(404);
        return { error: 'not found' };
      }
      return dataset;
    });

    // upsertDataset create (collection POST, dataset id comes from the body).
    app.post('/api/v2/datasets', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = String(body.id);
      const dataset = { ...body, id };
      store.replace('datasets', id, dataset);
      return dataset;
    });

    // upsertDataset update (item PUT).
    app.put('/api/v2/datasets/:datasetId', async (req) => {
      const id = String((req.params as Record<string, any>).datasetId);
      const dataset = { ...((req.body ?? {}) as Record<string, any>), id };
      store.replace('datasets', id, dataset);
      return dataset;
    });

    // upsertRecord — PATCH a single row (record id carried as ?recordId=).
    app.patch('/api/v2/datasets/:datasetId/record', async (req) => {
      const datasetId = String((req.params as Record<string, any>).datasetId);
      const body = (req.body ?? {}) as Record<string, any>;
      const key = body.id != null && String(body.id).length ? String(body.id) : datasetId + '-row';
      store.replace('records', key, { datasetId, ...body });
      return { successful: true };
    });

    // uploadCsvRecords — bulk CSV upload; acknowledge with a row count.
    app.post('/api/v2/datasets/:datasetId/upload', async (req) => {
      const body = req.body as any;
      let rowsUpdated = 1;
      if (Array.isArray(body)) rowsUpdated = body.length;
      else if (typeof body === 'string') rowsUpdated = Math.max(0, body.trim().split('\n').length - 1);
      return { successful: true, rowsUpdated };
    });
  },

  seed,
};

export default plugin;
