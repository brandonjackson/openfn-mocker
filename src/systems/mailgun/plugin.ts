import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { selfUrlBase } from '../shared/self-url.js';
import { seed, buildStats, makeEvent, makeMessageId, DEFAULT_DOMAIN } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Mailgun (port 4018). Handlers are custom (Mailgun's endpoints are not plain
 * CRUD); event responses are served straight from the hand-written seed
 * (`seed.ts`), which models each event type the way the live events API returns
 * it. Fidelity to the mailgun `EventResponse` spec in openfn-api-specs is a
 * dev-time concern, not a runtime one — nothing here fetches a spec. Auth is
 * accept-all (handled by createSystemServer).
 */

/** From a Mailgun `to` param (string, csv, or array) get the first recipient. */
function firstRecipient(to: any): string | undefined {
  if (Array.isArray(to)) return to[0] != null ? String(to[0]) : undefined;
  if (typeof to === 'string') return to.split(',')[0].trim();
  return to == null ? undefined : String(to);
}

/**
 * Read one field from a form body: an already-parsed object (urlencoded or
 * JSON), or the raw multipart/form-data string mailgun.js sends for list
 * members and bulk validation uploads.
 */
function formField(body: unknown, name: string): string | undefined {
  if (body && typeof body === 'object') {
    const v = (body as Record<string, unknown>)[name];
    return v == null ? undefined : String(v);
  }
  if (typeof body !== 'string') return undefined;
  const m = body.match(new RegExp(`name="${name}"(?:; filename="[^"]*")?\\r?\\n(?:[^\\r\\n]+\\r?\\n)*\\r?\\n([\\s\\S]*?)\\r?\\n--`));
  return m?.[1];
}

/** A rough, deterministic verdict for a single address (no network, no randomness). */
function validateAddress(address: string): Record<string, unknown> {
  const [local = '', host = ''] = address.toLowerCase().split('@');
  const wellFormed = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
  const disposable = /(mailinator|guerrillamail|10minutemail|tempmail)\./.test(host);
  const role = ['admin', 'info', 'support', 'noreply', 'no-reply', 'postmaster', 'sales'].includes(local);
  const result = !wellFormed ? 'undeliverable' : disposable ? 'do_not_send' : 'deliverable';
  return {
    address,
    is_disposable_address: disposable,
    is_role_address: role,
    reason: wellFormed ? [] : ['failed custom grammar check'],
    result,
    risk: result === 'deliverable' ? (role ? 'medium' : 'low') : 'high',
    engagement: null,
  };
}

