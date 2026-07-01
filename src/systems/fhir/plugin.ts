import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, makeMeta, nowIso, DEFAULT_API_PATH } from './seed.js';

/**
 * FHIR (HAPI R4) — port 4013. Auth is none/Bearer (accept-all, handled by
 * createSystemServer). Routes live under a configurable apiPath (default
 * "fhir"), e.g. /fhir/Patient. Each FHIR resourceType is a store collection.
 *
 * FHIR's envelopes (searchset Bundle, OperationOutcome, meta/versionId,
 * transaction Bundle) don't map onto plain CRUD, so every route is a custom
 * handler here rather than engine registerCrud.
 */

/** Generate a resource id. FHIR accepts any 1..64 char id; a UUID is valid. */
function genId(): string {
  return randomUUID();
}

/** Build a FHIR OperationOutcome (used for 404s and delete acks). */
function operationOutcome(
  severity: string,
  code: string,
  diagnostics: string
): Record<string, any> {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity, code, diagnostics }],
  };
}

/**
 * Loosely match a resource against search params. Supports `_id` (exact id) and
 * `name` (substring over the name element); every other non-control param is a
 * case-insensitive substring match over the serialized resource.
 */
function matchesSearch(resource: any, params: Record<string, any>): boolean {
  for (const [rawKey, rawVal] of Object.entries(params)) {
    if (rawVal === undefined || rawVal === null) continue;
    const key = rawKey;
    const values = Array.isArray(rawVal) ? rawVal : [rawVal];
    const value = String(values[0]);
    if (value.length === 0) continue;

    if (key === '_id') {
      if (String(resource.id) !== value) return false;
      continue;
    }
    if (key === 'name' || key === 'family' || key === 'given') {
      const hay = JSON.stringify(resource.name ?? '').toLowerCase();
      if (!hay.includes(value.toLowerCase())) return false;
      continue;
    }
    // Control / paging params we accept but don't filter on.
    if (key.startsWith('_') || key === 'format') continue;

    // Generic loose match over the whole resource.
    const hay = JSON.stringify(resource).toLowerCase();
    if (!hay.includes(value.toLowerCase())) return false;
  }
  return true;
}

