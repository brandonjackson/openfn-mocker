import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso, SEED_USER_ID } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * OpenFn platform (Lightning API). The openfn adaptor exposes thin generic verbs
 * (request / get / post) over the Lightning REST API at `${baseUrl}/api/...`,
 * authenticated with a Bearer access token.
 *
 * Shapes follow Lightning's own controllers and JSON views (see the openfn spec
 * in openfn-api-specs): jobs and projects are JSON:API documents
 * (`{ data, included, links }`, each resource `{ type, id, attributes,
 * relationships, links }`), credentials are `{ credential }` / `{ credentials }`,
 * and errors are RFC 9457 problem documents. Jobs are read-only in Lightning, so
 * there is no POST /api/jobs; the write example creates a credential instead.
 */

type Rec = Record<string, any>;

function apiBase(req: FastifyRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol ?? 'http';
  const host = req.headers.host ?? 'localhost';
  // req.url is relative to this system's mount; keep the mount prefix if any.
  const full = req.raw.url ?? req.url;
  const mount = full.slice(0, full.indexOf('/api/'));
  return `${proto}://${host}${mount}/api`;
}

const PROBLEMS: Record<number, { title: string; code: string; detail: string }> = {
  400: { title: 'Bad Request', code: 'invalid_request', detail: 'The request body is not valid. See errors.' },
  404: { title: 'Not Found', code: 'not_found', detail: 'The requested resource does not exist.' },
};

function problem(reply: any, status: 400 | 404, errors?: Rec[]) {
  reply.code(status);
  return { type: 'about:blank', status, ...PROBLEMS[status], ...(errors ? { errors } : {}) };
}

function resource(base: string, type: 'jobs' | 'projects', rec: Rec, attrs: string[]) {
  const attributes: Rec = {};
  for (const a of attrs) if (rec[a] !== undefined) attributes[a] = rec[a];
  return { type, id: rec.id, attributes, relationships: {}, links: { self: `${base}/${type}/${rec.id}` } };
}

function listDoc(req: FastifyRequest, type: 'jobs' | 'projects', recs: Rec[], attrs: string[]) {
  const base = apiBase(req);
  const q = req.query as Rec;
  const pageSize = Math.max(1, Number(q.page_size) || 10);
  const pages = Math.max(1, Math.ceil(recs.length / pageSize));
  const page = Math.min(Math.max(1, Number(q.page) || 1), pages);
  const at = (p: number) => `${base}/${type}?page=${p}&page_size=${pageSize}`;
  return {
    data: recs.slice((page - 1) * pageSize, page * pageSize).map((r) => resource(base, type, r, attrs)),
    included: [],
    links: {
      self: at(page),
      first: at(1),
      last: at(pages),
      next: page < pages ? at(page + 1) : null,
      prev: page > 1 ? at(page - 1) : null,
    },
  };
}

const JOB_ATTRS = ['name'];
const PROJECT_ATTRS = ['name', 'description'];

const plugin: MockSystemPlugin = {
  name: 'openfn',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'access_token', role: 'secret', secret: { charset: 'hex', length: 40 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Jobs (read-only in Lightning) ---
    app.get('/api/jobs', async (req) => {
      const { project_id } = req.query as Rec;
      const jobs = store.list('jobs').filter((j: Rec) => !project_id || j.project_id === project_id);
      return listDoc(req, 'jobs', jobs, JOB_ATTRS);
    });

    app.get('/api/jobs/:id', async (req, reply) => {
      const found = store.get('jobs', String((req.params as Rec).id));
      if (!found) return problem(reply, 404);
      const base = apiBase(req);
      return { data: resource(base, 'jobs', found, JOB_ATTRS), included: [], links: { self: `${base}/jobs/${found.id}` } };
    });

    // --- Projects ---
    app.get('/api/projects', async (req) => listDoc(req, 'projects', store.list('projects'), PROJECT_ATTRS));

    app.get('/api/projects/:id', async (req, reply) => {
      const found = store.get('projects', String((req.params as Rec).id));
      if (!found) return problem(reply, 404);
      const base = apiBase(req);
      return {
        data: resource(base, 'projects', found, [...PROJECT_ATTRS, 'members']),
        included: [],
        links: { self: `${base}/projects/${found.id}` },
      };
    });

    // --- Credentials (owned by the token's user; secrets never echoed) ---
    app.post('/api/credentials', async (req, reply) => {
      const body = (req.body ?? {}) as Rec;
      if (typeof body.name !== 'string' || !body.name) {
        return problem(reply, 400, [{ path: 'name', code: 'required', detail: "can't be blank" }]);
      }
      const id = randomUUID();
      const now = nowIso();
      const projectLinks: Rec[] = Array.isArray(body.project_credentials) ? body.project_credentials : [];
      const credential = {
        id,
        name: body.name,
        schema: body.schema ?? 'raw',
        external_id: body.external_id ?? null,
        user_id: SEED_USER_ID,
        project_credentials: projectLinks.map((pc) => ({
          id: randomUUID(),
          project_id: pc.project_id,
          credential_id: id,
          inserted_at: now,
          updated_at: now,
        })),
        projects: projectLinks
          .map((pc) => store.get('projects', String(pc.project_id)))
          .filter(Boolean)
          .map((p: Rec) => ({ id: p.id, name: p.name, description: p.description ?? null })),
        inserted_at: now,
        updated_at: now,
      };
      store.create('credentials', id, credential);
      reply.code(201);
      return { credential, errors: {} };
    });
  },

  seed,
};

export default plugin;
