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
  // The Mailchimp SDK builds https://<server>.api.mailchimp.com/3.0 (server is
  // the static `us1` here) and never reads a base URL (the `baseUrl` field above
  // is inert), so `pnpm test:usage` aliases the derived host to the mock. See
  // src/systems/types.ts `hostAliases`.
  hostAliases: ['us1.api.mailchimp.com'],

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

    // upsertMembers — the adaptor's upsertMembers calls the SDK's
    // batchListMembers(listId, { members }), which POSTs to /3.0/lists/:id and
    // returns new_members / updated_members / errors.
    app.post('/3.0/lists/:id', async (req) => {
      const members = Array.isArray((req.body as any)?.members) ? (req.body as any).members : [];
      return {
        new_members: [],
        updated_members: members,
        errors: [],
        total_created: 0,
        total_updated: members.length,
        error_count: 0,
      };
    });

    // A member upsert by subscriber hash (PUT) — kept for the single-member
    // upsert path some workflows use directly.
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

    // tagMembers — the adaptor's tagMembers calls batchSegmentMembers, which
    // POSTs to /3.0/lists/:id/segments/:segmentId and returns members_added etc.
    app.post('/3.0/lists/:id/segments/:segmentId', async () => ({
      members_added: [],
      members_removed: [],
      errors: [],
      total_added: 0,
      total_removed: 0,
      error_count: 0,
    }));

    // Add/remove tags on one member (updateMemberTags) — 204 No Content.
    app.post('/3.0/lists/:id/members/:hash/tags', async (_req, reply) => {
      reply.code(204);
      return null;
    });

    // deleteMember — the adaptor calls deleteListMemberPermanent, which POSTs to
    // .../actions/delete-permanent and returns 204 No Content.
    app.post('/3.0/lists/:id/members/:hash/actions/delete-permanent', async (req, reply) => {
      const hash = String((req.params as Record<string, any>).hash);
      store.destroy('members', hash);
      reply.code(204);
      return null;
    });

    // Archive a member (DELETE) — 204 No Content, kept for the archive path.
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
