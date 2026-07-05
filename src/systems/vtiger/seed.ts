import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Vtiger CRM seed. Vtiger records are keyed by a webservice id of the form
 * `<moduleTypeId>x<recordId>` (e.g. Contacts is module 12, so "12x1"). Seeds a
 * couple of Contacts so retrieve/query/update work on first boot. Collections are
 * keyed by the module (element type) name.
 */

/** Webservice module type ids (the "<id>x" prefix of a record id). */
export const MODULE_IDS: Record<string, number> = {
  Contacts: 12,
  Leads: 10,
  Accounts: 11,
};

export function seed(store: DataStore, _config: SystemConfig): void {
  const contacts = [
    { id: '12x1', firstname: 'Amina', lastname: 'Yusuf', email: 'amina@example.org', phone: '+254205550102', mobile: '+254712000001', assigned_user_id: '19x1' },
    { id: '12x2', firstname: 'David', lastname: 'Okoro', email: 'david@example.org', phone: '+234105550103', mobile: '+234812000002', assigned_user_id: '19x1' },
  ];
  for (const c of contacts) store.create('Contacts', c.id, c);

  const leads = [
    { id: '10x1', firstname: 'Grace', lastname: 'Mensah', company: 'Gamma Distributors', email: 'grace@gamma.example', leadstatus: 'Cold', assigned_user_id: '19x1' },
  ];
  for (const l of leads) store.create('Leads', l.id, l);
}
