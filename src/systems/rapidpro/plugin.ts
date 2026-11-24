import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { paginate } from '../../engine/response-generator.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * RapidPro / TextIt (a messaging Digital Public Good) — Token auth
 * ("Authorization: Token xxx", accept-all here). The public API lives under
 * /api/v2 with `.json` suffixes and uses the DRF envelope
 * `{ next, previous, results }` for reads.
 *
 * The rapidpro adaptor calls: addContact/upsertContact (POST contacts.json,
 * optionally `?urn=`/`?uuid=` to update), startFlow (POST flow_starts.json) and
 * sendBroadcast (POST broadcasts.json). The rest of the v2 API a workflow most
 * often reaches over HTTP with the same host and token is modelled too: groups
 * and fields, messages (list/send), labels, runs, campaigns, globals, the
 * workspace and bulk contact_actions.
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

  usage,
  guide,

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
      if (body.groups !== undefined) {
        const resolved = resolveRefs(store, 'groups', body.groups);
        if (resolved.missing.length) {
          reply.code(400);
          return { groups: resolved.missing.map((m) => `No such object: ${m}`) };
        }
        body.groups = resolved.refs;
      }
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
      // RapidPro's FlowField rejects a missing or unknown flow with a 400 keyed by field.
      const flow = typeof body.flow === 'string' ? store.get('flows', body.flow) : undefined;
      if (!flow) {
        reply.code(400);
        return { flow: [body.flow === undefined ? 'This field is required.' : `No such object: ${String(body.flow)}`] };
      }
      const uuid = randomUUID();
      const record = {
        uuid,
        flow: { uuid: flow.uuid, name: flow.name },
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
    app.get(`${API}/groups.json`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let items = store.list('groups');
      if (typeof q.uuid === 'string') items = items.filter((g) => g.uuid === q.uuid);
      if (typeof q.name === 'string') items = items.filter((g) => g.name === q.name);
      return drf(items);
    });
    // POST /api/v2/groups.json — create a manual group (201), or rename one with ?uuid= (200).
    app.post(`${API}/groups.json`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const q = (req.query ?? {}) as Record<string, any>;
      if (typeof body.name !== 'string' || !body.name.trim()) {
        reply.code(400);
        return { name: ['This field is required.'] };
      }
      if (typeof q.uuid === 'string') {
        const existing = store.get('groups', q.uuid);
        if (!existing) {
          reply.code(404);
          return { detail: 'Not found.' };
        }
        const updated = { ...existing, name: body.name };
        store.replace('groups', q.uuid, updated);
        return updated;
      }
      const uuid = randomUUID();
      const group = { uuid, name: body.name, query: null, status: 'ready', system: false, count: 0 };
      store.create('groups', uuid, group);
      reply.code(201);
      return group;
    });
    app.get(`${API}/fields.json`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let items = store.list('fields');
      if (typeof q.key === 'string') items = items.filter((f) => f.key === q.key);
      const page = paginate(items, {});
      return drf(page.items);
    });

    // --- Messages ---
    // GET /api/v2/messages.json — newest first; ?folder=inbox|sent|..., ?contact=, ?label=.
    app.get(`${API}/messages.json`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let items = store.list('messages');
      if (typeof q.uuid === 'string') items = items.filter((m) => m.uuid === q.uuid);
      if (typeof q.contact === 'string') items = items.filter((m) => m.contact?.uuid === q.contact);
      if (typeof q.label === 'string') {
        items = items.filter((m) => (m.labels ?? []).some((l: any) => l.uuid === q.label || l.name === q.label));
      }
      if (q.folder === 'inbox') items = items.filter((m) => m.direction === 'in' && !m.flow);
      else if (q.folder === 'flows') items = items.filter((m) => m.direction === 'in' && m.flow);
      else if (q.folder === 'sent') items = items.filter((m) => m.direction === 'out' && ['sent', 'delivered', 'read'].includes(m.status));
      else if (q.folder === 'outbox') items = items.filter((m) => m.direction === 'out' && ['queued', 'wired'].includes(m.status));
      else if (q.folder === 'failed') items = items.filter((m) => m.status === 'failed');
      else if (q.folder === 'archived') items = items.filter((m) => m.visibility === 'archived');
      return drf([...items].sort((a, b) => Number(b.id) - Number(a.id)));
    });
    // POST /api/v2/messages.json — send a message to one contact (201).
    app.post(`${API}/messages.json`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const contact = typeof body.contact === 'string' ? store.get('contacts', body.contact) : undefined;
      if (!contact) {
        reply.code(400);
        return { contact: ['No such object: ' + String(body.contact ?? '')] };
      }
      if (!body.text && !(Array.isArray(body.attachments) && body.attachments.length)) {
        reply.code(400);
        return { non_field_errors: ['Must provide either text or attachments.'] };
      }
      const ids = store.list('messages').map((m) => Number(m.id)).filter(Number.isFinite);
      const uuid = randomUUID();
      const message = {
        uuid,
        id: (ids.length ? Math.max(...ids) : 4000) + 1,
        broadcast: null,
        contact: { uuid: contact.uuid, name: contact.name ?? null },
        urn: Array.isArray(contact.urns) && contact.urns.length ? contact.urns[0] : null,
        channel: { uuid: 'chn-0001-sms', name: 'SMS Shortcode' },
        direction: 'out',
        type: 'text',
        status: 'queued',
        archived: false,
        visibility: 'visible',
        text: body.text ?? '',
        labels: [],
        flow: null,
        attachments: [],
        quick_replies: Array.isArray(body.quick_replies) ? body.quick_replies : [],
        created_on: nowIso(),
        sent_on: null,
        modified_on: nowIso(),
      };
      store.create('messages', uuid, message);
      reply.code(201);
      return message;
    });

    // --- Labels ---
    app.get(`${API}/labels.json`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let items = store.list('labels');
      if (typeof q.uuid === 'string') items = items.filter((l) => l.uuid === q.uuid);
      if (typeof q.name === 'string') items = items.filter((l) => l.name === q.name);
      return drf(items);
    });

    // --- Flow runs: GET /api/v2/runs.json?flow=<uuid>&contact=<uuid> ---
    app.get(`${API}/runs.json`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let items = store.list('runs');
      if (typeof q.flow === 'string') items = items.filter((r) => r.flow?.uuid === q.flow);
      if (typeof q.contact === 'string') items = items.filter((r) => r.contact?.uuid === q.contact);
      if (q.responded === 'true') items = items.filter((r) => r.responded);
      return drf(items);
    });

    // --- Campaigns and globals (reads) ---
    app.get(`${API}/campaigns.json`, async () => drf(store.list('campaigns')));
    app.get(`${API}/globals.json`, async () => drf(store.list('globals')));

    // --- Workspace ---
    app.get(`${API}/workspace.json`, async () => ({
      uuid: 'ws-0001-dho',
      name: 'District Health Office',
      country: 'SL',
      languages: ['eng'],
      timezone: 'Africa/Freetown',
      date_style: 'day_first',
      anon: false,
      credits: { used: -1, remaining: -1 },
      primary_language: 'eng',
    }));

    // --- Bulk contact actions: add/remove group, block/unblock, interrupt, delete (204) ---
    app.post(`${API}/contact_actions.json`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const actions = ['add', 'remove', 'block', 'unblock', 'interrupt', 'delete'];
      if (!Array.isArray(body.contacts) || !body.contacts.length || !actions.includes(body.action)) {
        reply.code(400);
        return { non_field_errors: ['contacts and a valid action are required.'] };
      }
      const group = typeof body.group === 'string'
        ? store.list('groups', (g) => g.uuid === body.group || g.name === body.group).at(0)
        : undefined;
      if ((body.action === 'add' || body.action === 'remove') && !group) {
        reply.code(400);
        return { group: ['No such object: ' + String(body.group ?? '')] };
      }
      for (const ref of body.contacts as string[]) {
        const contact = findContact(store, { uuid: ref, urn: ref });
        if (!contact) continue;
        if (body.action === 'delete') {
          store.destroy('contacts', contact.uuid);
          continue;
        }
        const next = { ...contact, modified_on: nowIso() };
        const groups: any[] = Array.isArray(contact.groups) ? contact.groups : [];
        if (body.action === 'add' && !groups.some((g) => g.uuid === group.uuid)) {
          next.groups = [...groups, { uuid: group.uuid, name: group.name }];
        } else if (body.action === 'remove') {
          next.groups = groups.filter((g) => g.uuid !== group.uuid);
        } else if (body.action === 'block') {
          Object.assign(next, { status: 'blocked', blocked: true });
        } else if (body.action === 'unblock') {
          Object.assign(next, { status: 'active', blocked: false });
        }
        store.replace('contacts', contact.uuid, next);
      }
      reply.code(204);
      return reply.send();
    });
  },

  seed,
};

/** Resolve uuids (or names) to `{ uuid, name }` refs; unknown ones come back in `missing`. */
function resolveRefs(store: DataStore, collection: string, value: unknown): { refs: Array<{ uuid: string; name: string }>; missing: string[] } {
  const refs: Array<{ uuid: string; name: string }> = [];
  const missing: string[] = [];
  for (const v of Array.isArray(value) ? value : []) {
    const key = typeof v === 'string' ? v : v && typeof v === 'object' ? (v as any).uuid : undefined;
    const hit = typeof key === 'string'
      ? store.get(collection, key) ?? store.list(collection, (r) => r.name === key).at(0)
      : undefined;
    if (hit) refs.push({ uuid: hit.uuid, name: hit.name });
    else missing.push(String(key));
  }
  return { refs, missing };
}

/** Normalize a list of uuids/refs into `[{ uuid }]` reference objects. */
function toRefList(value: unknown): Array<{ uuid: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? { uuid: v } : v && typeof v === 'object' ? v : null))
    .filter(Boolean) as Array<{ uuid: string }>;
}

export default plugin;
