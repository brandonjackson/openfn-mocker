import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, makeMeta, nowIso, DEFAULT_API_PATH, RESOURCE_TYPES } from './seed.js';

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
 * Build a minimal-but-faithful R4 CapabilityStatement listing the resource types
 * this mock serves. The fhir adaptor reaches this via `get('metadata')`.
 */
function capabilityStatement(baseUrl: string): Record<string, any> {
  const interactions = ['read', 'vread', 'search-type', 'create', 'update', 'delete', 'history-instance'];
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: nowIso(),
    publisher: 'openfn-mocker',
    kind: 'instance',
    software: { name: 'openfn-mocker FHIR', version: '1.0.0' },
    implementation: { description: 'openfn-mocker mock FHIR R4 server', url: baseUrl },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json', 'json'],
    rest: [
      {
        mode: 'server',
        interaction: [{ code: 'transaction' }, { code: 'batch' }],
        resource: RESOURCE_TYPES.map((type) => ({
          type,
          interaction: interactions.map((code) => ({ code })),
          versioning: 'versioned',
          searchParam: [
            { name: '_id', type: 'token' },
            { name: '_lastUpdated', type: 'date' },
          ],
        })),
      },
    ],
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
  specFile: 'fhir-r4.openapi.json',
  // FHIR auth is optional (open server, or Bearer). Do not gate requests.
  auth: { required: false },
  credential: {
    type: 'none',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiPath', role: 'static', value: '' },
    ],
  },

  usage: [
    { fn: "request", signature: "request(method, path, options = {}, callback = s => s)", description: "Send a generic HTTP request to the baseURL defined in config.",
      code: "request('GET', 'metadata')", apiRef: "ex0" },
    { fn: "post", signature: "post(path, data, options = {}, callback = s => s)", description: "Send a HTTP POST request to the baseURL defined in config.",
      code: "post('Bundle', { resourceType: 'Bundle' });", apiRef: "ex8" },
    { fn: "get", signature: "get(path, params = {}, options = {}, callback = s => s)", description: "Send a HTTP GET request to the baseURL defined in config.",
      code: "get('Patient/pat-1');", apiRef: "ex2" },
    { fn: "create", signature: "create(resourceType, resource, params, callback = s => s)", description: "Create a new resource; server assigns the id.",
      code: "create('Patient', {\n  name: [{ use: 'official', family: 'Kamara', given: ['Aminata'] }],\n});", apiRef: "ex7" },
    { fn: "createTransactionBundle", signature: "createTransactionBundle(entries, callback = s => s)", description: "Create a transaction Bundle to process multiple requests at once.",
      code: "createTransactionBundle([\n  { resource: { resourceType: 'Patient', name: [{ family: 'Kamara' }] }, request: { method: 'POST', url: 'Patient' } },\n]);", apiRef: "ex8" },
    { fn: "getClaim", signature: "getClaim(claimId, params, callback = s => s)", description: "Get a Claim by id, or search Claims with query params.",
      code: "getClaim('claim-1');", apiRef: "ex5" },
  ],

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    // apiPath may be explicitly empty (""), in which case the FHIR API lives at
    // the instance root — useful when the server is mounted at a /fhir prefix so
    // resources are served at /fhir/Patient rather than /fhir/fhir/Patient. An
    // omitted (null/undefined) apiPath falls back to the default.
    const apiPath = (config.apiPath != null ? String(config.apiPath) : DEFAULT_API_PATH).replace(
      /^\/+|\/+$/g,
      ''
    );
    const apiSeg = apiPath ? `/${apiPath}` : '';
    const baseUrl = `http://localhost:${config.port}${apiSeg}`;

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
    app.post(apiSeg || '/', async (req, reply) => handleBundle(req, reply));

    // --- Capability statement -------------------------------------------
    // GET /fhir/metadata -> CapabilityStatement (fhir adaptor: get('metadata')).
    // Static 'metadata' takes precedence over the :resourceType param route.
    app.get(`${apiSeg}/metadata`, async () => capabilityStatement(baseUrl));

    // --- Search ----------------------------------------------------------
    // POST /fhir/:resourceType/_search  (static segment wins over :id).
    app.post(`${apiSeg}/:resourceType/_search`, async (req) => {
      const { resourceType } = req.params as Record<string, any>;
      return doSearch(req, resourceType);
    });

    // GET /fhir/:resourceType  -> searchset Bundle.
    app.get(`${apiSeg}/:resourceType`, async (req) => {
      const { resourceType } = req.params as Record<string, any>;
      return doSearch(req, resourceType);
    });

    // --- History ---------------------------------------------------------
    // GET /fhir/:resourceType/:id/_history -> history Bundle. The store keeps
    // only the current version, so history has a single entry (the current one).
    const historyBundle = (resourceType: string, resource: any): Record<string, any> => {
      const versionId = String(resource?.meta?.versionId ?? '1');
      return {
        resourceType: 'Bundle',
        type: 'history',
        total: 1,
        entry: [
          {
            fullUrl: fullUrl(resourceType, resource.id),
            resource,
            request: { method: 'PUT', url: `${resourceType}/${resource.id}` },
            response: {
              status: '200 OK',
              etag: `W/"${versionId}"`,
              lastModified: resource?.meta?.lastUpdated ?? nowIso(),
            },
          },
        ],
      };
    };

    app.get(`${apiSeg}/:resourceType/:id/_history`, async (req, reply) => {
      const { resourceType, id } = req.params as Record<string, any>;
      const found = store.get(resourceType, id);
      if (found === undefined) {
        reply.code(404);
        return operationOutcome('error', 'not-found', `Resource ${resourceType}/${id} not found`);
      }
      return historyBundle(resourceType, found);
    });

    // GET /fhir/:resourceType/:id/_history/:vid -> a specific version (mock
    // keeps only the current one, so any vid returns it).
    app.get(`${apiSeg}/:resourceType/:id/_history/:vid`, async (req, reply) => {
      const { resourceType, id } = req.params as Record<string, any>;
      const found = store.get(resourceType, id);
      if (found === undefined) {
        reply.code(404);
        return operationOutcome('error', 'not-found', `Resource ${resourceType}/${id} not found`);
      }
      return found;
    });

    // --- Read ------------------------------------------------------------
    app.get(`${apiSeg}/:resourceType/:id`, async (req, reply) => {
      const { resourceType, id } = req.params as Record<string, any>;
      const found = store.get(resourceType, id);
      if (found === undefined) {
        reply.code(404);
        return operationOutcome('error', 'not-found', `Resource ${resourceType}/${id} not found`);
      }
      return found;
    });

    // --- Create ----------------------------------------------------------
    app.post(`${apiSeg}/:resourceType`, async (req, reply) => {
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
    app.put(`${apiSeg}/:resourceType/:id`, async (req, reply) => {
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
    app.delete(`${apiSeg}/:resourceType/:id`, async (req, reply) => {
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
