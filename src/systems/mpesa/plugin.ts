import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Safaricom M-Pesa (Daraja API) — OAuth client-credentials.
 *
 * The mpesa adaptor first calls `GET /oauth/v1/generate?grant_type=client_credentials`
 * with HTTP Basic auth (consumer_key:consumer_secret) to mint a short-lived Bearer
 * token (cached for the process), then sends every other call as a POST under
 * `/mpesa/*` carrying `Authorization: Bearer <token>`.
 *
 * Daraja is asynchronous: STK push / B2B / status queries return only a
 * synchronous *acknowledgement* (`ResponseCode: "0"`) and the real outcome is
 * later POSTed to the caller's CallBackURL / ResultURL. We reproduce those ack
 * envelopes (HTTP 200, as Daraja does) but do not deliver the callbacks.
 * Covered: stkPush, checkTransactionStatus, registerUrl, remitTax, buyGoods
 * (plus the generic `request`).
 */

/** Random numeric string of `n` digits (for conversation ids etc.). */
function digits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** Daraja timestamp: YYYYMMDDHHmmss. */
function timestamp(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/** The async ack envelope Daraja returns for B2C/B2B/status requests. */
function asyncAck(): Record<string, any> {
  return {
    OriginatorConversationID: `${digits(5)}-${digits(8)}-1`,
    ConversationID: `AG_${timestamp()}_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    ResponseCode: '0',
    ResponseDescription: 'Accept the service request successfully.',
  };
}

const plugin: MockSystemPlugin = {
  name: 'mpesa',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'short_code', role: 'static', value: '600000' },
      { name: 'pass_key', role: 'secret', secret: { charset: 'hex', length: 64 } },
      { name: 'consumer_key', role: 'secret', secret: { charset: 'alnum', length: 47 } },
      { name: 'consumer_secret', role: 'secret', secret: { charset: 'alnum', length: 64 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- OAuth token (called once before the first request, then cached) ---
    // GET /oauth/v1/generate?grant_type=client_credentials, Basic-authed. Daraja
    // returns the token as a string plus expires_in in seconds (also a string).
    app.get('/oauth/v1/generate', async () => ({
      access_token: randomUUID().replace(/-/g, ''),
      expires_in: '3599',
    }));

    // --- STK push (Lipa na M-Pesa Online) ---
    // POST /mpesa/stkpush/v1/processrequest → synchronous accept ack. We record
    // the push into `transactions` keyed by the generated CheckoutRequestID.
    app.post('/mpesa/stkpush/v1/processrequest', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const checkoutRequestID = `ws_CO_${timestamp()}${digits(6)}`;
      const merchantRequestID = `${digits(5)}-${digits(8)}-1`;
      store.create('transactions', checkoutRequestID, {
        CheckoutRequestID: checkoutRequestID,
        MerchantRequestID: merchantRequestID,
        BusinessShortCode: body.BusinessShortCode,
        Amount: body.Amount,
        PhoneNumber: body.PhoneNumber,
        AccountReference: body.AccountReference,
        status: 'pending',
        created_on: nowIso(),
      });
      reply.code(200);
      return {
        MerchantRequestID: merchantRequestID,
        CheckoutRequestID: checkoutRequestID,
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing',
        CustomerMessage: 'Success. Request accepted for processing',
      };
    });

    // --- Transaction status query ---
    // POST /mpesa/transactionstatus/v1/query → async ack (result arrives on the
    // ResultURL). Purely an acknowledgement, exactly like the live API.
    app.post('/mpesa/transactionstatus/v1/query', async (_req, reply) => {
      reply.code(200);
      return asyncAck();
    });

    // --- C2B register URL ---
    // POST /mpesa/c2b/v1/registerurl → confirmation/validation URL registration.
    app.post('/mpesa/c2b/v1/registerurl', async (_req, reply) => {
      reply.code(200);
      return {
        OriginatorCoversationID: `${digits(5)}-${digits(8)}-1`,
        ResponseCode: '0',
        ResponseDescription: 'Success',
      };
    });

    // --- B2B remit tax (KRA) ---
    app.post('/mpesa/b2b/v1/remittax', async (_req, reply) => {
      reply.code(200);
      return asyncAck();
    });

    // --- B2B buy goods (business pay bill / till) ---
    app.post('/mpesa/b2b/v1/paymentrequest', async (_req, reply) => {
      reply.code(200);
      return asyncAck();
    });
  },

  seed,
};

export default plugin;
