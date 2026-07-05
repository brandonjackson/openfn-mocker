import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * M-Pesa (Daraja) seed. Daraja itself is fire-and-forget (results arrive on your
 * CallBackURL, not in a queryable list), so there is little durable state to
 * model. We seed a couple of prior STK-push transactions so a workflow can look
 * one up by CheckoutRequestID, and the mock records new pushes into the same
 * `transactions` collection.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const transactions = [
    {
      CheckoutRequestID: 'ws_CO_01012024090000000001',
      MerchantRequestID: '29115-34620561-1',
      BusinessShortCode: '600000',
      Amount: 100,
      PhoneNumber: 254708374149,
      status: 'completed',
      ResultCode: '0',
      ResultDesc: 'The service request is processed successfully.',
      MpesaReceiptNumber: 'QGR7ABCD12',
      created_on: nowIso(),
    },
    {
      CheckoutRequestID: 'ws_CO_01012024093000000002',
      MerchantRequestID: '29115-34620561-2',
      BusinessShortCode: '600000',
      Amount: 250,
      PhoneNumber: 254708374150,
      status: 'completed',
      ResultCode: '0',
      ResultDesc: 'The service request is processed successfully.',
      MpesaReceiptNumber: 'QGR7EFGH34',
      created_on: nowIso(),
    },
  ];
  for (const t of transactions) store.create('transactions', t.CheckoutRequestID, t);
}