const plugin: MockSystemPlugin = {
  name: 'mailgun',
  // Mailgun uses HTTP Basic auth (`api:<key>`); reject requests with no credentials.
  auth: { required: true, schemes: ['basic'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'basic', user: 'api', passField: 'apiKey' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'domain', role: 'static', value: '{{domain}}' },
      { name: 'apiKey', role: 'secret', secret: { prefix: 'key-', charset: 'hex', length: 32 } },
    ],
  },
  // The stock adaptor (via mailgun.js) never reads `baseUrl` — it always talks
  // to the real api.mailgun.net. Only the local test-harness alias-proxy acts
  // on this; see README's "Local network aliasing".
  hostAliases: ['api.mailgun.net'],

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const configuredDomain = (config.domain as string) || DEFAULT_DOMAIN;

    // POST /v3/:domain/messages — send an email (form-urlencoded or JSON).
    app.post('/v3/:domain/messages', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const msgDomain = (req.params as Record<string, any>).domain || configuredDomain;
      const messageId = makeMessageId(msgDomain);
      const recipient = firstRecipient(body.to);

      store.create('messages', messageId, {
        id: messageId,
        from: body.from,
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        text: body.text,
        html: body.html,
        // The adaptor supports { attachment: { filename, data|url } }; record
        // whether one was present without persisting the (possibly large) bytes.
        hasAttachment: body.attachment != null,
        _createdAt: new Date().toISOString(),
      });

      // Synthesize a delivered event so it shows up in the events feed.
      const ev = makeEvent({
        event: 'delivered',
        domain: msgDomain,
        recipient,
        from: body.from,
        subject: body.subject,
        messageId,
      });
      store.create('events', ev.id, ev);

      reply.code(200);
      return { id: messageId, message: 'Queued. Thank you.' };
    });

    // GET /v3/:domain/events — list events with Mailgun paging envelope.
    app.get('/v3/:domain/events', async (req) => {
      const items = store.list('events');
      // Paging links must point back at this request's public origin (and keep
      // the mount prefix), not a hard-coded localhost — otherwise a client that
      // follows next/previous against a deployed instance (Railway, Render, ...)
      // gets an unreachable URL. selfUrlBase derives it from the request.
      const base = selfUrlBase(req, config.port);
      return {
        items,
        paging: {
          first: `${base}?page=first`,
          last: `${base}?page=last`,
          next: `${base}?page=next`,
          previous: `${base}?page=previous`,
        },
      };
    });

    // GET /v3/:domain/stats/total — aggregate stats.
    app.get('/v3/:domain/stats/total', async () => store.get('stats', 'total') ?? buildStats());

    // --- Mailing lists (mailgun.js client.lists.*, which the adaptor exposes on state.client) ---

    // GET /v3/lists/pages — client.lists.list(): the paginated list of mailing lists.
    app.get('/v3/lists/pages', async (req) => {
      const base = selfUrlBase(req, config.port);
      return {
        items: store.list('lists'),
        paging: {
          first: `${base}?page=first`,
          last: `${base}?page=last`,
          next: `${base}?page=next`,
          previous: `${base}?page=previous`,
        },
      };
    });

    // POST /v3/lists/:address/members — client.lists.members.createMember().
    app.post('/v3/lists/:address/members', async (req, reply) => {
      const listAddress = String((req.params as Record<string, string>).address);
      const list = store.get('lists', listAddress);
      if (!list) {
        reply.code(404);
        return { message: 'Mailing list not found' };
      }
      const address = formField(req.body, 'address');
      if (!address) {
        reply.code(400);
        return { message: "Missing mandatory parameter: 'address'" };
      }
      const member = {
        address,
        name: formField(req.body, 'name') ?? '',
        vars: {},
        subscribed: !['no', 'false'].includes(String(formField(req.body, 'subscribed') ?? 'yes').toLowerCase()),
      };
      const id = `${listAddress}|${address.toLowerCase()}`;
      const exists = store.get('listMembers', id);
      const upsert = ['yes', 'true'].includes(String(formField(req.body, 'upsert') ?? '').toLowerCase());
      if (exists && !upsert) {
        reply.code(400);
        return { message: `Address already exists '${address}'` };
      }
      if (exists) store.update('listMembers', id, member);
      else {
        store.create('listMembers', id, member);
        store.update('lists', listAddress, { members_count: Number(list.members_count ?? 0) + 1 });
      }
      return { member, message: 'Mailing list member has been created' };
    });

    // --- Email validation (Mailgun Validate API, v4) ---

    // GET /v4/address/validate?address= — client.validate.get(address).
    app.get('/v4/address/validate', async (req, reply) => {
      const address = (req.query as Record<string, string>).address;
      if (!address) {
        reply.code(400);
        return { message: "Missing mandatory parameter: 'address'" };
      }
      return validateAddress(String(address));
    });

    // POST /v4/address/validate/bulk/:listId — client.validate.multipleValidation.create():
    // upload a CSV (multipart `file`) and start a job, answered 202.
    app.post('/v4/address/validate/bulk/:listId', async (req, reply) => {
      const listId = String((req.params as Record<string, string>).listId);
      const csv = formField(req.body, 'file') ?? '';
      const rows = csv.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
      const addresses = rows.filter((r) => r.includes('@'));
      const verdicts = addresses.map((a) => validateAddress(a.split(',')[0]));
      const count = (k: string, v: string) => verdicts.filter((x) => x[k] === v).length;
      store.create('validationJobs', listId, {
        id: listId,
        created_at: Math.floor(Date.now() / 1000),
        quantity: addresses.length,
        records_processed: addresses.length,
        status: 'uploaded',
        is_preview: false,
        download_url: {
          csv: `https://storage.mailgun.net/validate/${listId}.csv.zip`,
          json: `https://storage.mailgun.net/validate/${listId}.json.zip`,
        },
        summary: {
          result: {
            deliverable: count('result', 'deliverable'),
            undeliverable: count('result', 'undeliverable'),
            do_not_send: count('result', 'do_not_send'),
            catch_all: 0,
            unknown: 0,
            accept_all: 0,
          },
          risk: { low: count('risk', 'low'), medium: count('risk', 'medium'), high: count('risk', 'high'), unknown: 0 },
          engagement: { highly_engaged: 0, engaged: 0, disengaged: 0, bot: 0, complainer: 0, no_data: addresses.length },
        },
      });
      reply.code(202);
      return { id: listId, message: 'The validation job was submitted.' };
    });

    // GET /v4/address/validate/bulk/:listId — client.validate.multipleValidation.get().
    app.get('/v4/address/validate/bulk/:listId', async (req, reply) => {
      const job = store.get('validationJobs', String((req.params as Record<string, string>).listId));
      if (!job) {
        reply.code(404);
        return { message: 'List not found' };
      }
      return job;
    });
  },

  seed,
};

export default plugin;
