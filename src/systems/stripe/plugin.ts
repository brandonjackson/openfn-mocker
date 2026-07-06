import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, makeId } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Stripe payments. The adaptor authenticates with a Bearer secret key and hits
 * the core REST API under `/v1`. Requests use form-encoded bodies, which the
 * mock server parses into an object (via @fastify/formbody) so handlers read
 * `req.body` as a plain object. Listings use Stripe's list envelope
 * (`{ object: 'list', url, has_more, data }`); single objects carry an `id`
 * (`cus_`, `ch_`) and an `object` field.
 */

/** Stripe list envelope wrapping a resource collection. */
function listEnvelope(resource: string, data: any[]): Record<string, any> {
  return { object: 'list', url: `/v1/${resource}`, has_more: false, data };
}

/** Stripe-style resource-not-found error body. */
function notFound(resource: string): Record<string, any> {
  return { error: { message: `No such ${resource}`, type: 'invalid_request_error' } };
}

const plugin: MockSystemPlugin = {
  name: 'stripe',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'sk_test_mock' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiKey', role: 'secret', secret: { charset: 'alnum', length: 24, prefix: 'sk_test_' } },
      { name: 'apiVersion', role: 'static', value: 'v1' },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Customers ---
    app.get('/v1/customers', async () => listEnvelope('customers', store.list('customers')));

    app.post('/v1/customers', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = makeId('cus_');
      const customer = { ...body, id, object: 'customer' };
      store.create('customers', id, customer);
      reply.code(200);
      return customer;
    });

    app.get('/v1/customers/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('customers', id);
      if (!found) {
        reply.code(404);
        return notFound('customer');
      }
      return found;
    });

    // --- Charges ---
    app.get('/v1/charges', async () => listEnvelope('charges', store.list('charges')));

    app.post('/v1/charges', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = makeId('ch_');
      const charge = {
        ...body,
        id,
        object: 'charge',
        status: 'succeeded',
        amount: body.amount ?? null,
        currency: body.currency ?? 'usd',
        paid: true,
        captured: true,
      };
      store.create('charges', id, charge);
      reply.code(200);
      return charge;
    });

    app.get('/v1/charges/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('charges', id);
      if (!found) {
        reply.code(404);
        return notFound('charge');
      }
      return found;
    });
  },

  seed,
};

export default plugin;
