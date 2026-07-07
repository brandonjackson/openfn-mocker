import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Gmail API v1 (gmail.googleapis.com/gmail/v1). The gmail adaptor builds a
 * `googleapis` client from a Bearer access token and calls the users.messages
 * resource:
 *   - getContentsFromMessages -> GET  /gmail/v1/users/{userId}/messages   (list ids by ?q)
 *                                GET  /gmail/v1/users/{userId}/messages/{id}?format=full
 *                                GET  /gmail/v1/users/{userId}/messages/{mid}/attachments/{id}
 *   - sendMessage            -> POST /gmail/v1/users/{userId}/messages/send  ({ raw })
 *
 * Listings use `{ messages: [{ id, threadId }], resultSizeEstimate }`; a single
 * message is a full resource with `payload.headers` and `payload.parts`; send
 * returns the created `{ id, threadId, labelIds }`. The mock never paginates
 * (no nextPageToken) so the adaptor's paging loop terminates after one page.
 */

/** A Gmail-style hex id (as returned for new messages/threads). */
function newId(): string {
  return randomBytes(8).toString('hex');
}

/** Read the Subject header off a stored message (empty string if absent). */
function subjectOf(message: Record<string, any>): string {
  const headers: any[] = message?.payload?.headers ?? [];
  return headers.find((h) => String(h.name).toLowerCase() === 'subject')?.value ?? '';
}

/**
 * Best-effort Gmail search: if `q` carries a `subject:<term>` token, keep only
 * messages whose Subject contains it (Gmail encodes spaces in a phrase as `+`);
 * any other query operators are ignored and all messages are returned. A query
 * that matches nothing yields an empty list, exactly as the real API would.
 */
function matchesQuery(message: Record<string, any>, q: unknown): boolean {
  if (typeof q !== 'string' || !q.trim()) return true;
  const subjectToken = q.split(/\s+/).find((t) => t.toLowerCase().startsWith('subject:'));
  if (!subjectToken) return true;
  const term = subjectToken.slice('subject:'.length).replace(/\+/g, ' ').toLowerCase();
  if (!term) return true;
  return subjectOf(message).toLowerCase().includes(term);
}

function notFound(reply: any, message: string) {
  reply.code(404);
  return { error: { code: 404, message, errors: [{ message, reason: 'notFound' }] } };
}

const plugin: MockSystemPlugin = {
  name: 'gmail',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-access-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'access_token', role: 'secret', secret: { charset: 'hex', length: 40 } },
    ],
  },
  // The googleapis client hardcodes gmail.googleapis.com (no configurable base
  // URL — the `baseUrl` field above is inert), so `pnpm test:usage` aliases that
  // host to the mock. See src/systems/types.ts `hostAliases`.
  hostAliases: ['gmail.googleapis.com'],

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // GET /gmail/v1/users/:userId/messages — list message ids, optionally
    // filtered by the ?q search query. Only id + threadId are returned here.
    app.get('/gmail/v1/users/:userId/messages', async (req) => {
      const q = (req.query as Record<string, any>).q;
      const matched = store.list('messages').filter((m) => matchesQuery(m, q));
      return {
        messages: matched.map((m) => ({ id: m.id, threadId: m.threadId })),
        resultSizeEstimate: matched.length,
      };
    });

    // GET /gmail/v1/users/:userId/messages/:id — a single message. `format=full`
    // returns the payload with headers and parts.
    app.get('/gmail/v1/users/:userId/messages/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const message = store.get('messages', id);
      if (!message) return notFound(reply, `Message ${id} not found`);
      return message;
    });

    // GET /gmail/v1/users/:userId/messages/:messageId/attachments/:attId —
    // the base64url-encoded bytes of one attachment.
    app.get(
      '/gmail/v1/users/:userId/messages/:messageId/attachments/:attId',
      async (req, reply) => {
        const attId = String((req.params as Record<string, any>).attId);
        const attachment = store.get('attachments', attId);
        if (!attachment) return notFound(reply, `Attachment ${attId} not found`);
        return { attachmentId: attId, size: attachment.size, data: attachment.data };
      }
    );

    // POST /gmail/v1/users/:userId/messages/send — send a message. The body is
    // `{ raw }` (a base64url-encoded MIME message); we store a stateful record
    // and echo back the created message resource.
    app.post('/gmail/v1/users/:userId/messages/send', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = newId();
      const threadId = newId();
      const message = {
        id,
        threadId,
        labelIds: ['SENT'],
        snippet: '',
        raw: typeof body.raw === 'string' ? body.raw : undefined,
        payload: { headers: [], parts: [] },
      };
      store.create('messages', id, message);
      return { id, threadId, labelIds: ['SENT'] };
    });
  },

  seed,
};

export default plugin;
