import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the pesapal system (API v3). Paths match the Pesapal REST
 * API (under /api): a Bearer token is minted first via RequestToken, then orders
 * are submitted and polled. The status example targets the seeded order's
 * tracking id.
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
          amount: 1000,
          currency: 'KES',
          description: 'Test order',
          callback_url: 'https://example.com/pesapal/callback',
          notification_id: 'e3a7c2f0-5b1d-4c8e-9f2a-7d6b1c0e4a11',
          billing_address: { email_address: 'jane.doe@example.org', phone_number: '0700000000' },
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
    { id: 'ipnList', method: 'GET', path: '/v3/api/URLSetup/GetIpnList', label: 'List registered IPN URLs' },
    {
      id: 'cancelOrder',
      method: 'POST',
      path: '/v3/api/Transactions/CancelOrder',
      label: 'Cancel a pending order',
      body: JSON.stringify({ order_tracking_id: '6f1c9d2e-3a4b-4c5d-8e7f-90a1b2c3d4e5' }, null, 2),
    },
    {
      id: 'refund',
      method: 'POST',
      path: '/v3/api/Transactions/RefundRequest',
      label: 'Request a refund for a completed payment',
      body: JSON.stringify(
        { confirmation_code: 'AA11BB22CC', amount: 1000, username: 'finance.officer', remarks: 'Duplicate payment' },
        null,
        2
      ),
    },
  ],
};
