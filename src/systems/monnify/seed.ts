import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Monnify seed. Seeds a couple of collection transactions (looked up by
 * transactionReference), a couple of disbursement transactions (returned by the
 * paginated `list` helper) and the supported-banks list. init-transaction adds
 * to the `transactions` collection.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const transactions = [
    {
      transactionReference: 'MNFY-TXN-0000000001',
      paymentReference: 'order-1001',
      amountPaid: 500,
      totalPayable: 500,
      paymentStatus: 'PAID',
      paymentMethod: 'CARD',
      currency: 'NGN',
      customer: { name: 'Ada Lovelace', email: 'ada@example.com' },
      createdOn: nowIso(),
    },
    {
      transactionReference: 'MNFY-TXN-0000000002',
      paymentReference: 'order-1002',
      amountPaid: 0,
      totalPayable: 1200,
      paymentStatus: 'PENDING',
      paymentMethod: 'ACCOUNT_TRANSFER',
      currency: 'NGN',
      customer: { name: 'Grace Hopper', email: 'grace@example.com' },
      createdOn: nowIso(),
    },
  ];
  for (const t of transactions) store.create('transactions', t.transactionReference, t);

  const disbursements = [
    {
      reference: 'DISB-0000000001',
      amount: 2000,
      status: 'SUCCESS',
      narration: 'Payout',
      destinationAccountNumber: '4864192954',
      destinationBankCode: '057',
      dateCreated: nowIso(),
    },
    {
      reference: 'DISB-0000000002',
      amount: 3500,
      status: 'SUCCESS',
      narration: 'Vendor payment',
      destinationAccountNumber: '0123456789',
      destinationBankCode: '058',
      dateCreated: nowIso(),
    },
  ];
  for (const d of disbursements) store.create('disbursements', d.reference, d);

  const banks = [
    { code: '057', name: 'Zenith Bank' },
    { code: '058', name: 'GTBank' },
    { code: '011', name: 'First Bank of Nigeria' },
  ];
  for (const b of banks) store.create('banks', b.code, b);
}
