import type { UsageExample } from '../types.js';

/**
 * Usage examples for the zata sandbox "Usage" tab. The adaptor exposes generic
 * verbs; get/post take a relative resource path (the adaptor prepends the base
 * URL) and request takes an explicit method + path.
 */
export const usage: UsageExample[] = [
  {
    fn: 'post',
    signature: 'post(path, data, options?, callback?)',
    description: 'Record a sale transaction with Zata.',
    code: "post('transaction/sale', { amount: 1500, currency: 'USD', buyerTin: '1000000001' });",
    apiRef: 'sale',
  },
  {
    fn: 'get',
    signature: 'get(path, options?, callback?)',
    description: 'Fetch a transaction by id.',
    code: "get('transaction/TXN-0001');",
    apiRef: 'getTxn',
  },
  {
    fn: 'request',
    signature: 'request(method, path, options?, callback?)',
    description: 'Make an arbitrary request against the Zata API.',
    code: "request('GET', 'transactions');",
    apiRef: 'listTxn',
  },
];
