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

export function seed(store: DataStore, _config: SystemConfig): void {
  const payment = {
    id: 45001,
    phonenumber: '+256777000111',
    amount: 5000,
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
    phonenumber: '+256777000111',
    created: nowIso(),
  };
  store.create('contacts', String(contact.id), contact);
}
