import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, uid, nowIso, PORTAL_TYPES, ALLOWED_IN, TRANSITIONS, typeInfo } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * SENAITE LIMS (Plone-based open-source laboratory information system). The
 * senaite adaptor authenticates with GET /login?__ac_name=&__ac_password= and
 * reuses the returned Set-Cookie, then drives the SENAITE JSON API under
 * /@@API/senaite/v1: search, get/<uid>, create/<portal_type>, update/<uid>,
 * delete/<uid>. List/read responses use SENAITE's { count, pagesize, page,
 * pages, _runtime, items } envelope; every object carries a 32-char hex `uid`.
 * Also mocks what senaite.jsonapi 2.7.0 added and the adaptor's generic
 * request() can reach: introspection (types, schema, workflow), POST
 * /partition, and PUT/PATCH/DELETE on /<resource>/<uid>.
 */
const API = '/@@API/senaite/v1';

/** senaite.jsonapi tells a UID segment from a portal type by its 32-char length. */
const UID_RE = /^[0-9a-f]{32}$/;

/** Query parameters that steer the catalog query rather than filter on an index. */
const CONTROL_PARAMS = new Set([
  'q', 'path', 'depth', 'catalog', 'limit', 'sort_on', 'sort_order', 'sort_limit', 'complete',
  'children', 'workflow', 'filedata', 'recent_created', 'recent_modified', 'created_since',
  'modified_since', 'b_start',
]);

/** review_state a workflow transition (sent as `transition` in an update) lands in. */
const TRANSITION_TARGET: Record<string, string> = {
  receive: 'sample_received',
  verify: 'verified',
  publish: 'published',
  invalidate: 'invalid',
  deactivate: 'inactive',
  activate: 'active',
};

/** SENAITE's list/read envelope. */
function envelope(items: any[], extra: Record<string, any> = {}): Record<string, any> {
  return {
    count: items.length,
    pagesize: 25,
    page: 1,
    pages: 1,
    _runtime: 0.01,
    next: null,
    previous: null,
    items,
    ...extra,
  };
}

