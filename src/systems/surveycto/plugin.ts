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
      { name: 'apiVersion', role: 'static', value: 'v1' },
    ],
  },

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
    // list('datasets') — enumerate server datasets.
    app.get('/api/v2/datasets', async () => ({ datasets: store.list('datasets') }));

    // upsertDataset — create or replace a server dataset by id.
    app.post('/api/v2/datasets/:datasetId', async (req) => {
      const datasetId = String((req.params as Record<string, any>).datasetId);
      const body = (req.body ?? {}) as Record<string, any>;
      const dataset = { ...body, id: datasetId };
      store.replace('datasets', datasetId, dataset);
      return dataset;
    });

    // upsertRecord — upsert a single row into a dataset.
    app.post('/api/v2/datasets/:datasetId/rows', async (req) => {
      const datasetId = String((req.params as Record<string, any>).datasetId);
      const body = (req.body ?? {}) as Record<string, any>;
      const key = body.key != null && String(body.key).length ? String(body.key) : datasetId + '-row';
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
