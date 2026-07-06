import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Pesapal seed. One already-submitted order (fixed order_tracking_id) so the
 * transaction-status lookup returns data on first boot. The guide's status
 * example targets this tracking id.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/** Fixed seed order tracking id, referenced by the guide's status example. */
export const SEED_TRACKING_ID = 'b945e4af-80a5-4ec1-8706';

export function seed(store: DataStore, _config: SystemConfig): void {
  const orders = [
    {
      order_tracking_id: SEED_TRACKING_ID,
      merchant_reference: 'order-1001',
      amount: 1000,
      currency: 'KES',
      description: 'Seed order',
      payment_status_description: 'Completed',
      status_code: 1,
      created_date: nowIso(),
    },
  ];
  for (const o of orders) store.create('orders', o.order_tracking_id, o);
}
