import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { paginate } from '../../engine/response-generator.js';
import { seed, assetUrl, makeAssetUid, DEFAULT_PORT } from './seed.js';

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

/** Parse a JSON query param (Kobo's `query`/`sort` are JSON strings). */
function parseJsonParam(value: unknown): any {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Best-effort Mongo-style filter used by KoboToolbox's `?query=` param. Supports
 * scalar equality and the `$gte`/`$gt`/`$lte`/`$lt`/`$in` operators (enough for
 * the date-range filters the adaptor documents). Unknown operators pass.
 */
function matchesKoboQuery(record: Record<string, any>, query: any): boolean {
  if (!query || typeof query !== 'object') return true;
  return Object.entries(query).every(([field, cond]) => {
    const actual = record[field];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, operand]) => {
        switch (op) {
          case '$gte':
            return actual >= (operand as any);
          case '$gt':
            return actual > (operand as any);
          case '$lte':
            return actual <= (operand as any);
          case '$lt':
            return actual < (operand as any);
          case '$in':
            return Array.isArray(operand) && operand.some((v) => String(v) === String(actual));
          case '$ne':
            return String(actual) !== String(operand);
          default:
            return true;
        }
      });
    }
    return String(actual) === String(cond);
  });
}

/** Apply a Kobo `sort` object ({ field: 1 | -1 }) to a submissions array. */
function applyKoboSort(items: any[], sort: any): any[] {
  if (!sort || typeof sort !== 'object') return items;
  const entries = Object.entries(sort);
  if (!entries.length) return items;
  return [...items].sort((a, b) => {
    for (const [field, dir] of entries) {
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      const cmp = av > bv ? 1 : -1;
      return Number(dir) < 0 ? -cmp : cmp;
    }
    return 0;
  });
}

/** Build the /deployment/ info object KoboToolbox returns for a deployed asset. */
function deploymentInfo(store: DataStore, asset: any, port: number): Record<string, any> {
  return {
    backend: 'openrosa',
    active: asset.deployment__active ?? true,
    version_id: asset.version_id ?? 'v1',
    asset_version_id: asset.version_id ?? 'v1',
    identifier: assetUrl(port, asset.uid),
    submission_count: submissionCount(store, asset.uid),
  };
}

