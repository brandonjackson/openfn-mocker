import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the pesapal system (API v3). Paths match the Pesapal REST
 * API (under /api): a Bearer token is minted first via RequestToken, then orders
 * are submitted and polled. The status example targets the seeded order's
 * tracking id. The order example carries every field Pesapal's SubmitOrderRequest
 * requires (id, currency, amount, description, callback_url, notification_id,
 * billing_address); notification_id stands for the ipn_id RegisterIPN returns.
 */
export const guide: SystemGuide = {
  title: 'Pesapal (v3)',
  docs: 'https://docs.openfn.org/adaptors/packages/pesapal-docs',
  blurb:
    'Pesapal payments (API v3). The adaptor exposes generic get / post / request verbs over the Pesapal API. A Bearer token is minted first via POST /api/Auth/RequestToken, then orders are submitted and their status polled. Responses carry a string status of "200" and a null error on success.',
  auth: 'OAuth (Bearer access token)',
  examples: [
    {
      id: 'token',
      method: 'POST',
      path: '/v3/api/Auth/RequestToken',
      label: 'Request an access token',
      body: JSON.stringify(
        { consumer_key: 'mock-consumer-key', consumer_secret: 'mock-consumer-secret' },
        null,
        2
      ),
    },
    {
      id: 'submitOrder',
      method: 'POST',
      path: '/v3/api/Transactions/SubmitOrderRequest',
      label: 'Submit an order request',
      body: JSON.stringify(
        {
          id: 'order-1001',
          currency: 'KES',
          amount: 1000,
          description: 'Test order',
          callback_url: 'https://example.com/payment-complete',
          notification_id: '5b3f0c1e-7d2a-4f6b-9c81-2e4a6d8f0b13',
          billing_address: { email_address: 'customer@example.com', country_code: 'KE' },
        },
        null,
        2
      ),
    },
    {
      id: 'status',
      method: 'GET',
      path: '/v3/api/Transactions/GetTransactionStatus?orderTrackingId=b945e4af-80a5-4ec1-8706',
      label: 'Get transaction status',
    },
    {
      id: 'registerIpn',
      method: 'POST',
      path: '/v3/api/URLSetup/RegisterIPN',
      label: 'Register an IPN URL',
      body: JSON.stringify(
        { url: 'https://example.com/ipn', ipn_notification_type: 'GET' },
        null,
        2
      ),
    },
  ],
};
