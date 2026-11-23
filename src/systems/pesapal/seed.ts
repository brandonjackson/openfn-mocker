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

/** Fixed pending order id, referenced by the guide's cancel example. */
export const PENDING_TRACKING_ID = '6f1c9d2e-3a4b-4c5d-8e7f-90a1b2c3d4e5';

/** A registered IPN URL as GetIpnList returns it. notificationType: 'GET' | 'POST'. */
export function buildIpn(ipnId: string, url: string | null, notificationType?: string) {
  const post = String(notificationType ?? 'GET').toUpperCase() === 'POST';
  return {
    url,
    created_date: nowIso(),
    ipn_id: ipnId,
    notification_type: post ? 1 : 0,
    ipn_notification_type_description: post ? 'POST' : 'GET',
    ipn_status: 1,
    ipn_status_description: 'Active',
    error: null,
    status: '200',
  };
}

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

  // One IPN URL already registered, so GetIpnList returns data on first boot.
  const ipn = buildIpn('e3a7c2f0-5b1d-4c8e-9f2a-7d6b1c0e4a11', 'https://example.org/pesapal/ipn', 'GET');
  store.create('ipns', ipn.ipn_id, ipn);
  // A pending order, so the cancel example has something to cancel.
  store.create('orders', PENDING_TRACKING_ID, {
    order_tracking_id: PENDING_TRACKING_ID,
    merchant_reference: 'order-1002',
    amount: 250,
    currency: 'KES',
    description: 'Pending seed order',
    payment_status_description: 'Pending',
    status_code: 0,
    created_date: nowIso(),
  });
}
