import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { paginate } from '../../engine/response-generator.js';
import { seed, assetUrl, DEFAULT_PORT } from './seed.js';

/**
 * KoboToolbox (port 4016) — Token auth ("Authorization: Token xxx"), DRF-style
 * envelopes ({ count, next, previous, results }). Source system exposing survey
 * "assets" and their "submissions" (collected data). The nested, non-CRUD route
 * shape (assets -> data -> single submission, plus a separate /submissions/ POST)
 * is registered with custom handlers rather than the generic CRUD helper; the
 * DRF envelope is applied by hand. Auth is accept-all (handled globally).
 */

/** Number of submissions belonging to an asset uid. */
function submissionCount(store: DataStore, uid: string): number {
  return store.list('submissions', (s) => s._xform_id_string === uid).length;
}

/** Return a copy of the asset with a live deployment__submission_count + url. */
function shapeAsset(store: DataStore, asset: any, port: number): any {
  return {
    ...asset,
    deployment__submission_count: submissionCount(store, asset.uid),
    url: assetUrl(port, asset.uid),
  };
}

/** Parse a positive integer query param, falling back to `fallback`. */
function intParam(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const plugin: MockSystemPlugin = {
  name: 'kobotoolbox',
  specFile: 'kobotoolbox.schema.json',

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const port = (config.port as number) || DEFAULT_PORT;

    // GET /api/v2/assets/ — list assets (DRF envelope).
    app.get('/api/v2/assets/', async () => {
      const results = store.list('assets').map((a) => shapeAsset(store, a, port));
      return { count: results.length, next: null, previous: null, results };
    });

    // GET /api/v2/assets/:uid/ — single asset.
    app.get('/api/v2/assets/:uid/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      const asset = store.get('assets', uid);
      if (asset === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      return shapeAsset(store, asset, port);
    });

    // GET /api/v2/assets/:uid/data/ — submissions for an asset (DRF envelope, ?start=&limit=).
    app.get('/api/v2/assets/:uid/data/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      if (store.get('assets', uid) === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      const all = store.list('submissions', (s) => s._xform_id_string === uid);
      const q = (req.query ?? {}) as Record<string, any>;
      const start = intParam(q.start, 0);
      const hasLimit = typeof q.limit === 'string';
      const limit = hasLimit ? intParam(q.limit, all.length) : all.length;
      const page = paginate(all, { offset: start, limit });
      const base = `http://localhost:${port}/api/v2/assets/${uid}/data/?format=json`;
      const next = page.hasMore ? `${base}&start=${start + page.items.length}&limit=${limit}` : null;
      const previous = start > 0 ? `${base}&start=${Math.max(0, start - limit)}&limit=${limit}` : null;
      return { count: page.total, next, previous, results: page.items };
    });

    // GET /api/v2/assets/:uid/data/:id/ — single submission.
    app.get('/api/v2/assets/:uid/data/:id/', async (req, reply) => {
      const { uid, id } = req.params as Record<string, any>;
      const submission = store.get('submissions', String(id));
      if (submission === undefined || submission._xform_id_string !== uid) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      return submission;
    });

    // POST /api/v2/assets/:uid/submissions/ — create a submission.
    app.post('/api/v2/assets/:uid/submissions/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      const raw = (req.body ?? {}) as Record<string, any>;

      // Accept either a bare survey object or a { id, submission } envelope.
      const fields =
        raw && typeof raw === 'object' && raw.submission && typeof raw.submission === 'object'
          ? (raw.submission as Record<string, any>)
          : raw;
      const { id: _ignoredId, submission: _ignoredSub, ...surveyFields } = fields as Record<string, any>;

      // Assign a new integer _id (max existing + 1).
      const existingIds = store
        .list('submissions')
        .map((s) => Number(s._id))
        .filter((n) => Number.isFinite(n));
      const newId = (existingIds.length ? Math.max(...existingIds) : 12000) + 1;
      const uuid = randomUUID();

      const submission = {
        _id: newId,
        _uuid: uuid,
        _submission_time: new Date().toISOString(),
        _submitted_by: (req.mockAuth as any)?.username ?? 'apiuser',
        _xform_id_string: uid,
        ...surveyFields,
      };
      store.create('submissions', String(newId), submission);

      reply.code(201);
      return {
        message: 'Successful submission.',
        _id: newId,
        _uuid: uuid,
        status: 'submitted',
        submission,
      };
    });
  },

  seed,
};

export default plugin;
