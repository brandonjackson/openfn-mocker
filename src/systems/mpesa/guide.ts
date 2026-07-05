import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the mpesa system. Every example targets a real Daraja path so
 * the OpenFn mpesa adaptor reaches it unchanged; the OAuth token step and the
 * async ack envelopes match the live API.
 */
export const guide: SystemGuide = {
  title: 'Safaricom M-Pesa (Daraja)',
  docs: 'https://docs.openfn.org/adaptors/packages/mpesa-docs',
  blurb:
    'Mobile-money payments over Safaricom\'s Daraja API. OAuth client-credentials: the adaptor Basic-auths GET /oauth/v1/generate for a Bearer token, then POSTs under /mpesa/*. Daraja is async — calls return a "ResponseCode: 0" acknowledgement and the real result is delivered to your CallBackURL/ResultURL later.',
  auth: 'OAuth (client credentials) → Bearer',
  examples: [
    {
      id: 'token',
      method: 'GET',
      path: '/oauth/v1/generate?grant_type=client_credentials',
      label: 'Mint an OAuth access token (Basic auth)',
    },
    {
      id: 'stkPush',
      method: 'POST',
      path: '/mpesa/stkpush/v1/processrequest',
      label: 'Initiate an STK (Lipa na M-Pesa) prompt',
      body: JSON.stringify(
        {
          Amount: 1,
          PartyA: 254708374149,
          PartyB: 600000,
          PhoneNumber: 254708374149,
          CallBackURL: '/callbacks/mpesa/stk',
          AccountReference: 'CompanyXLTD',
          TransactionDesc: 'Payment of X',
        },
        null,
        2
      ),
    },
    {
      id: 'checkStatus',
      method: 'POST',
      path: '/mpesa/transactionstatus/v1/query',
      label: 'Query a transaction status (async ack)',
      body: JSON.stringify(
        {
          Initiator: 'testapi',
          SecurityCredential: 'encrypted-credential',
          TransactionID: 'QGR7ABCD12',
          PartyA: 600000,
          IdentifierType: 4,
          ResultURL: '/callbacks/mpesa/status/result',
          QueueTimeOutURL: '/callbacks/mpesa/status/timeout',
          Remarks: 'status check',
          Occassion: 'null',
        },
        null,
        2
      ),
    },
    {
      id: 'registerUrl',
      method: 'POST',
      path: '/mpesa/c2b/v1/registerurl',
      label: 'Register C2B confirmation/validation URLs',
      body: JSON.stringify(
        {
          ShortCode: 600426,
          ResponseType: 'Completed',
          ConfirmationURL: '/callbacks/mpesa/c2b/confirmation',
          ValidationURL: '/callbacks/mpesa/c2b/validation',
        },
        null,
        2
      ),
    },
    {
      id: 'remitTax',
      method: 'POST',
      path: '/mpesa/b2b/v1/remittax',
      label: 'Remit tax to KRA (async ack)',
      body: JSON.stringify(
        {
          Initiator: 'testapi',
          SecurityCredential: 'encrypted-credential',
          Amount: 100,
          PartyA: 600000,
          AccountReference: '353353',
          Remarks: 'tax',
          QueueTimeOutURL: '/callbacks/mpesa/b2b/timeout',
          ResultURL: '/callbacks/mpesa/b2b/result',
        },
        null,
        2
      ),
    },
    {
      id: 'buyGoods',
      method: 'POST',
      path: '/mpesa/b2b/v1/paymentrequest',
      label: 'Business buy goods (async ack)',
      body: JSON.stringify(
        {
          Initiator: 'testapi',
          SecurityCredential: 'encrypted-credential',
          Amount: 100,
          PartyA: 600000,
          PartyB: 600000,
          AccountReference: '353353',
          Remarks: 'buy goods',
          QueueTimeOutURL: '/callbacks/mpesa/b2b/timeout',
          ResultURL: '/callbacks/mpesa/b2b/result',
        },
        null,
        2
      ),
    },
  ],
};
