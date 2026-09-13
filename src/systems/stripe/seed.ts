import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Stripe seed. Seeds a couple of customers and a charge so the list endpoints
 * return data on first boot; create routes add to the same collections. Ids use
 * Stripe's `cus_` / `ch_` prefix style.
 *
 * Record shapes follow Stripe's own OpenAPI (openfn-api-specs `stripe`,
 * `found-openapi`): every field the spec marks `required` on `customer` and
 * `charge` is present, and the optional fields Stripe always returns are set to
 * the values a fresh test-mode account produces (`livemode: false`, empty
 * `metadata`, nulls for unset relations). `pnpm test:conformance -- --system
 * stripe` checks this against the spec; keep it green when changing shapes.
 */

/** Short id with a Stripe-style prefix (prefix already includes the underscore). */
export function makeId(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

/** Fixed creation timestamp (seconds since the epoch) so seed data is deterministic. */
const SEED_CREATED = 1_700_000_000;

/** Current time in Stripe's `created` unit (seconds since the Unix epoch). */
export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * A spec-complete Stripe `customer`. `fields` overrides any default (the
 * caller supplies at least `id`; `created` defaults to the seed epoch).
 */
export function customerRecord(fields: Record<string, any>): Record<string, any> {
  const defaults: Record<string, any> = {
    id: fields.id,
    address: null,
    balance: 0,
    created: SEED_CREATED,
    currency: 'usd',
    default_source: null,
    delinquent: false,
    description: null,
    discount: null,
    email: null,
    invoice_prefix: String(fields.id ?? '').replace(/^cus_/, '').slice(0, 8).toUpperCase() || 'MOCK',
    invoice_settings: {
      custom_fields: null,
      default_payment_method: null,
      footer: null,
      rendering_options: null,
    },
    livemode: false,
    metadata: {},
    name: null,
    next_invoice_sequence: 1,
    phone: null,
    preferred_locales: [],
    shipping: null,
    tax_exempt: 'none',
    test_clock: null,
  };
  return { ...defaults, ...fields, object: 'customer' };
}

/**
 * A spec-complete Stripe `charge`. `amount` is coerced to an integer (Stripe
 * requests are form-encoded, so it may arrive as a string); a succeeded charge
 * is fully captured and not refunded.
 */
export function chargeRecord(fields: Record<string, any>): Record<string, any> {
  const amount = Number.isFinite(Number(fields.amount)) ? Math.trunc(Number(fields.amount)) : 0;
  const status = fields.status ?? 'succeeded';
  const captured = fields.captured ?? status === 'succeeded';
  const defaults: Record<string, any> = {
    id: fields.id,
    amount_captured: captured ? amount : 0,
    amount_refunded: 0,
    application: null,
    application_fee: null,
    application_fee_amount: null,
    balance_transaction: null,
    billing_details: {
      address: { city: null, country: null, line1: null, line2: null, postal_code: null, state: null },
      email: null,
      name: null,
      phone: null,
      tax_id: null,
    },
    calculated_statement_descriptor: null,
    captured,
    created: SEED_CREATED,
    currency: 'usd',
    customer: null,
    description: null,
    disputed: false,
    failure_code: null,
    failure_message: null,
    fraud_details: {},
    livemode: false,
    metadata: {},
    on_behalf_of: null,
    outcome: null,
    paid: status === 'succeeded',
    payment_intent: null,
    payment_method: null,
    payment_method_details: null,
    receipt_email: null,
    receipt_number: null,
    receipt_url: null,
    refunded: false,
    refunds: null,
    review: null,
    shipping: null,
    source_transfer: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status,
    transfer_data: null,
    transfer_group: null,
  };
  return { ...defaults, ...fields, amount, object: 'charge' };
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const customers = [
    customerRecord({ id: 'cus_seed01', name: 'Jane Doe', email: 'jane@example.com' }),
    customerRecord({ id: 'cus_seed02', name: 'John Smith', email: 'john@example.com', created: SEED_CREATED + 86_400 }),
  ];
  for (const c of customers) store.create('customers', c.id, c);

  const charge = chargeRecord({
    id: 'ch_seed01',
    amount: 2000,
    currency: 'usd',
    customer: 'cus_seed01',
    description: 'Clinic consultation fee',
    billing_details: {
      address: { city: null, country: null, line1: null, line2: null, postal_code: null, state: null },
      email: 'jane@example.com',
      name: 'Jane Doe',
      phone: null,
      tax_id: null,
    },
    receipt_email: 'jane@example.com',
    created: SEED_CREATED + 3_600,
  });
  store.create('charges', charge.id, charge);
}
