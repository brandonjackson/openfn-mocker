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
  },

  seed,
};

export default plugin;
