import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DataStore } from '../../store.js';

/**
 * Shared FHIR R4 route registrar. Several DPGs OpenFn integrates with speak FHIR
 * over their own base path (openIMIS at /api/api_fhir_r4, iHRIS and OpenELIS at
 * /fhir), so the searchset-Bundle / read / create / update / delete / transaction
 * behaviour lives here once and each plugin supplies only its base path, resource
 * list, and (optionally) a login endpoint. The dedicated `fhir` system keeps its
 * own richer handler (history, CapabilityStatement search params); this helper is
 * the focused subset those adaptors actually call.
 */

export interface FhirMockOptions {
  /** Route prefix for the FHIR API, e.g. '' , '/fhir' or '/api/api_fhir_r4'. */
  apiSeg: string;
  /** Resource types advertised in the CapabilityStatement. */
  resourceTypes: string[];
  /** software.name in the CapabilityStatement. */
  softwareName: string;
  /** Shared listen port (for self-referential fullUrls). */
  port: number;
  /**
   * Optional token-exchange endpoint (e.g. openIMIS POST /api/api_fhir_r4/login/).
   * Registered as POST loginPath returning loginResponse() (default { token }).
   */
  loginPath?: string;
  loginResponse?: () => Record<string, any>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** A FHIR meta stanza with a versionId + lastUpdated. */
export function makeMeta(versionId = '1'): Record<string, any> {
  return { versionId, lastUpdated: nowIso() };
}

function operationOutcome(severity: string, code: string, diagnostics: string): Record<string, any> {
  return { resourceType: 'OperationOutcome', issue: [{ severity, code, diagnostics }] };
}

/**
 * Loose search matching: `_id` is exact, name/family/given match the name
 * element, every other non-control param is a case-insensitive substring match
 * over the serialized resource.
 */
function matchesSearch(resource: any, params: Record<string, any>): boolean {
  for (const [key, rawVal] of Object.entries(params)) {
    if (rawVal === undefined || rawVal === null) continue;
    const value = String(Array.isArray(rawVal) ? rawVal[0] : rawVal);
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
    if (key.startsWith('_') || key === 'format') continue;
    const hay = JSON.stringify(resource).toLowerCase();
    if (!hay.includes(value.toLowerCase())) return false;
  }
  return true;
}

/** Register a focused FHIR R4 surface on `app` under opts.apiSeg. */
export function registerFhirRoutes(app: FastifyInstance, store: DataStore, opts: FhirMockOptions): void {
  const { apiSeg, resourceTypes, softwareName, port } = opts;
  const baseUrl = `http://localhost:${port}${apiSeg}`;

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
    /* already registered on this instance; ignore */
  }

  const fullUrl = (resourceType: string, id: string): string => `${baseUrl}/${resourceType}/${id}`;

  if (opts.loginPath) {
    const loginResponse = opts.loginResponse ?? (() => ({ token: 'mock_fhir_token' }));
    app.post(opts.loginPath, async (_req, reply) => {
      reply.code(200);
      return loginResponse();
    });
  }

  const capabilityStatement = (): Record<string, any> => ({
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: nowIso(),
    publisher: 'openfn-mocker',
    kind: 'instance',
    software: { name: softwareName, version: '1.0.0' },
    implementation: { description: `openfn-mocker mock ${softwareName}`, url: baseUrl },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json', 'json'],
    rest: [
      {
        mode: 'server',
        resource: resourceTypes.map((type) => ({
          type,
          interaction: ['read', 'search-type', 'create', 'update', 'delete'].map((code) => ({ code })),
        })),
      },
    ],
  });

  const searchBundle = (resources: any[], req: FastifyRequest): Record<string, any> => ({
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    link: [{ relation: 'self', url: `http://localhost:${port}${req.url}` }],
    entry: resources.map((r) => ({
      fullUrl: fullUrl(r.resourceType ?? '', r.id),
      resource: r,
      search: { mode: 'match' },
    })),
  });

