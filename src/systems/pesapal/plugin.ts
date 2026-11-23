import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso, buildIpn } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Pesapal payments (API v3). The pesapal adaptor exposes generic get / post /
 * request verbs over the Pesapal API. It builds every request under
 * `<baseUrl>/<apiVersion>/api` (apiVersion pinned to `v3` here so its two
 * internal defaults — `v3` for the token call, `pesapalv3` for data calls —
 * agree). A Bearer token is minted first via POST /v3/api/Auth/RequestToken
 * (exempt from auth enforcement); orders are then submitted and their status
 * polled. Responses carry a string `status` ('200') and an `error` field that
 * is null on success.
 */

const plugin: MockSystemPlugin = {
  name: 'pesapal',
  auth: { required: true, schemes: ['bearer'], exemptPaths: ['/v3/api/Auth/RequestToken'] },
  credential: {
    type: 'oauth',
    authHeader: { scheme: 'bearer', value: 'mock-access-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiVersion', role: 'static', value: 'v3' },
      { name: 'consumer_key', role: 'static', value: 'mock-consumer-key' },
      { name: 'consumer_secret', role: 'secret', secret: { charset: 'hex', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Token exchange (exempt from auth) ---
    app.post('/v3/api/Auth/RequestToken', async () => ({
      token: 'mock-access-token',
      expiryDate: nowIso(),
      error: null,
      status: '200',
      message: 'Request processed successfully',
    }));

    // --- Submit an order ---
    app.post('/v3/api/Transactions/SubmitOrderRequest', async (req) => {
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
    app.get('/v3/api/Transactions/GetTransactionStatus', async (req) => {
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
    app.post('/v3/api/URLSetup/RegisterIPN', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const ipn = buildIpn(randomUUID(), body.url ?? null, body.ipn_notification_type);
      store.create('ipns', ipn.ipn_id, ipn);
      return { ipn_id: ipn.ipn_id, url: ipn.url, created_date: ipn.created_date, error: null, status: '200' };
    });

    // --- List registered IPN URLs (a bare array, one entry per IPN) ---
    app.get('/v3/api/URLSetup/GetIpnList', async () => store.list('ipns'));

    // --- Cancel a pending order ---
    // Pesapal reports business errors in the body (status '500', an error
    // object) on an HTTP 200, as it does for every v3 call.
    app.post('/v3/api/Transactions/CancelOrder', async (req) => {
      const id = String(((req.body ?? {}) as Record<string, any>).order_tracking_id ?? '');
      const order = store.get('orders', id);
      if (!order || order.status_code === 1) {
        return {
          status: '500',
          message: order ? 'Order cannot be cancelled: it is already paid' : 'Order not found',
          error: { error_type: 'api_error', code: 'invalid_order', message: 'Order cannot be cancelled' },
        };
      }
      store.update('orders', id, { payment_status_description: 'Invalid', status_code: 0 });
      return { status: '200', message: 'Order successfully cancelled', error: null };
    });

    // --- Refund a completed payment ---
    app.post('/v3/api/Transactions/RefundRequest', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      store.create('refunds', randomUUID(), {
        confirmation_code: body.confirmation_code ?? null,
        amount: body.amount ?? null,
        username: body.username ?? null,
        remarks: body.remarks ?? null,
        created_date: nowIso(),
      });
      return { status: '200', message: 'Refund request successfully', error: null };
    });
  },

  seed,
};

export default plugin;
