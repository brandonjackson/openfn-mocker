import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * MTN MoMo seed. Seeds a couple of prior "request to pay" collection requests
 * (keyed by their X-Reference-Id) so a status GET works on first boot, plus an
 * account balance. New requesttopay calls add to the same `requesttopay`
 * collection under the client-supplied X-Reference-Id.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const requests = [
    {
      referenceId: '11111111-1111-1111-1111-111111111111',
      amount: '100',
      currency: 'EUR',
      externalId: '947354',
      payer: { partyIdType: 'MSISDN', partyId: '46733123453' },
      payerMessage: 'Invoice 947354',
      payeeNote: 'Thanks',
      status: 'SUCCESSFUL',
      financialTransactionId: '1308275464',
      createdOn: nowIso(),
    },
    {
      referenceId: '22222222-2222-2222-2222-222222222222',
      amount: '250',
      currency: 'EUR',
      externalId: '947355',
      payer: { partyIdType: 'MSISDN', partyId: '46733123454' },
      payerMessage: 'Invoice 947355',
      payeeNote: 'Thanks',
      status: 'PENDING',
      createdOn: nowIso(),
    },
  ];
  for (const r of requests) store.create('requesttopay', r.referenceId, r);

  store.create('account', 'balance', { availableBalance: '1000.00', currency: 'EUR' });
}
