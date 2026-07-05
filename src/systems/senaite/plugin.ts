import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, uid, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * SENAITE LIMS (Plone-based open-source laboratory information system). The
 * senaite adaptor authenticates with GET /login?__ac_name=&__ac_password= and
 * reuses the returned Set-Cookie, then drives the SENAITE JSON API under
 * /@@API/senaite/v1: search, get/<uid>, create/<portal_type>, update/<uid>,
 * delete/<uid>. List/read responses use SENAITE's { count, pagesize, page,
 * pages, _runtime, items } envelope; every object carries a 32-char hex `uid`.
 */
const API = '/@@API/senaite/v1';

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

    // --- Get by UID ---
    app.get(`${API}/get/:uid`, async (req, reply) => {
      const { uid: u } = req.params as Record<string, any>;
      const found = store.get('objects', u);
      if (found === undefined) {
        reply.code(404);
        return { message: `No object found for UID ${u}`, count: 0, items: [] };
      }
      return envelope([found]);
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
      reply.code(201);
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
