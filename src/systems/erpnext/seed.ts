import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * ERPNext / Frappe seed. ERPNext stores every record as a "document" of a given
 * DocType (Customer, Item, ...), keyed by its `name` (Frappe's primary key).
 * Collections here are keyed by DocType name and records by their `name`, so the
 * Frappe REST paths /api/resource/<DocType>/<name> resolve on first boot.
 */

export function nowStamp(): string {
  // Frappe timestamps look like "2024-01-15 09:30:00" (space, not the T/Z of ISO).
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const customers = [
    {
      name: 'CUST-0001',
      customer_name: 'Acme Corporation',
      customer_type: 'Company',
      customer_group: 'Commercial',
      territory: 'United States',
    },
    {
      name: 'CUST-0002',
      customer_name: 'Beta Health Clinic',
      customer_type: 'Company',
      customer_group: 'Non Profit',
      territory: 'Kenya',
    },
  ];
  for (const c of customers) {
    store.create('Customer', c.name, {
      doctype: 'Customer',
      ...c,
      disabled: 0,
      creation: nowStamp(),
      modified: nowStamp(),
      owner: 'Administrator',
    });
  }

  const items = [
    { name: 'ITEM-0001', item_code: 'ITEM-0001', item_name: 'Paracetamol 500mg', item_group: 'Products', stock_uom: 'Nos', standard_rate: 0.05 },
    { name: 'ITEM-0002', item_code: 'ITEM-0002', item_name: 'Bed Net', item_group: 'Products', stock_uom: 'Nos', standard_rate: 3.5 },
  ];
  for (const it of items) {
    store.create('Item', it.name, {
      doctype: 'Item',
      ...it,
      disabled: 0,
      creation: nowStamp(),
      modified: nowStamp(),
      owner: 'Administrator',
    });
  }
}
