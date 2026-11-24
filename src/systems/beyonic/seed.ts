import { randomInt } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Beyonic seed. Seeds one payment and one contact so the DRF-style list
 * endpoints (`{ results: [...] }`) return data on first boot; createPayment /
 * createContact / createCollectionRequest add to the same collections. Beyonic
 * ids are integers.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/** A Beyonic-style integer resource id. */
export function genId(): number {
  return randomInt(10000, 99999);
}

/**
 * Beyonic serialises decimal amounts as strings with four decimal places
 * (the docs' Payment and Collection Request objects show "1200.0000" /
 * "3000.0000"), whatever form the request sent ("String, Integer or Decimal").
 */
export function decimalString(amount: unknown): unknown {
  const n = typeof amount === 'number' ? amount : typeof amount === 'string' && amount.trim() !== '' ? Number(amount) : NaN;
  return Number.isFinite(n) ? n.toFixed(4) : amount;
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const payment = {
    id: 45001,
    phonenumber: '+256777000111',
    amount: '5000.0000',
    currency: 'UGX',
    description: 'Salary',
    state: 'scheduled',
    created: nowIso(),
  };
  store.create('payments', String(payment.id), payment);

  const contact = {
    id: 33001,
    first_name: 'Ada',
    last_name: 'Lovelace',
    phone_number: '+256777000111',
    created: nowIso(),
  };
  store.create('contacts', String(contact.id), contact);
}