const plugin: MockSystemPlugin = {
  name: 'kobotoolbox',
  specFile: 'kobotoolbox.schema.json',
  // KoboToolbox authenticates with `Authorization: Token <apiToken>`.
  auth: { required: true, schemes: ['token'] },

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const port = (config.port as number) || DEFAULT_PORT;

    // GET /api/v2/assets/ — list assets (DRF envelope). getForms() sends
    // ?asset_type=survey; support that filter (and a free-text ?q=).
    app.get('/api/v2/assets/', async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let results = store.list('assets').map((a) => shapeAsset(store, a, port));
      if (typeof q.asset_type === 'string') {
        results = results.filter((a) => a.asset_type === q.asset_type);
      }
      if (typeof q.q === 'string' && q.q.length) {
        const needle = q.q.toLowerCase();
        results = results.filter((a) => JSON.stringify(a).toLowerCase().includes(needle));
      }
      return { count: results.length, next: null, previous: null, results };
    });

    // POST /api/v2/assets/ — create an asset (http.post('/assets/', {...})).
    app.post('/api/v2/assets/', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const uid = typeof body.uid === 'string' && body.uid ? body.uid : makeAssetUid();
      const now = new Date().toISOString();
      const asset = {
        uid,
        name: body.name ?? 'Untitled asset',
        asset_type: body.asset_type ?? 'survey',
        deployment__active: false,
        deployment__submission_count: 0,
        has_deployment: false,
        date_created: now,
        date_modified: now,
        owner__username: (req.mockAuth as any)?.username ?? 'apiuser',
        ...body,
        url: assetUrl(port, uid),
      };
      store.create('assets', uid, asset);
      reply.code(201);
      return shapeAsset(store, asset, port);
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

    // PATCH/PUT /api/v2/assets/:uid/ — update an asset (http.patch/put).
    const updateAsset = (merge: boolean) => async (req: any, reply: any) => {
      const uid = (req.params as Record<string, any>).uid;
      const existing = store.get('assets', uid);
      if (existing === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const updated = merge
        ? { ...existing, ...body, uid, url: assetUrl(port, uid) }
        : { ...body, uid, url: assetUrl(port, uid) };
      updated.date_modified = new Date().toISOString();
      store.replace('assets', uid, updated);
      return shapeAsset(store, updated, port);
    };
    app.patch('/api/v2/assets/:uid/', updateAsset(true));
    app.put('/api/v2/assets/:uid/', updateAsset(false));

    // DELETE /api/v2/assets/:uid/ — remove an asset.
    app.delete('/api/v2/assets/:uid/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      if (!store.destroy('assets', uid)) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      reply.code(204);
      return null;
    });

    // GET /api/v2/assets/:uid/deployment/ — deployment info (getDeploymentInfo).
    app.get('/api/v2/assets/:uid/deployment/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      const asset = store.get('assets', uid);
      if (asset === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      return deploymentInfo(store, asset, port);
    });

    // POST/PUT/PATCH /api/v2/assets/:uid/deployment/ — (re)deploy an asset.
    const deploy = async (req: any, reply: any) => {
      const uid = (req.params as Record<string, any>).uid;
      const asset = store.get('assets', uid);
      if (asset === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      store.update('assets', uid, { deployment__active: true, has_deployment: true });
      return deploymentInfo(store, store.get('assets', uid), port);
    };
    app.post('/api/v2/assets/:uid/deployment/', deploy);
    app.put('/api/v2/assets/:uid/deployment/', deploy);
    app.patch('/api/v2/assets/:uid/deployment/', deploy);

    // GET /api/v2/assets/:uid/data/ — submissions for an asset (DRF envelope).
    // Supports ?start= &limit= (paging), ?query= (JSON Mongo filter) and
    // ?sort= (JSON), matching getSubmissions().
    app.get('/api/v2/assets/:uid/data/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      if (store.get('assets', uid) === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      let all = store.list('submissions', (s) => s._xform_id_string === uid);
      const q = (req.query ?? {}) as Record<string, any>;

      const query = parseJsonParam(q.query);
      if (query) all = all.filter((s) => matchesKoboQuery(s, query));
      const sort = parseJsonParam(q.sort);
      if (sort) all = applyKoboSort(all, sort);

      const start = intParam(q.start, 0);
      const hasLimit = typeof q.limit === 'string';
      const limit = hasLimit ? intParam(q.limit, all.length) : all.length;
      const page = paginate(all, { offset: start, limit });
      const base = `http://localhost:${port}/api/v2/assets/${uid}/data/?format=json`;
      const next = page.hasMore ? `${base}&start=${start + page.items.length}&limit=${limit}` : null;
      const previous = start > 0 ? `${base}&start=${Math.max(0, start - limit)}&limit=${limit}` : null;
      return { count: page.total, next, previous, results: page.items };
    });

    // PATCH /api/v2/assets/:uid/data/bulk/ — bulk-update submissions
    // (http.request('PATCH', 'assets/{uid}/data/bulk/', { data: { submission_ids, data } })).
    // Static 'bulk' wins over the :id data route below.
    app.patch('/api/v2/assets/:uid/data/bulk/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      if (store.get('assets', uid) === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const ids: any[] = Array.isArray(body.submission_ids) ? body.submission_ids : [];
      const patch = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, any>;
      let successes = 0;
      for (const id of ids) {
        const sub = store.get('submissions', String(id));
        if (sub && sub._xform_id_string === uid) {
          store.update('submissions', String(id), patch);
          successes++;
        }
      }
      return { count: ids.length, successes, failures: ids.length - successes };
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

    // PATCH /api/v2/assets/:uid/data/:id/ — update a single submission.
    app.patch('/api/v2/assets/:uid/data/:id/', async (req, reply) => {
      const { uid, id } = req.params as Record<string, any>;
      const submission = store.get('submissions', String(id));
      if (submission === undefined || submission._xform_id_string !== uid) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      const patch = (req.body ?? {}) as Record<string, any>;
      return store.update('submissions', String(id), patch);
    });

    // DELETE /api/v2/assets/:uid/data/:id/ — delete a single submission.
    app.delete('/api/v2/assets/:uid/data/:id/', async (req, reply) => {
      const { uid, id } = req.params as Record<string, any>;
      const submission = store.get('submissions', String(id));
      if (submission === undefined || submission._xform_id_string !== uid) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      store.destroy('submissions', String(id));
      reply.code(204);
      return null;
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
