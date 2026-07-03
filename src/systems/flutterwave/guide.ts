import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the flutterwave system. Paths match the v4 resources the
 * adaptor POSTs to; responses use Flutterwave's `{ status, message, data }`
 * envelope, which the adaptor unwraps to `data`.
 */
export const guide: SystemGuide = {
  title: 'Flutterwave',
  docs: 'https://docs.openfn.org/adaptors/packages/flutterwave-docs',
  blurb:
    'Pan-African payments. The adaptor authenticates with a Bearer secret key directly (no token exchange) and POSTs to /customers, /charges and /payment-methods. Responses use the { status, message, data } envelope and the adaptor keeps only data.',
  auth: 'API key (Bearer secret key)',
  examples: [
    { id: 'listCustomers', method: 'GET', path: '/customers', label: 'List customers' },
    {
      id: 'createCustomer',
      method: 'POST',
      path: '/customers',
      label: 'Create a customer',
      body: JSON.stringify(
        { name: { first: 'Ada', last: 'Lovelace' }, email: 'ada@example.com', phone: { country_code: '234', number: '8012345678' } },
        null,
        2
      ),
    },
    {
      id: 'initiatePayment',
      method: 'POST',
      path: '/charges',
      label: 'Initiate a payment (charge)',
      body: JSON.stringify(
        { amount: 1000, currency: 'NGN', customer_id: 'cus_00000000000001', payment_method_id: 'pmt_00000000000001', reference: 'order-1001' },
        null,
        2
      ),
    },
    {
      id: 'createPaymentMethod',
      method: 'POST',
      path: '/payment-methods',
      label: 'Create a payment method',
      body: JSON.stringify(
        { type: 'card', customer_id: 'cus_00000000000001', card: { nonce: 'nonce-abc', encrypted_card_number: '****', expiry_month: 9, expiry_year: 32 } },
        null,
        2
      ),
    },
  ],
};
