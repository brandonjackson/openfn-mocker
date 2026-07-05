import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the mtn-momo system. Paths match the MoMo Collection API the
 * generic `request` helper targets; the token example mints the Bearer token the
 * adaptor exchanges before its first call.
 */
export const guide: SystemGuide = {
  title: 'MTN Mobile Money (MoMo)',
  docs: 'https://docs.openfn.org/adaptors/packages/mtn-momo-docs',
  blurb:
    'MTN mobile-money Collection API. The adaptor Basic-auths POST /collection/token/ (with an Ocp-Apim-Subscription-Key header) for a Bearer token, then issues generic requests. "Request to pay" is async: the POST returns 202 with no body and you poll the referenced resource, passing a client-generated X-Reference-Id and X-Target-Environment on each call.',
  auth: 'Subscription key + Basic → Bearer',
  examples: [
    {
      id: 'token',
      method: 'POST',
      path: '/collection/token/',
      label: 'Mint a Collection access token',
    },
    {
      id: 'requesttopay',
      method: 'POST',
      path: '/collection/v1_0/requesttopay',
      label: 'Request a payment from a payer (202, async)',
      body: JSON.stringify(
        {
          amount: '100',
          currency: 'EUR',
          externalId: '947354',
          payer: { partyIdType: 'MSISDN', partyId: '46733123453' },
          payerMessage: 'Invoice 947354',
          payeeNote: 'Thanks',
        },
        null,
        2
      ),
    },
    {
      id: 'requesttopayStatus',
      method: 'GET',
      path: '/collection/v1_0/requesttopay/11111111-1111-1111-1111-111111111111',
      label: 'Poll a request-to-pay status',
    },
    {
      id: 'balance',
      method: 'GET',
      path: '/collection/v1_0/account/balance',
      label: 'Get the account balance',
    },
    {
      id: 'accountActive',
      method: 'GET',
      path: '/collection/v1_0/accountholder/msisdn/46733123453/active',
      label: 'Check whether an account holder is active',
    },
  ],
};
