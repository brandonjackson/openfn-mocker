import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the zata system. Paths match the Zata REST resources the
 * generic verbs target; a recorded sale echoes back with a generated id and an
 * `accepted` status. The getTxn example targets the fixed seed transaction id.
 */
export const guide: SystemGuide = {
  title: 'Zata',
  docs: 'https://docs.openfn.org/adaptors/packages/zata-docs',
  blurb:
    'Zata tax compliance. The adaptor exposes generic get / post / put / request verbs over the Zata REST API, authenticated with a Bearer API token. A sale POSTed to /transaction/sale is accepted and echoed back with a generated id.',
  auth: 'API key (Bearer token)',
  examples: [
    {
      id: 'sale',
      method: 'POST',
      path: '/v1/transaction/sale',
      label: 'Record a sale transaction',
      body: JSON.stringify({ amount: 1500, currency: 'USD', buyerTin: '1000000001' }, null, 2),
    },
    {
      id: 'getTxn',
      method: 'GET',
      path: '/v1/transaction/TXN-0001',
      label: 'Fetch a transaction by id',
    },
    { id: 'listTxn', method: 'GET', path: '/v1/transactions', label: 'List transactions' },
  ],
};
