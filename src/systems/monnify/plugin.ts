import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Monnify (Nigeria) payments. The monnify adaptor exposes generic get / list /
 * post / request helpers over the Monnify REST API, and mints a Bearer token
 * before the first call:
 *
 *   POST /api/v1/auth/login  (HTTP Basic apiKey:secretKey)
 *     → { requestSuccessful, responseBody: { accessToken, expiresIn } }
 *
 * Every Monnify response uses the `{ requestSuccessful, responseMessage,
 * responseCode, responseBody }` envelope. The `list` helper specifically expects
 * a *paginated* responseBody with `content: [...]` and a `last` boolean, so the
 * disbursements search endpoint returns that shape. Monnify signals success via
 * `requestSuccessful`/`responseCode` and returns HTTP 200 even for creates.
 */

/** Standard Monnify success envelope. */
function envelope(responseBody: any, responseMessage = 'success'): Record<string, any> {
  return { requestSuccessful: true, responseMessage, responseCode: '0', responseBody };
}

/** Paginated responseBody, as the `list` helper (content + last) expects. */
function page(content: any[]): Record<string, any> {
  return {
    content,
    pageable: { pageNumber: 0, pageSize: 100 },
    totalElements: content.length,
    totalPages: 1,
    number: 0,
    size: 100,
    numberOfElements: content.length,
    first: true,
    last: true,
    empty: content.length === 0,
  };
}

const plugin: MockSystemPlugin = {
  name: 'monnify',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiKey', role: 'static', value: 'MK_TEST_YRP3AJ7RQ2' },
      { name: 'secretKey', role: 'secret', secret: { charset: 'alnum', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Auth: exchange apiKey:secretKey (Basic) for a Bearer token ---
    app.post('/api/v1/auth/login', async () =>
      envelope({
        accessToken: randomUUID().replace(/-/g, ''),
        expiresIn: 3600,
      })
    );

    // --- Initialize a transaction (post) ---
    // Monnify returns HTTP 200 with the created transaction reference + checkout URL.
    app.post('/api/v1/merchant/transactions/init-transaction', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const reference = `MNFY-TXN-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const record = {
        transactionReference: reference,
        paymentReference: body.paymentReference ?? `ref-${Date.now()}`,
        amountPaid: 0,
        totalPayable: body.amount ?? 0,
        paymentStatus: 'PENDING',
        currency: body.currencyCode ?? 'NGN',
        customer: { name: body.customerName ?? null, email: body.customerEmail ?? null },
        checkoutUrl: `/checkout/${reference}`,
        enabledPaymentMethod: body.paymentMethods ?? ['CARD', 'ACCOUNT_TRANSFER'],
        createdOn: nowIso(),
      };
      store.create('transactions', reference, record);
      return envelope(record, 'Transaction initialized');
    });

    // --- Get a transaction by reference (get) ---
    app.get('/api/v2/transactions/:reference', async (req, reply) => {
      const reference = decodeURIComponent(String((req.params as Record<string, any>).reference));
      const found = store.get('transactions', reference);
      if (!found) {
        reply.code(404);
        return {
          requestSuccessful: false,
          responseMessage: 'Transaction not found',
          responseCode: '99',
        };
      }
      return envelope(found, 'success');
    });

    // --- Search disbursement transactions (list; paginated content) ---
    app.get('/api/v2/disbursements/search-transactions', async () =>
      envelope(page(store.list('disbursements')))
    );

    // --- Supported banks (get; responseBody is an array) ---
    app.get('/api/v1/banks', async () => envelope(store.list('banks')));
  },

  seed,
};

export default plugin;
