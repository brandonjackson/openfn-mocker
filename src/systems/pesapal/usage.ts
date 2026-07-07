import type { UsageExample } from '../types.js';

/**
 * Usage examples for the pesapal sandbox "Usage" tab. The adaptor exposes
 * generic verbs; get/post take a path relative to the `<baseUrl>/<apiVersion>/api`
 * base the adaptor builds (so no `/api` prefix here) and pass params in an
 * options object. The token request reads the consumer key/secret straight off
 * the configuration.
 */
export const usage: UsageExample[] = [
  {
    fn: 'post',
    signature: 'post(path, data, options?, callback?)',
    description: 'Submit an order request to Pesapal.',
    code: "post('/Transactions/SubmitOrderRequest', { id: 'order-1001', amount: 1000, currency: 'KES', description: 'Test order' });",
    apiRef: 'submitOrder',
  },
  {
    fn: 'get',
    signature: 'get(path, options?, callback?)',
    description: 'Poll the status of a submitted transaction.',
    code: "get('/Transactions/GetTransactionStatus', { query: { orderTrackingId: 'b945e4af-80a5-4ec1-8706' } });",
    apiRef: 'status',
  },
  {
    fn: 'request',
    signature: 'request(method, path, options?, callback?)',
    description: 'Exchange the consumer key/secret for a Bearer access token.',
    code: "request('POST', '/Auth/RequestToken', { body: { consumer_key: $.configuration.consumer_key, consumer_secret: $.configuration.consumer_secret } });",
    apiRef: 'token',
  },
];
