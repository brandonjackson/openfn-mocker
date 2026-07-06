import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Zata seed. One already-recorded sale transaction (fixed id TXN-0001) so the
 * by-id lookup and the transactions listing return data on first boot. The
 * guide's getTxn example targets this id.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/** Fixed seed transaction id, referenced by the guide's getTxn example. */
export const SEED_TXN_ID = 'TXN-0001';

export function seed(store: DataStore, _config: SystemConfig): void {
  const transactions = [
    {
      id: SEED_TXN_ID,
      status: 'accepted',
      amount: 1500,
      currency: 'USD',
      buyerTin: '1000000001',
      timestamp: nowIso(),
    },
  ];
  for (const t of transactions) store.create('transactions', t.id, t);
}