  const doSearch = (req: FastifyRequest, resourceType: string): Record<string, any> => {
    const params: Record<string, any> = { ...((req.query as Record<string, any>) ?? {}) };
    const body = req.body;
    if (body && typeof body === 'object' && !Array.isArray(body)) Object.assign(params, body);
    const items = store.list(resourceType).filter((r) => matchesSearch(r, params));
    return searchBundle(items, req);
  };

  // Transaction / batch Bundle at the base.
  const processEntry = (entry: any): Record<string, any> => {
    const request = (entry && entry.request) || {};
    const method = String(request.method || 'POST').toUpperCase();
    const segs = String(request.url || '').split('?')[0].split('/').filter(Boolean);
    const resourceType = segs[0];
    const idInUrl = segs[1];
    if (method === 'POST' && resourceType) {
      const id = randomUUID();
      const resource = { ...(entry.resource ?? {}), resourceType, id, meta: makeMeta('1') };
      store.create(resourceType, id, resource);
      return {
        fullUrl: fullUrl(resourceType, id),
        resource,
        response: { status: '201 Created', location: `${resourceType}/${id}/_history/1` },
      };
    }
    if (method === 'PUT' && resourceType && idInUrl) {
      const existing = store.get(resourceType, idInUrl);
      const resource = { ...(entry.resource ?? {}), resourceType, id: idInUrl, meta: makeMeta('1') };
      store.replace(resourceType, idInUrl, resource);
      return { resource, response: { status: existing ? '200 OK' : '201 Created' } };
    }
    if (method === 'GET' && resourceType && idInUrl) {
      const found = store.get(resourceType, idInUrl);
      return found
        ? { resource: found, response: { status: '200 OK' } }
        : { response: { status: '404 Not Found' } };
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
      return operationOutcome('error', 'invalid', 'Expected a Bundle resource at the base endpoint');
    }
    const kind = body.type === 'batch' ? 'batch' : 'transaction';
    const entries = Array.isArray(body.entry) ? body.entry : [];
    return { resourceType: 'Bundle', type: `${kind}-response`, entry: entries.map(processEntry) };
  };

  app.post(apiSeg || '/', async (req, reply) => handleBundle(req, reply));
  app.get(`${apiSeg}/metadata`, async () => capabilityStatement());

  app.post(`${apiSeg}/:resourceType/_search`, async (req) =>
    doSearch(req, (req.params as Record<string, any>).resourceType)
  );
  app.get(`${apiSeg}/:resourceType`, async (req) =>
    doSearch(req, (req.params as Record<string, any>).resourceType)
  );

  app.get(`${apiSeg}/:resourceType/:id`, async (req, reply) => {
    const { resourceType, id } = req.params as Record<string, any>;
    const found = store.get(resourceType, id);
    if (found === undefined) {
      reply.code(404);
      return operationOutcome('error', 'not-found', `Resource ${resourceType}/${id} not found`);
    }
    return found;
  });

  app.post(`${apiSeg}/:resourceType`, async (req, reply) => {
    const { resourceType } = req.params as Record<string, any>;
    const id = randomUUID();
    const resource = { ...((req.body ?? {}) as Record<string, any>), resourceType, id, meta: makeMeta('1') };
    store.create(resourceType, id, resource);
    reply.code(201);
    reply.header('Location', `${fullUrl(resourceType, id)}/_history/1`);
    return resource;
  });

  app.put(`${apiSeg}/:resourceType/:id`, async (req, reply) => {
    const { resourceType, id } = req.params as Record<string, any>;
    const existing = store.get(resourceType, id);
    const versionId = existing
      ? String((parseInt(existing?.meta?.versionId ?? '1', 10) || 1) + 1)
      : '1';
    const resource = { ...((req.body ?? {}) as Record<string, any>), resourceType, id, meta: makeMeta(versionId) };
    const { created } = store.upsert(resourceType, id, resource);
    reply.code(created ? 201 : 200);
    return resource;
  });

  app.delete(`${apiSeg}/:resourceType/:id`, async (req, reply) => {
    const { resourceType, id } = req.params as Record<string, any>;
    store.destroy(resourceType, id);
    reply.code(200);
    return operationOutcome('information', 'informational', `Successfully deleted ${resourceType}/${id}`);
  });
}
