import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso, makeHash } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Mailchimp Marketing API 3.0. The adaptor authenticates with HTTP Basic — any
 * username plus the API key as the password (`anystring:<apiKey>`) — against
 * `https://<server>.api.mailchimp.com/3.0` and manages audiences (lists),
 * members and batch operations. Member ids are the MD5 hash of the lowercased
 * email (the `subscriber_hash`), which this mock represents with a hex string.
 * Tagging and deletion return 204 No Content, matching the real API.
 */

/** Mailchimp "Resource Not Found" (RFC 7807) error envelope. */
function notFound(detail: string): Record<string, any> {
  return {
    type: 'https://mailchimp.com/developer/marketing/docs/errors/',
    title: 'Resource Not Found',
    status: 404,
    detail,
    instance: randomUUID(),
  };
}

const plugin: MockSystemPlugin = {
  name: 'mailchimp',
  auth: { required: true, schemes: ['basic'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'basic', user: 'anystring', passField: 'apiKey' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'server', role: 'static', value: 'us1' },
      { name: 'apiKey', role: 'secret', secret: { charset: 'hex', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Audiences (lists) ---
    app.get('/3.0/lists', async () => ({
      lists: store.list('lists'),
      total_items: store.count('lists'),
    }));

    app.get('/3.0/lists/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const list = store.get('lists', id);
      if (!list) {
        reply.code(404);
        return notFound(`The list ${id} does not exist.`);
      }
      return list;
    });

    // --- Members ---
    app.get('/3.0/lists/:id/members', async () => ({
      members: store.list('members'),
      total_items: store.count('members'),
    }));

    // addMember — 200 with the created member.
    app.post('/3.0/lists/:id/members', async (req) => {
      const id = String((req.params as Record<string, any>).id);
      const body = (req.body ?? {}) as Record<string, any>;
      const hash = makeHash();
      const member = {
        id: hash,
        email_address: body.email_address ?? null,
        status: body.status ?? 'subscribed',
        merge_fields: body.merge_fields ?? {},
        list_id: id,
        tags: [],
        timestamp_signup: nowIso(),
      };
      store.create('members', hash, member);
      return member;
    });

    app.get('/3.0/lists/:id/members/:hash', async (req, reply) => {
      const hash = String((req.params as Record<string, any>).hash);
      const member = store.get('members', hash);
      if (!member) {
        reply.code(404);
        return notFound('The requested resource could not be found.');
      }
      return member;
    });

    // updateMember — PATCH merges into an existing member.
    app.patch('/3.0/lists/:id/members/:hash', async (req, reply) => {
      const hash = String((req.params as Record<string, any>).hash);
      const body = (req.body ?? {}) as Record<string, any>;
      const updated = store.update('members', hash, body);
      if (!updated) {
        reply.code(404);
        return notFound('The requested resource could not be found.');
      }
      return updated;
    });

    // upsertMembers — PUT creates or replaces a member by subscriber hash.
    app.put('/3.0/lists/:id/members/:hash', async (req) => {
      const params = req.params as Record<string, any>;
      const id = String(params.id);
      const hash = String(params.hash);
      const body = (req.body ?? {}) as Record<string, any>;
      const member = {
        id: hash,
        email_address: body.email_address ?? null,
        status: body.status ?? 'subscribed',
        merge_fields: body.merge_fields ?? {},
        list_id: id,
        tags: [],
        last_changed: nowIso(),
      };
      store.upsert('members', hash, member);
      return member;
    });

    // tagMembers — 204 No Content.
    app.post('/3.0/lists/:id/members/:hash/tags', async (_req, reply) => {
      reply.code(204);
      return null;
    });

    // deleteMember — 204 No Content (archive/permanent delete).
    app.delete('/3.0/lists/:id/members/:hash', async (req, reply) => {
      const hash = String((req.params as Record<string, any>).hash);
      const existed = store.destroy('members', hash);
      if (!existed) {
        reply.code(404);
        return notFound('The requested resource could not be found.');
      }
      reply.code(204);
      return null;
    });

    // --- Batches ---
    app.post('/3.0/batches', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = randomUUID().replace(/-/g, '').slice(0, 10);
      const batch = {
        id,
        status: 'pending',
        total_operations: Array.isArray(body.operations) ? body.operations.length : 0,
        finished_operations: 0,
        errored_operations: 0,
        submitted_at: nowIso(),
      };
      store.create('batches', id, batch);
      return batch;
    });

    app.get('/3.0/batches', async () => ({
      batches: store.list('batches'),
      total_items: store.count('batches'),
    }));
  },

  seed,
};

export default plugin;
