import type { UsageExample } from '../types.js';

/**
 * Usage examples for the mpesa sandbox "Usage" tab. Callback/result URLs are
 * written as relative same-origin paths (the mock ignores them anyway) so no
 * external absolute URL appears in job code.
 */
export const usage: UsageExample[] = [
  {
    fn: 'stkPush',
    signature: 'stkPush(data, options?)',
    description: 'Initiate an STK (Lipa na M-Pesa Online) pin prompt to a Safaricom number.',
    code: "stkPush({\n  Amount: 1,\n  PartyA: 254708374149,\n  PartyB: 600000,\n  PhoneNumber: 254708374149,\n  CallBackURL: '/callbacks/mpesa/stk',\n  AccountReference: 'CompanyXLTD',\n  TransactionDesc: 'Payment of X'\n});",
    apiRef: 'stkPush',
  },
  {
    fn: 'checkTransactionStatus',
    signature: 'checkTransactionStatus(data, options?)',
    description: 'Query the status of an M-Pesa transaction (result is delivered to your ResultURL).',
    code: "checkTransactionStatus({\n  Initiator: 'testapi',\n  SecurityCredential: 'encrypted-credential',\n  TransactionID: 'QGR7ABCD12',\n  PartyA: 600000,\n  IdentifierType: 4,\n  ResultURL: '/callbacks/mpesa/status/result',\n  QueueTimeOutURL: '/callbacks/mpesa/status/timeout',\n  Remarks: 'status check'\n});",
    apiRef: 'checkStatus',
  },
  {
    fn: 'registerUrl',
    signature: 'registerUrl(data, options)',
    description: 'Register the C2B confirmation and validation URLs for your paybill/till.',
    code: "registerUrl({\n  ShortCode: 600426,\n  ResponseType: 'Completed',\n  ConfirmationURL: '/callbacks/mpesa/c2b/confirmation',\n  ValidationURL: '/callbacks/mpesa/c2b/validation'\n});",
    apiRef: 'registerUrl',
  },
  {
    fn: 'remitTax',
    signature: 'remitTax(data, options?)',
    description: 'Remit tax to the Kenya Revenue Authority (KRA) from your shortcode.',
    code: "remitTax({\n  Initiator: 'testapi',\n  SecurityCredential: 'encrypted-credential',\n  Amount: 100,\n  PartyA: 600000,\n  AccountReference: '353353',\n  Remarks: 'tax',\n  QueueTimeOutURL: '/callbacks/mpesa/b2b/timeout',\n  ResultURL: '/callbacks/mpesa/b2b/result'\n});",
    apiRef: 'remitTax',
  },
  {
    fn: 'buyGoods',
    signature: 'buyGoods(data, options?)',
    description: 'Pay for goods/services from your business account to a till or merchant store.',
    code: "buyGoods({\n  Initiator: 'testapi',\n  SecurityCredential: 'encrypted-credential',\n  Amount: 100,\n  PartyA: 600000,\n  PartyB: 600000,\n  AccountReference: '353353',\n  Remarks: 'buy goods',\n  QueueTimeOutURL: '/callbacks/mpesa/b2b/timeout',\n  ResultURL: '/callbacks/mpesa/b2b/result'\n});",
    apiRef: 'buyGoods',
  },
  {
    fn: 'request',
    signature: 'request(method, path, body, options?)',
    description: 'Make a general authenticated request to any Daraja endpoint.',
    code: "request('POST', '/mpesa/stkpush/v1/processrequest', {\n  Amount: 1,\n  PartyA: 254708374149,\n  PhoneNumber: 254708374149,\n  CallBackURL: '/callbacks/mpesa/stk'\n});",
    apiRef: 'stkPush',
  },
];
