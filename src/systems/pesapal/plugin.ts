import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Pesapal payments (API v3). The pesapal adaptor exposes generic get / post /
 * request verbs over the Pesapal API (under /api). A Bearer token is minted
 * first via POST /api/Auth/RequestToken (exempt from auth enforcement); orders
 * are then submitted and their status polled. Responses carry a string `status`
 * ('200') and an `error` field that is null on success.
 */

const plugin: MockSystemPlugin = {
  name: 'pesapal',
  auth: { required: true, schemes: ['bearer'], exemptPaths: ['/api/Auth/RequestToken'] },
  credential: {
    type: 'oauth',
    authHeader: { scheme: 'bearer', value: 'mock-access-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'consumer_key', role: 'static', value: 'mock-consumer-key' },
      { name: 'consumer_secret', role: 'secret', secret: { charset: 'hex', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Token exchange (exempt from auth) ---
    app.post('/api/Auth/RequestToken', async () => ({
      token: 'mock-access-token',
      expiryDate: nowIso(),
      error: null,
      status: '200',
      message: 'Request processed successfully',
    }));

    // --- Submit an order ---
    app.post('/api/Transactions/SubmitOrderRequest', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const orderTrackingId = randomUUID();
      const merchantReference = body.id ?? 'ref';
      const order = {
        order_tracking_id: orderTrackingId,
        merchant_reference: merchantReference,
        amount: body.amount ?? null,
        currency: body.currency ?? null,
        description: body.description ?? null,
        payment_status_description: 'Pending',
        status_code: 0,
        created_date: nowIso(),
      };
      store.create('orders', orderTrackingId, order);
      return {
        order_tracking_id: orderTrackingId,
        merchant_reference: merchantReference,
        redirect_url: '/checkout/' + orderTrackingId,
        error: null,
        status: '200',
      };
    });

    // --- Transaction status ---
    app.get('/api/Transactions/GetTransactionStatus', async (req) => {
      const query = (req.query ?? {}) as Record<string, any>;
      const orderTrackingId = String(query.orderTrackingId ?? '');
      const order = store.get('orders', orderTrackingId);
      return {
        payment_status_description: order?.payment_status_description ?? 'Completed',
        order_tracking_id: orderTrackingId,
        merchant_reference: order?.merchant_reference ?? null,
        amount: order?.amount ?? 0,
        currency: order?.currency ?? null,
        status_code: 1,
        error: null,
        status: '200',
      };
    });

    // --- Register an IPN URL ---
    app.post('/api/URLSetup/RegisterIPN', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      return {
        ipn_id: randomUUID(),
        url: body.url ?? null,
        error: null,
        status: '200',
      };
    });
  },

  seed,
};

export default plugin;