const plugin: MockSystemPlugin = {
  name: 'fhir',
  defaultPort: 4013,
  specFile: 'fhir-r4.openapi.json',

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const apiPath = String(config.apiPath || DEFAULT_API_PATH).replace(/^\/+|\/+$/g, '');
    const baseUrl = `http://localhost:${config.port}/${apiPath}`;

    // FHIR clients often send application/fhir+json; parse it like JSON.
    try {
      app.addContentTypeParser(
        'application/fhir+json',
        { parseAs: 'string' },
        (_req: unknown, body: string, done: (err: Error | null, body?: any) => void) => {
          try {
            done(null, body && body.length ? JSON.parse(body) : {});
          } catch (e) {
            done(e as Error);
          }
        }
      );
    } catch {
      /* parser may already be registered; ignore */
    }

    const fullUrl = (resourceType: string, id: string): string =>
      `${baseUrl}/${resourceType}/${id}`;

    const searchBundle = (resources: any[], req: FastifyRequest): Record<string, any> => {
      const selfUrl = `http://localhost:${config.port}${req.url}`;
      return {
        resourceType: 'Bundle',
        type: 'searchset',
        total: resources.length,
        link: [{ relation: 'self', url: selfUrl }],
        entry: resources.map((r) => ({
          fullUrl: fullUrl(r.resourceType ?? '', r.id),
          resource: r,
          search: { mode: 'match' },
        })),
      };
    };

    const doSearch = (req: FastifyRequest, resourceType: string): Record<string, any> => {
      const params: Record<string, any> = { ...((req.query as Record<string, any>) ?? {}) };
      const body = req.body;
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        Object.assign(params, body as Record<string, any>);
      }
      const items = store.list(resourceType).filter((r) => matchesSearch(r, params));
      return searchBundle(items, req);
    };

    // --- Transaction / batch Bundle at the base endpoint -----------------
    const processEntry = (entry: any): Record<string, any> => {
      const request = (entry && entry.request) || {};
      const method = String(request.method || 'POST').toUpperCase();
      const url = String(request.url || '');
      const segs = url.split('?')[0].split('/').filter(Boolean);
      const resourceType = segs[0];
      const idInUrl = segs[1];

      if (method === 'POST' && resourceType) {
        const id = genId();
        const resource = { ...(entry.resource ?? {}), resourceType, id, meta: makeMeta('1') };
        store.create(resourceType, id, resource);
        return {
          fullUrl: fullUrl(resourceType, id),
          resource,
          response: {
            status: '201 Created',
            location: `${resourceType}/${id}/_history/1`,
            etag: 'W/"1"',
            lastModified: nowIso(),
          },
        };
      }
      if (method === 'PUT' && resourceType && idInUrl) {
        const existing = store.get(resourceType, idInUrl);
        const versionId = existing
          ? String((parseInt(existing?.meta?.versionId ?? '1', 10) || 1) + 1)
          : '1';
        const resource = {
          ...(entry.resource ?? {}),
          resourceType,
          id: idInUrl,
          meta: makeMeta(versionId),
        };
        store.replace(resourceType, idInUrl, resource);
        return {
          resource,
          response: {
            status: existing ? '200 OK' : '201 Created',
            location: `${resourceType}/${idInUrl}/_history/${versionId}`,
            etag: `W/"${versionId}"`,
            lastModified: nowIso(),
          },
        };
      }
      if (method === 'GET' && resourceType && idInUrl) {
        const found = store.get(resourceType, idInUrl);
        if (found) return { resource: found, response: { status: '200 OK' } };
        return { response: { status: '404 Not Found' } };
      }
      if (method === 'DELETE' && resourceType && idInUrl) {
        store.destroy(resourceType, idInUrl);
        return { response: { status: '200 OK' } };
      }
      return { response: { status: '400 Bad Request' } };
    };

    const handleBundle = (req: FastifyRequest, reply: FastifyReply) => {
      const body = (req.body ?? {}) as any;
      if (body.resourceType !== 'Bundle') {
        reply.code(400);
        return operationOutcome(
          'error',
          'invalid',
          'Expected a Bundle resource at the base endpoint'
        );
      }
      const kind = body.type === 'batch' ? 'batch' : 'transaction';
      const entries = Array.isArray(body.entry) ? body.entry : [];
      return {
        resourceType: 'Bundle',
        type: `${kind}-response`,
        entry: entries.map((e: any) => processEntry(e)),
      };
    };

    // POST /fhir and POST /fhir/  (transaction/batch Bundle).
    app.post(`/${apiPath}`, async (req, reply) => handleBundle(req, reply));

    // --- Search ----------------------------------------------------------
    // POST /fhir/:resourceType/_search  (static segment wins over :id).
    app.post(`/${apiPath}/:resourceType/_search`, async (req) => {
      const { resourceType } = req.params as Record<string, any>;
      return doSearch(req, resourceType);
    });

    // GET /fhir/:resourceType  -> searchset Bundle.
    app.get(`/${apiPath}/:resourceType`, async (req) => {
      const { resourceType } = req.params as Record<string, any>;
      return doSearch(req, resourceType);
    });

    // --- Read ------------------------------------------------------------
    app.get(`/${apiPath}/:resourceType/:id`, async (req, reply) => {
      const { resourceType, id } = req.params as Record<string, any>;
      const found = store.get(resourceType, id);
      if (found === undefined) {
        reply.code(404);
        return operationOutcome('error', 'not-found', `Resource ${resourceType}/${id} not found`);
      }
      return found;
    });

    // --- Create ----------------------------------------------------------
    app.post(`/${apiPath}/:resourceType`, async (req, reply) => {
      const { resourceType } = req.params as Record<string, any>;
      const body = (req.body ?? {}) as Record<string, any>;
      const id = genId();
      const resource = { ...body, resourceType, id, meta: makeMeta('1') };
      store.create(resourceType, id, resource);
      reply.code(201);
      reply.header('Location', `${fullUrl(resourceType, id)}/_history/1`);
      reply.header('ETag', 'W/"1"');
      reply.header('Last-Modified', new Date().toUTCString());
      return resource;
    });

    // --- Update / upsert -------------------------------------------------
    app.put(`/${apiPath}/:resourceType/:id`, async (req, reply) => {
      const { resourceType, id } = req.params as Record<string, any>;
      const body = (req.body ?? {}) as Record<string, any>;
      const existing = store.get(resourceType, id);
      const versionId = existing
        ? String((parseInt(existing?.meta?.versionId ?? '1', 10) || 1) + 1)
        : '1';
      const resource = { ...body, resourceType, id, meta: makeMeta(versionId) };
      const { created } = store.upsert(resourceType, id, resource);
      reply.code(created ? 201 : 200);
      reply.header('Location', `${fullUrl(resourceType, id)}/_history/${versionId}`);
      reply.header('ETag', `W/"${versionId}"`);
      reply.header('Last-Modified', new Date().toUTCString());
      return resource;
    });

    // --- Delete (idempotent, HAPI-style 200 + OperationOutcome) ----------
    app.delete(`/${apiPath}/:resourceType/:id`, async (req, reply) => {
      const { resourceType, id } = req.params as Record<string, any>;
      store.destroy(resourceType, id);
      reply.code(200);
      return operationOutcome(
        'information',
        'informational',
        `Successfully deleted ${resourceType}/${id}`
      );
    });
  },

  seed,
};

export default plugin;
