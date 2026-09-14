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
      // v1 is the adaptor's own default (buildUrl: apiVersion = 'v1') and is
      // the version fetchSubmissions' plain GET is actually documented under;
      // v2 (POST-only for the wide-JSON export, per the vendor's OpenAPI) is
      // where every dataset endpoint lives, so the dataset usage examples
      // override apiVersion mid-job via fn() rather than changing this default.
      { name: 'apiVersion', role: 'static', value: 'v1' },
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
    app.get('/api/v1/forms/data/wide/json/:formId', wideJson);
    // v2's equivalent (formJsonHandlerV2) is documented POST-only ("Export
    // form submissions") rather than v1's plain GET download, so it is not
    // registered here: the adaptor's fetchSubmissions always sends GET
    // regardless of apiVersion, which only the v1 shape actually matches.
    app.get('/api/v2/forms/data/wide/json/:formId', wideJson);

    // --- Datasets ----------------------------------------------------------
    // list('datasets') — the adaptor pages over a { data, nextCursor } envelope
    // (nextCursor read with `?? null`, so an absent key is as good as a null
    // one). The vendor's CursorPaginatedResponse.nextCursor is typed as a plain
    // (non-nullable) string despite its own description saying "if null, there
    // are no more pages" -- a real imprecision in their published spec, not
    // something to paper over by editing a verbatim upstream file -- so the
    // mock omits the key entirely for a last/only page instead of sending null.
    app.get('/api/v2/datasets', async () => ({ data: store.list('datasets') }));

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
