import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * MTN Mobile Money (MoMo) — Collection API. The mtn-momo adaptor exposes a single
 * generic `request(method, path, body, options)`. Before the first call it mints
 * a token:
 *
 *   POST /collection/token/  (HTTP Basic api_user:api_key,
 *                             header Ocp-Apim-Subscription-Key: <subscription_key>)
 *     → { access_token, token_type, expires_in }
 *
 * Every request then carries `Authorization: Bearer <token>`, the
 * `Ocp-Apim-Subscription-Key` header, and (per MoMo) a client-generated
 * `X-Reference-Id` UUID plus `X-Target-Environment`. "Request to pay" is async:
 * POST returns 202 with no body and you poll the referenced resource for status.
 * Since only `request` exists, we mock the common Collection endpoints so any
 * method/path the adaptor issues resolves.
 */

const plugin: MockSystemPlugin = {
  name: 'mtn-momo',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'subscription_key', role: 'secret', secret: { charset: 'hex', length: 32 } },
      { name: 'api_key', role: 'secret', secret: { charset: 'hex', length: 32 } },
      { name: 'api_user', role: 'static', value: '0e7c8f3a-9d21-4b6e-8a4f-3c2d1e0f9a8b' },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Token (called before the first request) ---
    // NB: the token POST carries an empty body and the request-to-pay POST carries
    // no Content-Type header; registerSystem's lenient body parsing accepts both.
    app.post('/collection/token/', async () => ({
      access_token: randomUUID().replace(/-/g, ''),
      token_type: 'access_token',
      expires_in: 3600,
    }));

    // --- Request to pay (async) ---
    // The client supplies the X-Reference-Id; MoMo answers 202 with no body and
    // you poll GET /collection/v1_0/requesttopay/:referenceId for the outcome.
    app.post('/collection/v1_0/requesttopay', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const headers = req.headers as Record<string, any>;
      const referenceId = String(headers['x-reference-id'] ?? randomUUID());
      store.create('requesttopay', referenceId, {
        referenceId,
        amount: body.amount ?? null,
        currency: body.currency ?? null,
        externalId: body.externalId ?? null,
        payer: body.payer ?? null,
        payerMessage: body.payerMessage ?? null,
        payeeNote: body.payeeNote ?? null,
        status: 'PENDING',
        createdOn: nowIso(),
      });
      reply.code(202);
      return {};
    });

    // --- Request to pay status ---
    app.get('/collection/v1_0/requesttopay/:referenceId', async (req, reply) => {
      const referenceId = String((req.params as Record<string, any>).referenceId);
      const found = store.get('requesttopay', referenceId);
      if (!found) {
        reply.code(404);
        return { code: 'RESOURCE_NOT_FOUND', message: 'Requested resource was not found.' };
      }
      // The live status resource echoes the request fields + status, not our
      // internal bookkeeping (referenceId / createdOn).
      return {
        amount: found.amount,
        currency: found.currency,
        externalId: found.externalId,
        payer: found.payer,
        payerMessage: found.payerMessage,
        payeeNote: found.payeeNote,
        status: found.status,
        ...(found.financialTransactionId ? { financialTransactionId: found.financialTransactionId } : {}),
      };
    });

    // --- Account balance ---
    app.get('/collection/v1_0/account/balance', async () =>
      store.get('account', 'balance') ?? { availableBalance: '0', currency: 'EUR' }
    );

    // --- Account holder active check ---
    app.get('/collection/v1_0/accountholder/msisdn/:msisdn/active', async () => ({
      result: true,
    }));

    // --- Basic user info (from the adaptor's own doc example) ---
    app.get('/collection/v1_0/accountholder/msisdn/:msisdn/basicuserinfo', async (req) => {
      const msisdn = String((req.params as Record<string, any>).msisdn);
      return {
        given_name: 'Sand',
        family_name: 'Box',
        birthdate: '1990-01-01',
        locale: 'en_US',
        gender: 'MALE',
        status: 'OK',
        msisdn,
      };
    });
  },

  seed,
};

export default plugin;
