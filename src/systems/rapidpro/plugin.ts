import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { paginate } from '../../engine/response-generator.js';
import { seed, nowIso } from './seed.js';

/**
 * RapidPro / TextIt (a messaging Digital Public Good) — Token auth
 * ("Authorization: Token xxx", accept-all here). The public API lives under
 * /api/v2 with `.json` suffixes and uses the DRF envelope
 * `{ next, previous, results }` for reads.
 *
 * The rapidpro adaptor calls: addContact/upsertContact (POST contacts.json,
 * optionally `?urn=`/`?uuid=` to update), startFlow (POST flow_starts.json) and
 * sendBroadcast (POST broadcasts.json). Read endpoints for contacts/flows/
 * groups/fields are included so workflows can look things up.
 */

const API = '/api/v2';

/** DRF list envelope. */
function drf(items: any[]): Record<string, any> {
  return { next: null, previous: null, results: items };
}

/** Find a contact by uuid or by any of its urns. */
function findContact(store: DataStore, opts: { uuid?: string; urn?: string }): any | undefined {
  if (opts.uuid) {
    const byUuid = store.get('contacts', opts.uuid);
    if (byUuid) return byUuid;
  }
  if (opts.urn) {
    return store.list('contacts', (c) => Array.isArray(c.urns) && c.urns.includes(opts.urn)).at(0);
  }
  return undefined;
}

const plugin: MockSystemPlugin = {
  name: 'rapidpro',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'host', role: 'url' },
      { name: 'token', role: 'secret', secret: { charset: 'hex', length: 40 } },
      { name: 'apiVersion', role: 'static', value: 'v2' },
    ],
  },

  usage: [
    { fn: "addContact", signature: "addContact(params, callback = s => s)", description: "Add a new contact to RapidPro.",
      code: "addContact({\n  name: 'Amara', language: 'eng', urns: ['tel:+23276000000']\n});", apiRef: "ex1" },
    { fn: "upsertContact", signature: "upsertContact(params, callback = s => s)", description: "Upsert a contact to RapidPro, deduplicating on the URN value.",
      code: "upsertContact({\n  name: 'Amara', language: 'eng', urns: ['tel:+23276000000']\n});", apiRef: "ex1" },
    { fn: "startFlow", signature: "startFlow(params, callback = s => s)", description: "Start a RapidPro flow for a number of contacts.",
      code: "startFlow({\n  flow: 'f5901b62-ba76-4003-9c62-72fdacc1b7b7',\n  contacts: ['a052b00c-15b3-48e6-9771-edbaa277a353']\n});", apiRef: "ex2" },
    { fn: "sendBroadcast", signature: "sendBroadcast(params, callback = s => s)", description: "Send a message to a list of contacts and/or URNs.",
      code: "sendBroadcast({\n  text: 'Your ANC appointment is tomorrow',\n  urns: ['tel:+23276000000']\n});", apiRef: "ex3" },
  ],

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Contacts ---
    // GET /api/v2/contacts.json — DRF list, filterable by ?uuid= / ?urn= / ?group=.
    app.get(`${API}/contacts.json`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let items = store.list('contacts');
      if (typeof q.uuid === 'string') items = items.filter((c) => c.uuid === q.uuid);
      if (typeof q.urn === 'string') items = items.filter((c) => Array.isArray(c.urns) && c.urns.includes(q.urn));
      if (typeof q.group === 'string') {
        items = items.filter((c) => Array.isArray(c.groups) && c.groups.some((g: any) => g.name === q.group || g.uuid === q.group));
      }
      return drf(items);
    });

    // POST /api/v2/contacts.json — create, or update when ?uuid=/?urn= matches an
    // existing contact (addContact / upsertContact). Returns the contact.
    app.post(`${API}/contacts.json`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const q = (req.query ?? {}) as Record<string, any>;
      const urnFromBody = Array.isArray(body.urns) && body.urns.length ? String(body.urns[0]) : undefined;
      const existing = findContact(store, {
        uuid: typeof q.uuid === 'string' ? q.uuid : undefined,
        urn: typeof q.urn === 'string' ? q.urn : urnFromBody,
      });

      if (existing) {
        const merged = {
          ...existing,
          ...body,
          uuid: existing.uuid,
          modified_on: nowIso(),
        };
        store.replace('contacts', existing.uuid, merged);
        reply.code(200);
        return merged;
      }

      const uuid = randomUUID();
      const contact = {
        ...body,
        uuid,
        name: body.name ?? null,
        language: body.language ?? null,
        urns: Array.isArray(body.urns) ? body.urns : [],
        groups: Array.isArray(body.groups) ? body.groups : [],
        fields: body.fields ?? {},
        blocked: false,
        stopped: false,
        created_on: nowIso(),
        modified_on: nowIso(),
      };
      store.create('contacts', uuid, contact);
      reply.code(201);
      return contact;
    });

    // --- Flow starts (startFlow) ---
    app.get(`${API}/flow_starts.json`, async () => drf(store.list('flow_starts')));
    app.post(`${API}/flow_starts.json`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const uuid = randomUUID();
      const record = {
        uuid,
        flow: { uuid: body.flow ?? null, name: flowName(store, body.flow) },
        status: 'pending',
        groups: toRefList(body.groups),
        contacts: toRefList(body.contacts),
        restart_participants: body.restart_participants ?? true,
        exclude_active: body.exclude_active ?? false,
        extra: body.extra ?? body.params ?? {},
        created_on: nowIso(),
        modified_on: nowIso(),
      };
      store.create('flow_starts', uuid, record);
      reply.code(201);
      return record;
    });

    // --- Broadcasts (sendBroadcast) ---
    app.get(`${API}/broadcasts.json`, async () => drf(store.list('broadcasts')));
    app.post(`${API}/broadcasts.json`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const existingIds = store.list('broadcasts').map((b) => Number(b.id)).filter(Number.isFinite);
      const id = (existingIds.length ? Math.max(...existingIds) : 30000) + 1;
      const record = {
        id,
        status: 'queued',
        urns: Array.isArray(body.urns) ? body.urns : [],
        contacts: toRefList(body.contacts),
        groups: toRefList(body.groups),
        text: typeof body.text === 'object' ? body.text : { base: body.text ?? '' },
        created_on: nowIso(),
      };
      store.create('broadcasts', String(id), record);
      reply.code(201);
      return record;
    });

    // --- Reference reads (flows / groups / fields) ---
    app.get(`${API}/flows.json`, async () => drf(store.list('flows')));
    app.get(`${API}/groups.json`, async () => drf(store.list('groups')));
    app.get(`${API}/fields.json`, async (req) => {
      // RapidPro pages fields; support a simple ?before/limit-less passthrough.
      const page = paginate(store.list('fields'), {});
      return drf(page.items);
    });
  },

  seed,
};

/** Resolve a flow uuid to its seeded name (null when unknown). */
function flowName(store: DataStore, uuid: unknown): string | null {
  if (typeof uuid !== 'string') return null;
  const flow = store.get('flows', uuid);
  return flow?.name ?? null;
}

/** Normalize a list of uuids/refs into `[{ uuid }]` reference objects. */
function toRefList(value: unknown): Array<{ uuid: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? { uuid: v } : v && typeof v === 'object' ? v : null))
    .filter(Boolean) as Array<{ uuid: string }>;
}

export default plugin;
