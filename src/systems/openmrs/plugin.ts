import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';

/**
 * OpenMRS (port 4012) — a REST + FHIR R4 hybrid.
 *
 * The OpenFn openmrs adaptor is a GENERIC REST wrapper: get/create/update/upsert/
 * destroy take a resource path (e.g. 'patient', 'patient/{uuid}',
 * 'patient/{uuid}/identifier') and prepend /ws/rest/v1/. Updates are POST-to-uuid
 * (not PATCH), delete is DELETE (?purge for hard delete), lists are the
 * { results, links } envelope with ?v=ref|default|full and ?q= search plus
 * startIndex/limit pagination. Because any resource name is valid, the REST API
 * is served by a single wildcard dispatcher (avoids router static-vs-param
 * backtracking) rather than a fixed route table. The fhir.* namespace
 * (fhir.get) reads /ws/fhir2/R4/{type} and returns searchset Bundles; the FHIR
 * Patients/Encounters/Observations are seeded from the same records as their
 * REST counterparts (see seed.ts) so the representations stay in sync.
 */

function restNotFound(): Record<string, any> {
  return {
    error: {
      message: 'The requested resource was not found',
      code: 'notFound',
      detail: '',
    },
  };
}

function fhirOperationOutcome(diagnostics: string): Record<string, any> {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'not-found', diagnostics }],
  };
}

/** Minimal ref representation ({ uuid, display, links }) used for ?v=ref. */
function toRef(item: any, resource: string, port: number): Record<string, any> {
  return {
    uuid: item.uuid,
    display: item.display,
    links: [
      { rel: 'self', uri: `http://localhost:${port}/ws/rest/v1/${resource}/${item.uuid}` },
    ],
  };
}

/** Case-insensitive substring match against the record (name/identifier/display). */
function matchesQuery(item: any, q: string): boolean {
  return JSON.stringify(item).toLowerCase().includes(q.toLowerCase());
}

/** Read a non-negative integer query param, falling back to `fallback`. */
function intParam(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Derive a display string for a freshly-created REST record. */
function deriveDisplay(resource: string, record: any): string {
  if (record.display) return record.display;
  if (resource === 'patient') {
    const id = record.identifiers?.[0]?.identifier;
    const person = record.person ?? {};
    const name =
      person.display ??
      (person.names?.[0]
        ? [person.names[0].givenName, person.names[0].familyName].filter(Boolean).join(' ')
        : undefined);
    return [id, name].filter(Boolean).join(' - ') || record.uuid;
  }
  if (resource === 'person') {
    const n = record.names?.[0];
    if (n) return [n.givenName, n.familyName].filter(Boolean).join(' ') || record.uuid;
  }
  return record.name || record.uuid;
}

function fhirBundle(items: any[], type: string, port: number, req: FastifyRequest): Record<string, any> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: items.length,
    link: [{ relation: 'self', url: `http://localhost:${port}${req.url}` }],
    entry: items.map((r) => ({
      fullUrl: `http://localhost:${port}/ws/fhir2/R4/${type}/${r.id}`,
      resource: r,
      search: { mode: 'match' },
    })),
  };
}

/** Split a wildcard param into non-empty path segments. */
function segmentsOf(req: FastifyRequest): string[] {
  return String((req.params as Record<string, any>)['*'] ?? '')
    .split('?')[0]
    .split('/')
    .filter(Boolean);
}

