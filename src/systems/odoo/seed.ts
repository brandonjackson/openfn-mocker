import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Odoo seed (ERP/CRM). Seeds the models the odoo adaptor reads/writes via
 * XML-RPC: res.partner (customers/contacts), crm.lead (CRM opportunities) and
 * product.product. Records use integer ids like a real Odoo database and Odoo
 * many2one fields are stored as `[id, label]` pairs. Collections are keyed by the
 * Odoo model name.
 */

export const UID = 2; // the "authenticated" Odoo user id returned by login (admin).

export function seed(store: DataStore, _config: SystemConfig): void {
  const partners = [
    { id: 1, name: 'Acme Corporation', is_company: true, email: 'contact@acme.example', phone: '+1-202-555-0100', city: 'Washington', customer_rank: 1, supplier_rank: 0 },
    { id: 2, name: 'Beta Health Clinic', is_company: true, email: 'info@betahealth.example', phone: '+254-20-555-0101', city: 'Nairobi', customer_rank: 1, supplier_rank: 0 },
    { id: 3, name: 'Amina Yusuf', is_company: false, parent_id: [2, 'Beta Health Clinic'], email: 'amina@betahealth.example', phone: '+254-20-555-0102', function: 'Procurement Officer', customer_rank: 0, supplier_rank: 0 },
  ];
  for (const p of partners) store.create('res.partner', String(p.id), p);

  const leads = [
    { id: 10, name: 'Bulk medical supplies', partner_id: [1, 'Acme Corporation'], type: 'opportunity', email_from: 'contact@acme.example', expected_revenue: 25000, probability: 40, stage_id: [1, 'New'] },
    { id: 11, name: 'Cold chain expansion', partner_id: [2, 'Beta Health Clinic'], type: 'lead', email_from: 'info@betahealth.example', expected_revenue: 12000, probability: 20, stage_id: [1, 'New'] },
  ];
  for (const l of leads) store.create('crm.lead', String(l.id), l);

  const products = [
    { id: 20, name: 'Paracetamol 500mg', default_code: 'MED-PARA-500', list_price: 0.05, type: 'product', uom_id: [1, 'Units'] },
    { id: 21, name: 'Insecticidal Bed Net', default_code: 'SUP-NET-01', list_price: 3.5, type: 'product', uom_id: [1, 'Units'] },
  ];
  for (const p of products) store.create('product.product', String(p.id), p);
}
