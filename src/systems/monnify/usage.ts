import type { UsageExample } from '../types.js';

/**
 * Usage examples for the monnify sandbox "Usage" tab: one entry per adaptor
 * function (get, list, post, request). All paths are relative to the Monnify
 * base URL.
 */
export const usage: UsageExample[] = [
  {
    fn: 'get',
    signature: 'get(path, options?)',
    description: 'Make a GET request to any Monnify resource.',
    code: "get('/api/v2/transactions/MNFY-TXN-0000000001');",
    apiRef: 'getTransaction',
  },
  {
    fn: 'list',
    signature: 'list(path, query?)',
    description: 'Fetch a paginated list of items (Monnify paging starts at page 0).',
    code: "list('/api/v2/disbursements/search-transactions', {\n  sourceAccountNumber: 4864192954,\n  pageNo: 0,\n  pageSize: 10\n});",
    apiRef: 'listDisbursements',
  },
  {
    fn: 'post',
    signature: 'post(path, body, options?)',
    description: 'Make a POST request, e.g. to initialize a transaction.',
    code: "post('/api/v1/merchant/transactions/init-transaction', {\n  amount: 500,\n  customerName: 'Ada Lovelace',\n  customerEmail: 'ada@example.com',\n  paymentReference: 'order-1001',\n  currencyCode: 'NGN',\n  contractCode: '0102345678'\n});",
    apiRef: 'initTransaction',
  },
  {
    fn: 'request',
    signature: 'request(method, path, options?)',
    description: 'Make a generic request with full control over method, path and query.',
    code: "request('GET', '/api/v2/disbursements/search-transactions', {\n  query: { sourceAccountNumber: 4864192954, pageNo: 0, pageSize: 10 }\n});",
    apiRef: 'listDisbursements',
  },
];
