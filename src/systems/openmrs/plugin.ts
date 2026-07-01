import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';

/**
 * OpenMRS (port 4012) — a REST + FHIR R4 hybrid.
 *
 * The endpoints are not plain CRUD (the OpenMRS REST API uses a { results: [] }
 * list envelope, a ?v=ref|default|full verbosity switch, ?q= search, updates via
 * POST /{uuid} rather than PATCH, and 204 on DELETE; the FHIR module returns
 * searchset Bundles + resources), so routes are registered as custom handlers.
 * The FHIR Patients/Encounters are seeded from the same records as their REST
 * counterparts (see seed.ts) so the two representations stay in sync.
 */

/** OpenMRS REST resources exposed under /ws/rest/v1/{resource}. */
const REST_RESOURCES = [
  'patient',
  'person',
  'encounter',
  'obs',
  'concept',
  'location',
  'encountertype',
] as const;

/** REST resources that accept writes (create/update/delete) in this mock. */
const WRITABLE = new Set(['patient', 'person', 'encounter', 'obs', 'concept']);

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

const plugin: MockSystemPlugin = {
  name: 'openmrs',
  specFile: 'openmrs.schema.json',

  overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const port = config.port;

    // ---- OpenMRS REST API (/ws/rest/v1/{resource}) ----
    for (const resource of REST_RESOURCES) {
      const base = `/ws/rest/v1/${resource}`;

      // List (with ?q= search and ?v=ref|default|full verbosity).
      app.get(base, async (req: FastifyRequest) => {
        const { q, v } = req.query as Record<string, string | undefined>;
        let items = store.list(resource);
        if (q) items = items.filter((it) => matchesQuery(it, q));
        if (v === 'ref') items = items.map((it) => toRef(it, resource, port));
        return { results: items };
      });

      // Get single (respects ?v=ref).
      app.get(`${base}/:uuid`, async (req: FastifyRequest, reply: FastifyReply) => {
        const { uuid } = req.params as Record<string, string>;
        const item = store.get(resource, uuid);
        if (item === undefined) {
          reply.code(404);
          return restNotFound();
        }
        const { v } = req.query as Record<string, string | undefined>;
        return v === 'ref' ? toRef(item, resource, port) : item;
      });

      if (WRITABLE.has(resource)) {
        // Create -> 201 with the created object (generated uuid).
        app.post(base, async (req: FastifyRequest, reply: FastifyReply) => {
          const body = (req.body ?? {}) as Record<string, any>;
          const uuid = typeof body.uuid === 'string' && body.uuid ? body.uuid : randomUUID();
          const record: Record<string, any> = { ...body, uuid };
          record.display = deriveDisplay(resource, record);
          store.create(resource, uuid, record);
          reply.code(201);
          return record;
        });

        // Update via POST /{uuid} (shallow merge), OpenMRS-style.
        app.post(`${base}/:uuid`, async (req: FastifyRequest, reply: FastifyReply) => {
          const { uuid } = req.params as Record<string, string>;
          const patch = (req.body ?? {}) as Record<string, any>;
          const updated = store.update(resource, uuid, patch);
          if (updated === undefined) {
            reply.code(404);
            return restNotFound();
          }
          return updated;
        });

        // Delete -> 204 No Content.
        app.delete(`${base}/:uuid`, async (req: FastifyRequest, reply: FastifyReply) => {
          const { uuid } = req.params as Record<string, string>;
          if (!store.destroy(resource, uuid)) {
            reply.code(404);
            return restNotFound();
          }
          reply.code(204);
          return null;
        });
      }
    }

    // ---- FHIR R4 module (/ws/fhir2/R4/{Patient|Encounter}) ----
    const fhirResources: Array<{ type: 'Patient' | 'Encounter'; collection: string }> = [
      { type: 'Patient', collection: 'fhir_patient' },
      { type: 'Encounter', collection: 'fhir_encounter' },
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
