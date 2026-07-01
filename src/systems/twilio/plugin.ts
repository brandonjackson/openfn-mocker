import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, accountSidFrom, buildMessage, rfc2822, DEFAULT_ACCOUNT_SID } from './seed.js';

/**
 * Twilio (port 4019). Basic auth (accountSid:authToken) is accept-all. Requests
 * are form-urlencoded with PascalCase params (To/From/Body/MediaUrl); responses
 * are snake_case JSON matching the real Message/Call resource shapes.
 *
 * Quirks implemented:
 *  - POST Messages.json stores a message with status "queued" and returns 201.
 *  - GET Messages/:msgSid.json AUTO-ADVANCES status queued->sent->delivered on
 *    each read and persists the advance in the store.
 *  - List envelopes use Twilio's page/page_size/start/end/*_uri fields.
 */

/** Twilio list envelope shared by Messages and Calls. */
function listEnvelope(key: string, items: any[], uriPath: string) {
  return {
    [key]: items,
    page: 0,
    page_size: 50,
    start: 0,
    end: items.length > 0 ? items.length - 1 : 0,
    uri: uriPath,
    first_page_uri: `${uriPath}?PageSize=50&Page=0`,
    next_page_uri: null,
    previous_page_uri: null,
  };
}

/** Advance message status one step: queued -> sent -> delivered (terminal). */
function nextStatus(current: string): string | undefined {
  if (current === 'queued') return 'sent';
  if (current === 'sent') return 'delivered';
  return undefined;
}

const plugin: MockSystemPlugin = {
  name: 'twilio',
  defaultPort: 4019,
  specFile: 'twilio.openapi.json',

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const configuredSid = accountSidFrom(config);

    const sidOf = (req: FastifyRequest): string =>
      (req.params as Record<string, any>).sid || configuredSid || DEFAULT_ACCOUNT_SID;

    // POST — send an SMS message (form-urlencoded PascalCase params).
    app.post('/2010-04-01/Accounts/:sid/Messages.json', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const accountSid = sidOf(req);
      const now = new Date();
      const rec = buildMessage({
        accountSid,
        from: body.From != null ? String(body.From) : '',
        to: body.To != null ? String(body.To) : '',
        body: body.Body != null ? String(body.Body) : '',
        status: 'queued',
        createdAt: now,
        sentAt: null,
      });
      if (body.MediaUrl != null) rec.num_media = '1';
      store.create('messages', rec.sid, rec);
      reply.code(201);
      return rec;
    });

    // GET list — all messages for the account.
    app.get('/2010-04-01/Accounts/:sid/Messages.json', async (req) => {
      const items = store.list('messages');
      return listEnvelope('messages', items, req.url.split('?')[0]);
    });

    // GET single — auto-advance status on each read, then persist.
    app.get('/2010-04-01/Accounts/:sid/Messages/:msgSid.json', async (req, reply) => {
      const msgSid = String((req.params as Record<string, any>).msgSid);
      const msg = store.get('messages', msgSid);
      if (msg === undefined) {
        reply.code(404);
        return {
          code: 20404,
          message: 'The requested resource was not found',
          more_info: 'https://www.twilio.com/docs/errors/20404',
          status: 404,
        };
      }
      const advanced = nextStatus(msg.status);
      if (advanced) {
        const now = new Date();
        const patch: Record<string, any> = { status: advanced, date_updated: rfc2822(now) };
        if (advanced === 'sent' && !msg.date_sent) patch.date_sent = rfc2822(now);
        if (advanced === 'delivered') patch.price = '-0.00750';
        return store.update('messages', msgSid, patch);
      }
      return msg;
    });

    // GET list — calls for the account.
    app.get('/2010-04-01/Accounts/:sid/Calls.json', async (req) => {
      const items = store.list('calls');
      return listEnvelope('calls', items, req.url.split('?')[0]);
    });
  },

  seed,
};

export default plugin;