const plugin: MockSystemPlugin = {
  name: 'openmrs',
  specFile: 'openmrs.schema.json',
  // OpenMRS uses HTTP Basic auth; reject requests with no credentials.
  auth: { required: true, schemes: ['basic'] },
  credential: {
    type: 'userpass',
    authHeader: { scheme: 'basic', userField: 'username', passField: 'password' },
    fields: [
      { name: 'instanceUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const port = config.port;

    // ---- Shared REST helpers -------------------------------------------

    /** Build a { results, links } list envelope with ?q=, ?v=ref, paging. */
    const listEnvelope = (resource: string, req: FastifyRequest): Record<string, any> => {
      const { q, v } = req.query as Record<string, string | undefined>;
      let items = store.list(resource);
      if (q) items = items.filter((it) => matchesQuery(it, q));
      const total = items.length;
      const startIndex = intParam((req.query as any).startIndex, 0);
      const limit = intParam((req.query as any).limit, 50);
      let page = items.slice(startIndex, startIndex + limit);
      if (v === 'ref') page = page.map((it) => toRef(it, resource, port));
      const body: Record<string, any> = { results: page };
      const links: any[] = [];
      const base = `http://localhost:${port}/ws/rest/v1/${resource}`;
      if (startIndex + limit < total) {
        links.push({ rel: 'next', uri: `${base}?startIndex=${startIndex + limit}&limit=${limit}` });
      }
      if (startIndex > 0) {
        links.push({ rel: 'prev', uri: `${base}?startIndex=${Math.max(0, startIndex - limit)}&limit=${limit}` });
      }
      if (links.length) body.links = links;
      return body;
    };

    const getOne = (
      collection: string,
      uuid: string,
      req: FastifyRequest,
      reply: FastifyReply,
      display = collection
    ): any => {
      const item = store.get(collection, uuid);
      if (item === undefined) {
        reply.code(404);
        return restNotFound();
      }
      const { v } = req.query as Record<string, string | undefined>;
      return v === 'ref' ? toRef(item, display, port) : item;
    };

    const createIn = (resource: string, body: any, reply: FastifyReply): any => {
      const src = (body ?? {}) as Record<string, any>;
      const uuid = typeof src.uuid === 'string' && src.uuid ? src.uuid : randomUUID();
      const record: Record<string, any> = { ...src, uuid };
      record.display = deriveDisplay(resource, record);
      store.create(resource, uuid, record);
      reply.code(201);
      return record;
    };

    const updateIn = (collection: string, uuid: string, body: any, reply: FastifyReply): any => {
      const updated = store.update(collection, uuid, (body ?? {}) as Record<string, any>);
      if (updated === undefined) {
        reply.code(404);
        return restNotFound();
      }
      return updated;
    };

    const deleteIn = (collection: string, uuid: string, reply: FastifyReply): any => {
      if (!store.destroy(collection, uuid)) {
        reply.code(404);
        return restNotFound();
      }
      reply.code(204);
      return null;
    };

    // ---- Session (GET /ws/rest/v1/session) -----------------------------
    // Handled inside the wildcard dispatcher below (segs === ['session']).
    const sessionBody = () => ({
      authenticated: true,
      sessionId: 'mock-openmrs-session',
      locale: 'en_GB',
      user: {
        uuid: '61bc0a0a-0000-4000-8000-000000000001',
        display: (config.username as string) || 'admin',
        username: (config.username as string) || 'admin',
      },
    });

    // ---- OpenMRS REST API (/ws/rest/v1/**) -----------------------------
    // A single wildcard dispatcher covers every resource, subresource, id and
    // verb the generic adaptor can build.

    app.get('/ws/rest/v1/*', async (req, reply) => {
      const segs = segmentsOf(req);
      if (segs.length === 0) return { results: [] };
      if (segs.length === 1) {
        if (segs[0] === 'session') return sessionBody();
        return listEnvelope(segs[0], req);
      }
      if (segs.length === 2) return getOne(segs[0], segs[1], req, reply, segs[0]);
      // Subresource list: /{resource}/{uuid}/{sub}
      if (segs.length === 3) {
        return { results: store.list(`${segs[0]}:${segs[1]}:${segs[2]}`) };
      }
      // Subresource item: /{resource}/{uuid}/{sub}/{subId}
      const coll = `${segs[0]}:${segs[1]}:${segs[2]}`;
      return getOne(coll, segs[3], req, reply, `${segs[0]}/${segs[1]}/${segs[2]}`);
    });

    app.post('/ws/rest/v1/*', async (req, reply) => {
      const segs = segmentsOf(req);
      if (segs.length === 1) return createIn(segs[0], req.body, reply);
      if (segs.length === 2) return updateIn(segs[0], segs[1], req.body, reply);
      // Subresource create: /{resource}/{uuid}/{sub}
      if (segs.length === 3) {
        const coll = `${segs[0]}:${segs[1]}:${segs[2]}`;
        const body = (req.body ?? {}) as Record<string, any>;
        const uuid = typeof body.uuid === 'string' && body.uuid ? body.uuid : randomUUID();
        const record = { ...body, uuid };
        store.create(coll, uuid, record);
        reply.code(201);
        return record;
      }
      // Subresource update: /{resource}/{uuid}/{sub}/{subId}
      const coll = `${segs[0]}:${segs[1]}:${segs[2]}`;
      return updateIn(coll, segs[3], req.body, reply);
    });

    app.delete('/ws/rest/v1/*', async (req, reply) => {
      const segs = segmentsOf(req);
      if (segs.length === 2) return deleteIn(segs[0], segs[1], reply);
      if (segs.length === 4) {
        const coll = `${segs[0]}:${segs[1]}:${segs[2]}`;
        return deleteIn(coll, segs[3], reply);
      }
      reply.code(404);
      return restNotFound();
    });

    // ---- FHIR R4 module (/ws/fhir2/R4/{Type}) --------------------------
    const fhirResources: Array<{ type: string; collection: string }> = [
      { type: 'Patient', collection: 'fhir_patient' },
      { type: 'Encounter', collection: 'fhir_encounter' },
      { type: 'Observation', collection: 'fhir_observation' },
      { type: 'Condition', collection: 'fhir_condition' },
    ];

    for (const { type, collection } of fhirResources) {
      const base = `/ws/fhir2/R4/${type}`;

      // Search -> searchset Bundle.
      app.get(base, async (req: FastifyRequest) =>
        fhirBundle(store.list(collection), type, port, req)
      );

      // Read -> resource or 404 OperationOutcome.
      app.get(`${base}/:id`, async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = req.params as Record<string, string>;
        const item = store.get(collection, id);
        if (item === undefined) {
          reply.code(404);
          return fhirOperationOutcome(`${type}/${id} is not known`);
        }
        return item;
      });

      // Create -> 201 with server-assigned id.
      app.post(base, async (req: FastifyRequest, reply: FastifyReply) => {
        const body = (req.body ?? {}) as Record<string, any>;
        const id = typeof body.id === 'string' && body.id ? body.id : randomUUID();
        const record = { ...body, resourceType: type, id };
        store.create(collection, id, record);
        reply.code(201);
        reply.header('Location', `http://localhost:${port}${base}/${id}`);
        return record;
      });
    }
  },

  seed,
};

export default plugin;