const plugin: MockSystemPlugin = {
  name: 'senaite',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Auth: Plone login. The adaptor only reads the Set-Cookie header. ---
    const login = async (_req: unknown, reply: any) => {
      reply.header('Set-Cookie', '__ac=mock-senaite-session; Path=/; HttpOnly');
      reply.code(200);
      return { authenticated: true };
    };
    app.get('/login', login);
    // The JSON API also exposes its own login/auth endpoints.
    app.get(`${API}/login`, login);
    app.get(`${API}/auth`, login);

    // --- Version ---
    app.get(`${API}/version`, async () => ({
      url: `${API}/version`,
      version: '2.5.0',
      api: 'senaite.jsonapi',
    }));

    // --- Search (filterable by ?portal_type=, ?id=, ?uid=) ---
    app.get(`${API}/search`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let items = store.list('objects');
      if (typeof q.portal_type === 'string') items = items.filter((o) => o.portal_type === q.portal_type);
      if (typeof q.id === 'string') items = items.filter((o) => o.id === q.id);
      if (typeof q.uid === 'string') items = items.filter((o) => o.uid === q.uid);
      if (typeof q.getClientTitle === 'string') items = items.filter((o) => o.getClientTitle === q.getClientTitle);
      return envelope(items);
    });

    // --- Read: GET /<portal_type>/<uid> (the guide's `get/<uid>` is this
    // route too: senaite.jsonapi resolves the object by UID alone). ---
    app.get(`${API}/:resource/:uid`, async (req, reply) => {
      const { uid: u } = req.params as Record<string, any>;
      const found = store.get('objects', u);
      if (found === undefined) {
        reply.code(404);
        return { message: `No object found for UID ${u}`, count: 0, items: [] };
      }
      return envelope([found]);
    });

    // --- List one portal type: GET /<portal_type>?<catalog index>=... A bare
    // 32-char UID in place of the portal type returns that one record. ---
    app.get(`${API}/:resource`, async (req, reply) => {
      const { resource } = req.params as Record<string, any>;
      if (UID_RE.test(resource)) {
        const found = store.get('objects', resource);
        if (found === undefined) {
          reply.code(404);
          return { message: `No object found for UID ${resource}`, count: 0, items: [] };
        }
        return found;
      }
      const q = (req.query ?? {}) as Record<string, any>;
      const wanted = String(resource).toLowerCase();
      let items = store.list('objects').filter((o) => String(o.portal_type).toLowerCase() === wanted);
      for (const [k, v] of Object.entries(q)) {
        if (CONTROL_PARAMS.has(k) || typeof v !== 'string') continue;
        items = items.filter((o) => o[k] === undefined || String(o[k]) === v);
      }
      const limit = Number(q.limit);
      return envelope(Number.isFinite(limit) && limit > 0 ? items.slice(0, limit) : items);
    });

    // --- Portal-type-scoped create/update/delete:
    // POST /<portal_type>/create[/<container uid>], POST /<portal_type>/{update,delete}/<uid> ---
    const createIn = (portalType: string, body: Record<string, any>, parent?: Record<string, any>) => {
      const u = uid();
      const record: Record<string, any> = {
        uid: u,
        id: body.id ?? `${String(portalType).toLowerCase()}-${u.slice(0, 6)}`,
        portal_type: portalType,
        title: body.title ?? '',
        review_state: portalType === 'AnalysisRequest' ? 'sample_due' : 'active',
        created: nowIso(),
        ...body,
      };
      if (parent) {
        record.parent_uid = parent.uid;
        if (parent.portal_type === 'Client') record.getClientTitle = parent.title;
      }
      store.create('objects', u, record);
      return record;
    };
    app.post(`${API}/:resource/create`, async (req) => {
      const { resource } = req.params as Record<string, any>;
      const record = createIn(resource, (req.body ?? {}) as Record<string, any>);
      return { count: 1, items: [record], url: `${API}/${resource}/create` };
    });
    app.post(`${API}/:resource/create/:uid`, async (req, reply) => {
      const { resource, uid: parentUid } = req.params as Record<string, any>;
      const parent = store.get('objects', parentUid);
      if (parent === undefined) {
        reply.code(404);
        return { message: `No container found for UID ${parentUid}`, count: 0, items: [] };
      }
      const record = createIn(resource, (req.body ?? {}) as Record<string, any>, parent);
      return { count: 1, items: [record], url: `${API}/${resource}/create/${parentUid}` };
    });
    app.post(`${API}/:resource/update/:uid`, async (req, reply) => {
      const { resource, uid: u } = req.params as Record<string, any>;
      const existing = store.get('objects', u);
      if (existing === undefined) {
        reply.code(404);
        return { message: `No object found for UID ${u}`, count: 0, items: [] };
      }
      const { transition, ...fields } = (req.body ?? {}) as Record<string, any>;
      const updated = { ...existing, ...fields, uid: u, modified: nowIso() };
      if (typeof transition === 'string' && TRANSITION_TARGET[transition]) updated.review_state = TRANSITION_TARGET[transition];
      store.replace('objects', u, updated);
      return { count: 1, items: [updated], url: `${API}/${resource}/update/${u}` };
    });
    app.post(`${API}/:resource/delete/:uid`, async (req, reply) => {
      const { resource, uid: u } = req.params as Record<string, any>;
      const existing = store.get('objects', u);
      if (existing === undefined) {
        reply.code(404);
        return { message: `No object found for UID ${u}`, count: 0, items: [] };
      }
      const deactivated = { ...existing, review_state: 'inactive', modified: nowIso() };
      store.replace('objects', u, deactivated);
      return { count: 1, items: [deactivated], url: `${API}/${resource}/delete/${u}` };
    });

    // --- Create by portal_type ---
    app.post(`${API}/create/:portalType`, async (req, reply) => {
      const { portalType } = req.params as Record<string, any>;
      const body = (req.body ?? {}) as Record<string, any>;
      const u = uid();
      const record = {
        uid: u,
        id: body.id ?? `${String(portalType).toLowerCase()}-${u.slice(0, 6)}`,
        portal_type: portalType,
        title: body.title ?? '',
        review_state: 'active',
        created: nowIso(),
        ...body,
      };
      store.create('objects', u, record);
      // senaite.jsonapi answers a create with 200 and the usual { count, items } envelope.
      reply.code(200);
      return envelope([record]);
    });

    // --- Update by UID ---
    app.post(`${API}/update/:uid`, async (req, reply) => {
      const { uid: u } = req.params as Record<string, any>;
      const existing = store.get('objects', u);
      if (existing === undefined) {
        reply.code(404);
        return { message: `No object found for UID ${u}`, count: 0, items: [] };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const updated = { ...existing, ...body, uid: u, modified: nowIso() };
      store.replace('objects', u, updated);
      reply.code(200);
      return envelope([updated]);
    });

    // --- REST verbs on an object-addressed route (senaite.jsonapi #98, 2.7.0):
    // PUT/PATCH /<resource>/<uid> run `update`, DELETE runs `delete`. ---
    const restUpdate = async (req: any, reply: any) => {
      const { uid: u } = req.params as Record<string, any>;
      const existing = store.get('objects', u);
      if (existing === undefined) {
        reply.code(404);
        return { message: `No object found for UID ${u}`, count: 0, items: [] };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const updated = { ...existing, ...body, uid: u, modified: nowIso() };
      store.replace('objects', u, updated);
      return { count: 1, items: [updated], url: `${API}/update` };
    };
    app.put(`${API}/:resource/:uid`, restUpdate);
    app.patch(`${API}/:resource/:uid`, restUpdate);
    app.delete(`${API}/:resource/:uid`, async (req, reply) => {
      const { uid: u } = req.params as Record<string, any>;
      const existing = store.get('objects', u);
      if (existing === undefined) {
        reply.code(404);
        return { message: `No object found for UID ${u}`, count: 0, items: [] };
      }
      // SENAITE deactivates rather than deletes, keeping the audit trail.
      const deactivated = { ...existing, review_state: 'inactive', modified: nowIso() };
      store.replace('objects', u, deactivated);
      return { count: 1, items: [deactivated], url: `${API}/delete` };
    });

    // --- Introspection (senaite.jsonapi #108, 2.7.0) ---
    app.get(`${API}/types`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let types = PORTAL_TYPES;
      if (typeof q.parent_uid === 'string' || typeof q.parent_path === 'string') {
        const parent =
          typeof q.parent_uid === 'string'
            ? store.get('objects', q.parent_uid)
            : store.list('objects').find((o) => typeof o.url === 'string' && o.url.endsWith(q.parent_path));
        if (parent !== undefined) {
          const allowed = ALLOWED_IN[parent.portal_type] ?? [];
          types = types.filter((t) => allowed.includes(t.portal_type));
        }
      }
      const items = types.map(typeInfo).sort((a, b) => a.portal_type.localeCompare(b.portal_type));
      return { count: items.length, items };
    });
    app.get(`${API}/types/:portalType`, async (req, reply) => {
      const { portalType } = req.params as Record<string, any>;
      const t = PORTAL_TYPES.find((x) => x.portal_type === portalType);
      if (t === undefined) {
        reply.code(404);
        return { message: `Unknown portal type '${portalType}'`, count: 0, items: [] };
      }
      return { ...typeInfo(t), add_permission: t.add_permission, catalogs: t.catalogs };
    });
    app.get(`${API}/schema/:portalType`, async (req, reply) => {
      const { portalType } = req.params as Record<string, any>;
      const t = PORTAL_TYPES.find((x) => x.portal_type === portalType);
      if (t === undefined) {
        reply.code(404);
        return { message: `Unknown portal type '${portalType}'`, count: 0, items: [] };
      }
      return { portal_type: portalType, count: t.fields.length, fields: t.fields };
    });
    app.get(`${API}/workflow/:uid`, async (req, reply) => {
      const { uid: u } = req.params as Record<string, any>;
      const obj = store.get('objects', u);
      if (obj === undefined) {
        reply.code(404);
        return { message: `No object found for uid '${u}'`, count: 0, items: [] };
      }
      const state = String(obj.review_state ?? 'active');
      return {
        uid: u,
        portal_type: obj.portal_type,
        review_state: state,
        transitions: TRANSITIONS[state] ?? [],
      };
    });

    // --- Partition a received sample (senaite.jsonapi #109, 2.7.0) ---
    app.post(`${API}/partition`, async (req, reply) => {
      const raw = req.body ?? {};
      const records = (Array.isArray(raw) ? raw : [raw]) as Record<string, any>[];
      const created: Record<string, any>[] = [];
      for (const record of records) {
        const primaryUid = record.uid;
        if (!primaryUid) {
          reply.code(400);
          return { message: "A primary sample 'uid' is required", count: 0, items: [] };
        }
        const primary = store.get('objects', primaryUid);
        if (primary === undefined) {
          reply.code(404);
          return { message: `No sample found for uid '${primaryUid}'`, count: 0, items: [] };
        }
        const specs = Array.isArray(record.partitions) && record.partitions.length ? record.partitions : [record];
        for (const spec of specs) {
          const n = store.list('objects').filter((o) => o.ParentAnalysisRequest?.uid === primaryUid).length + 1;
          const u = uid();
          const id = `${primary.id}-P${String(n).padStart(2, '0')}`;
          const partition = {
            uid: u,
            id,
            portal_type: 'AnalysisRequest',
            title: id,
            getClientTitle: primary.getClientTitle,
            Client: primary.Client,
            SampleType: spec.sample_type ?? primary.SampleType,
            ParentAnalysisRequest: { uid: primaryUid, title: primary.title },
            Analyses: spec.analyses ?? [],
            InternalUse: spec.internal_use ?? false,
            review_state: 'sample_received',
            url: `${primary.url}/${id}`,
            api_url: `${API}/get/${u}`,
            created: nowIso(),
          };
          store.create('objects', u, partition);
          created.push(partition);
        }
      }
      if (!created.length) {
        reply.code(400);
        return { message: 'No partitions could be created', count: 0, items: [] };
      }
      return { count: created.length, items: created, url: `${API}/partition` };
    });

    // --- Delete by UID ---
    app.post(`${API}/delete/:uid`, async (req, reply) => {
      const { uid: u } = req.params as Record<string, any>;
      const existed = store.destroy('objects', u);
      reply.code(200);
      return envelope(existed ? [{ uid: u, deleted: true }] : []);
    });
  },

  seed,
};

export default plugin;
