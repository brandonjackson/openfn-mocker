import type { UsageExample } from '../types.js';

/**
 * Usage examples for the mtn-momo sandbox "Usage" tab. The adaptor exposes a
 * single generic `request(method, path, body, options)`; MoMo requires a
 * client-generated X-Reference-Id and an X-Target-Environment header. Paths are
 * relative to the MoMo base URL (no external absolute URLs in job code).
 */
export const usage: UsageExample[] = [
  {
    fn: 'request',
    signature: 'request(method, path, body, options?)',
    description: 'Make an authenticated request to any MTN MoMo endpoint (e.g. request to pay).',
    code: "request('POST', '/collection/v1_0/requesttopay', {\n  amount: '100',\n  currency: 'EUR',\n  externalId: '947354',\n  payer: { partyIdType: 'MSISDN', partyId: '46733123453' },\n  payerMessage: 'Invoice 947354',\n  payeeNote: 'Thanks'\n}, {\n  headers: {\n    'X-Reference-Id': '11111111-1111-1111-1111-111111111111',\n    'X-Target-Environment': 'sandbox'\n  }\n});",
    apiRef: 'requesttopay',
  },
];
