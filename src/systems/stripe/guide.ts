import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the stripe system. Paths match the core `/v1` REST
 * resources; listings use Stripe's `{ object: 'list', ... }` envelope and single
 * objects carry an `id` + `object` field. Create requests are form-encoded in
 * real Stripe, but a JSON body works against the mock too.
 */
export const guide: SystemGuide = {
  title: 'Stripe',
  docs: 'https://docs.openfn.org/adaptors/packages/stripe-docs',
  blurb:
    'Online payments. The adaptor authenticates with a Bearer secret key and reads the core /v1 REST API with generic list/get verbs. Listings return the { object: "list", data: [...] } envelope; objects carry cus_/ch_ ids and an object field.',
  auth: 'API key (Bearer secret key)',
  examples: [
    { id: 'listCustomers', method: 'GET', path: '/v1/customers', label: 'List customers' },
    {
      id: 'createCustomer',
      method: 'POST',
      path: '/v1/customers',
      label: 'Create a customer',
      body: JSON.stringify({ name: 'Jane Doe', email: 'jane@example.com' }, null, 2),
    },
    {
      id: 'getCustomer',
      method: 'GET',
      path: '/v1/customers/cus_seed01',
      label: 'Retrieve a customer',
    },
    { id: 'listCharges', method: 'GET', path: '/v1/charges', label: 'List charges' },
  ],
};
