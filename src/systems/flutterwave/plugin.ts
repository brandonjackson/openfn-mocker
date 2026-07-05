import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso, makeId } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Flutterwave payments. Unlike the other fintech systems here, the flutterwave
 * adaptor authenticates directly with `Authorization: Bearer <secretKey>` — there
 * is NO token-exchange step. It POSTs to three v4 resources and reads the `data`
 * field of each response envelope (`{ status, message, data }`):
 *  - createCustomer      → POST /customers
 *  - initiatePayment     → POST /charges
 *  - createPaymentMethod → POST /payment-methods
 * Read endpoints (GET /customers, GET /payment-methods) are added for lookups.
 */

/** Flutterwave success envelope; the adaptor unwraps `.data`. */
function ok(data: any, message: string): Record<string, any> {
  return { status: 'success', message, data };
}

const plugin: MockSystemPlugin = {
  name: 'flutterwave',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'secretKey', role: 'secret', secret: { charset: 'alnum', length: 32, prefix: 'sk_test_' } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Customers ---
    app.get('/customers', async () =>
      ok(store.list('customers'), 'Customers retrieved')
    );

    app.post('/customers', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = makeId('cus');
      const customer = {
        id,
        type: 'customer',
        name: body.name ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        meta: body.meta ?? {},
        created_datetime: nowIso(),
      };
      store.create('customers', id, customer);
      reply.code(201);
      return ok(customer, 'Customer created');
    });

    // --- Charges (initiatePayment) ---
    // Flutterwave returns 200 with the pending charge; settlement happens async.
    app.post('/charges', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = makeId('chg');
      const charge = {
        id,
        type: 'charge',
        status: 'pending',
        amount: body.amount ?? null,
        currency: body.currency ?? 'NGN',
        customer_id: body.customer_id ?? null,
        payment_method_id: body.payment_method_id ?? null,
        reference: body.reference ?? makeId('ref'),
        next_action: { type: 'redirect_url', redirect_url: { url: '/checkout/' + id } },
        created_datetime: nowIso(),
      };
      store.create('charges', id, charge);
      reply.code(200);
      return ok(charge, 'Charge initiated');
    });

    // --- Payment methods ---
    app.get('/payment-methods', async () =>
      ok(store.list('payment_methods'), 'Payment methods retrieved')
    );

    app.post('/payment-methods', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = makeId('pmt');
      const method = {
        id,
        type: body.type ?? 'card',
        customer_id: body.customer_id ?? null,
        ...body,
        created_datetime: nowIso(),
      };
      method.id = id; // keep our id even if the body carried one
      store.create('payment_methods', id, method);
      reply.code(201);
      return ok(method, 'Payment method created');
    });
  },

  seed,
};

export default plugin;
