import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Flutterwave seed. Seeds a couple of customers and payment methods so reads
 * work on first boot; createCustomer / createPaymentMethod add to the same
 * collections. Ids use Flutterwave's v4 `cus_` / `pmt_` prefix style.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const customers = [
    {
      id: 'cus_00000000000001',
      type: 'customer',
      name: { first: 'Ada', middle: null, last: 'Lovelace' },
      email: 'ada@example.com',
      phone: { country_code: '234', number: '8012345678' },
      created_datetime: nowIso(),
    },
    {
      id: 'cus_00000000000002',
      type: 'customer',
      name: { first: 'Grace', middle: null, last: 'Hopper' },
      email: 'grace@example.com',
      phone: { country_code: '234', number: '8087654321' },
      created_datetime: nowIso(),
    },
  ];
  for (const c of customers) store.create('customers', c.id, c);

  const paymentMethods = [
    {
      id: 'pmt_00000000000001',
      type: 'card',
      customer_id: 'cus_00000000000001',
      card: { first_six: '553188', last_four: '2950', expiry: '09/32', type: 'MASTERCARD' },
      created_datetime: nowIso(),
    },
  ];
  for (const p of paymentMethods) store.create('payment_methods', p.id, p);
}

/** Short id with a Flutterwave-style prefix. */
export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
}
