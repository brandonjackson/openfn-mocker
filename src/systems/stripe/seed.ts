import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Stripe seed. Seeds a couple of customers and a charge so the list endpoints
 * return data on first boot; create routes add to the same collections. Ids use
 * Stripe's `cus_` / `ch_` prefix style.
 */

/** Short id with a Stripe-style prefix (prefix already includes the underscore). */
export function makeId(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const customers = [
    { id: 'cus_seed01', object: 'customer', name: 'Jane Doe', email: 'jane@example.com' },
    { id: 'cus_seed02', object: 'customer', name: 'John Smith', email: 'john@example.com' },
  ];
  for (const c of customers) store.create('customers', c.id, c);

  const charge = {
    id: 'ch_seed01',
    object: 'charge',
    status: 'succeeded',
    amount: 2000,
    currency: 'usd',
    customer: 'cus_seed01',
    paid: true,
    captured: true,
  };
  store.create('charges', charge.id, charge);
}
