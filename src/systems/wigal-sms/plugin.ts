import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Wigal SMS (Frog API, Ghana). The wigal-sms adaptor's only operation is
 * `sendSms(data)` → POST /api/v3/sms/send, authenticated with `API-KEY` and
 * `USERNAME` headers (accept-all here). Frog answers 200 with a fixed envelope
 * `{ status: 'ACCEPTED', message: 'Message Accepted For Processing' }`. Each
 * destination in the batch is stored so sends can be inspected.
 */

const ACCEPTED = { status: 'ACCEPTED', message: 'Message Accepted For Processing' };

/** Frog-style message id. */
function genMsgId(): string {
  return 'MSG' + String(randomInt(0, 1_000_000_000)).padStart(10, '0');
}

const plugin: MockSystemPlugin = {
  name: 'wigal-sms',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'openfn' },
      { name: 'apiKey', role: 'secret', secret: { charset: 'hex', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST /api/v3/sms/send — sendSms. Stores one record per destination (a
    // destination may carry its own message/msgid for personalized sends) and
    // returns Frog's fixed ACCEPTED envelope.
    app.post('/api/v3/sms/send', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const destinations = Array.isArray(body.destinations) ? body.destinations : [];
      const now = new Date().toISOString();
      for (const d of destinations.length ? destinations : [{}]) {
        const dest = (d ?? {}) as Record<string, any>;
        const msgid = dest.msgid ?? genMsgId();
        store.create('messages', msgid, {
          msgid,
          senderid: body.senderid ?? null,
          destination: dest.destination ?? null,
          message: dest.message ?? body.message ?? null,
          smstype: dest.smstype ?? body.smstype ?? 'text',
          status: 'ACCEPTED',
          sentAt: now,
        });
      }
      reply.code(200);
      return ACCEPTED;
    });
  },

  seed,
};

export default plugin;
