import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { paginate } from '../../engine/response-generator.js';
import { seed, assetUrl, makeAssetUid, versionId, koboSubmissionMeta, buildAsset, DEFAULT_PORT } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * KoboToolbox (port 4016) — Token auth ("Authorization: Token xxx"), DRF-style
 * envelopes ({ count, next, previous, results }). Source system exposing survey
 * "assets" and their "submissions" (collected data). The nested, non-CRUD route
 * shape (assets -> data -> single submission, plus the per-submission actions)
 * is registered with custom handlers rather than the generic CRUD helper; the
 * DRF envelope is applied by hand. Auth is accept-all (handled globally).
 */

/** Submissions belonging to an asset uid. */
function assetSubmissions(store: DataStore, uid: string): any[] {
  return store.list('submissions', (s) => s._xform_id_string === uid);
}

/** Number of submissions belonging to an asset uid. */
function submissionCount(store: DataStore, uid: string): number {
  return assetSubmissions(store, uid).length;
}

/**
 * Rebuild the full KoboToolbox Asset serializer from a stored asset's core
 * fields and its live submissions, so counts, the summary, and the self/data
 * links always reflect the current store and port. The shared `buildAsset`
 * definition (in seed.ts) is what the seed bakes in, so store dump and live
 * response agree.
 */
function shapeAsset(store: DataStore, asset: any, port: number): any {
  return buildAsset(asset, assetSubmissions(store, asset.uid), port);
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
  const shaped = shapeAsset(store, asset, port);
  return {
    backend: 'openrosa',
    active: asset.deployment__active ?? true,
    version_id: shaped.version_id,
    // The real DeploymentResponse embeds the full Asset object (required field).
    asset: shaped,
    // Additive extras the getDeploymentInfo helper historically read.
    asset_version_id: shaped.version_id,
    identifier: assetUrl(port, asset.uid),
    submission_count: submissionCount(store, asset.uid),
  };
}

