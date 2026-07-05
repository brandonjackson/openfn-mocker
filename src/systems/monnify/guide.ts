import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the monnify system. Paths and the { requestSuccessful,
 * responseBody } envelope match the live Monnify API; the login example mints
 * the Bearer token the adaptor uses for every other call.
 */
export const guide: SystemGuide = {
  title: 'Monnify',
  docs: 'https://docs.openfn.org/adaptors/packages/monnify-docs',
  blurb:
    'Nigerian payments & disbursements. The adaptor Basic-auths POST /api/v1/auth/login for a Bearer token, then uses generic get/list/post helpers. Every response is wrapped in { requestSuccessful, responseMessage, responseCode, responseBody }; list expects a paginated responseBody.content and Monnify returns HTTP 200 even for creates.',
  auth: 'API key + secret → Bearer',
  examples: [
    {
      id: 'login',
      method: 'POST',
      path: '/api/v1/auth/login',
      label: 'Exchange apiKey:secretKey (Basic) for a Bearer token',
    },
    {
      id: 'initTransaction',
      method: 'POST',
      path: '/api/v1/merchant/transactions/init-transaction',
      label: 'Initialize a transaction',
      body: JSON.stringify(
        {
          amount: 500,
          customerName: 'Ada Lovelace',
          customerEmail: 'ada@example.com',
          paymentReference: 'order-1001',
          currencyCode: 'NGN',
          contractCode: '0102345678',
        },
        null,
        2
      ),
    },
    {
      id: 'getTransaction',
      method: 'GET',
      path: '/api/v2/transactions/MNFY-TXN-0000000001',
      label: 'Get a transaction by reference',
    },
    {
      id: 'listDisbursements',
      method: 'GET',
      path: '/api/v2/disbursements/search-transactions',
      label: 'Search disbursement transactions (paginated)',
    },
    { id: 'banks', method: 'GET', path: '/api/v1/banks', label: 'List supported banks' },
  ],
};