const plugin: MockSystemPlugin = {
  name: 'kobotoolbox',
  // KoboToolbox authenticates with `Authorization: Token <apiToken>`.
  auth: { required: true, schemes: ['token'] },
  credential: {
    type: 'userpass',
    authHeader: { scheme: 'basic', userField: 'username', passField: 'password' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'mocker' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
      { name: 'apiVersion', role: 'static', value: 'v2' },
    ],
  },

  usage,
  guide,

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

    // PATCH/PUT /api/v2/assets/:uid/ — update an asset (http.request('PATCH')
    // / http.put). KPI's AssetViewSet is a ModelViewSet, so both reach
    // AssetSerializer.update(): DRF only writes the validated fields, so a PUT
    // keeps every field it does not send, exactly like a PATCH. The one
    // difference is validation: a full (non-partial) PUT must carry the
    // serializer's required `asset_type`.
    const updateAsset = (partial: boolean) => async (req: any, reply: any) => {
      const uid = (req.params as Record<string, any>).uid;
      const existing = store.get('assets', uid);
      if (existing === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      if (!partial && body.asset_type === undefined) {
        reply.code(400);
        return { asset_type: ['This field is required.'] };
      }
      const updated = { ...existing, ...body, uid, url: assetUrl(port, uid) };
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
    // KPI raises Http404 for an asset that has never been deployed.
    app.get('/api/v2/assets/:uid/deployment/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      const asset = store.get('assets', uid);
      if (asset === undefined || !asset.has_deployment) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      return deploymentInfo(store, asset, port);
    });

    // POST /api/v2/assets/:uid/deployment/ — first deployment of a draft.
    // PATCH /api/v2/assets/:uid/deployment/ — redeploy, or (un)archive with
    // `{ active }`. KPI's deployment action takes GET/POST/PATCH only (no
    // PUT), answers 405 to a POST on an already-deployed asset ("Use PATCH")
    // and to a PATCH on a draft ("Use POST"), and deploys inactive unless the
    // POST says `active: true`.
    app.post('/api/v2/assets/:uid/deployment/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      const asset = store.get('assets', uid);
      if (asset === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      if (asset.has_deployment) {
        reply.code(405);
        return { detail: 'Use PATCH to update an existing deployment' };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      store.update('assets', uid, {
        deployment__active: body.active === true,
        has_deployment: true,
        date_modified: new Date().toISOString(),
      });
      return deploymentInfo(store, store.get('assets', uid), port);
    });
    app.patch('/api/v2/assets/:uid/deployment/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      const asset = store.get('assets', uid);
      if (asset === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      if (!asset.has_deployment) {
        reply.code(405);
        return { detail: 'Use POST to create a new deployment' };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const patch: Record<string, any> = { date_modified: new Date().toISOString() };
      if (typeof body.active === 'boolean') patch.deployment__active = body.active;
      store.update('assets', uid, patch);
      return deploymentInfo(store, store.get('assets', uid), port);
    });

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
    // (http.request('PATCH', 'assets/{uid}/data/bulk/', { data: { payload: {
    // submission_ids, data } } })). KPI's DataBulkActionsValidator reads
    // everything from a `payload` object; each edited submission is re-stored
    // as a new instance (fresh _uuid / meta/instanceID, the old one kept as
    // meta/deprecatedID, meta/rootUuid unchanged), protected XML fields
    // (__version__, formhub/*, meta/*) are dropped from the edit, and the
    // response reports a per-submission result. Static 'bulk' wins over the
    // :id data route below.
    app.patch('/api/v2/assets/:uid/data/bulk/', async (req, reply) => {
      const uid = (req.params as Record<string, any>).uid;
      if (store.get('assets', uid) === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const payload = body.payload;
      if (!payload || typeof payload !== 'object') {
        reply.code(400);
        return { payload: ['This field is required.'] };
      }
      const ids: any[] = Array.isArray(payload.submission_ids) ? payload.submission_ids : [];
      const raw = (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<string, any>;
      const protectedRoots = ['__version__', 'formhub', 'meta'];
      const patch = Object.fromEntries(
        Object.entries(raw).filter(([k]) => !protectedRoots.includes(k.split('/')[0]))
      );
      const matched = ids
        .map((id) => store.get('submissions', String(id)))
        .filter((sub) => sub && sub._xform_id_string === uid);
      if (!matched.length) {
        reply.code(400);
        return { detail: 'No submissions match the given `submission_ids`' };
      }
      const results = matched.map((sub) => {
        const uuid = randomUUID();
        const rootUuid = sub['meta/rootUuid'] ?? sub['meta/instanceID'];
        store.update('submissions', String(sub._id), {
          ...patch,
          _uuid: uuid,
          'meta/instanceID': `uuid:${uuid}`,
          'meta/deprecatedID': sub['meta/instanceID'],
          'meta/rootUuid': rootUuid,
        });
        return {
          uuid,
          root_uuid: String(rootUuid).replace(/^uuid:/, ''),
          status_code: 201,
          message: 'Successful submission',
        };
      });
      return { count: results.length, successes: results.length, failures: 0, results };
    });

    // GET /api/v2/assets/:uid/data/:id/attachments/:attId/ — download a
    // submission attachment's bytes. Reached via
    // http.get('assets/.../data/<id>/attachments/<attId>', { parseAs: 'base64' }),
    // which the adaptor base64-encodes from the raw bytes returned here.
    app.get('/api/v2/assets/:uid/data/:id/attachments/:attId/', async (req, reply) => {
      const { attId } = req.params as Record<string, any>;
      const att = store.get('attachments', String(attId));
      if (att === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      reply.type(att.mimetype ?? 'application/octet-stream');
      return reply.send(Buffer.from(att.base64, 'base64'));
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

    // (No PATCH /api/v2/assets/:uid/data/:id/: KPI's DataViewSet has no
    // update action; submissions are edited through data/bulk/ or Enketo.)

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

    // POST /api/v2/assets/:uid/data/:id/duplicate/ — copy a submission.
    // KPI has no JSON "create a submission" endpoint (collected data arrives
    // through KoboCAT/OpenRosa, not /api/v2), so this is the write path a
    // workflow can drive here: it returns the copy, with a fresh _id and _uuid
    // and the original recorded as its deprecated instance id.
    app.post('/api/v2/assets/:uid/data/:id/duplicate/', async (req, reply) => {
      const { uid, id } = req.params as Record<string, any>;
      const original = store.get('submissions', String(id));
      if (original === undefined || original._xform_id_string !== uid) {
        reply.code(404);
        return { detail: 'Not found.' };
      }

      // Assign a new integer _id (max existing + 1).
      const existingIds = store
        .list('submissions')
        .map((s) => Number(s._id))
        .filter((n) => Number.isFinite(n));
      const newId = (existingIds.length ? Math.max(...existingIds) : 12000) + 1;
      const uuid = randomUUID();
      const asset = store.get('assets', uid);
      const { _id, _uuid, _attachments, _submission_time, ...fields } = original as Record<string, any>;

      const duplicate = {
        ...fields,
        ...koboSubmissionMeta({
          id: newId,
          uuid,
          submissionTime: new Date().toISOString(),
          submittedBy: (req.mockAuth as any)?.username ?? 'apiuser',
          xformId: uid,
          version: asset?.version_id ?? versionId(uid),
          formhubUuid: asset?.deployment__uuid ?? versionId(`fh-${uid}`).slice(1),
          fields,
        }),
        // The copy points back at the submission it was made from; its media
        // is not copied with it.
        'meta/deprecatedID': `uuid:${original._uuid}`,
        _attachments: [],
      };
      store.create('submissions', String(newId), duplicate);
      return duplicate;
    });
  },

  seed,
};

export default plugin;
