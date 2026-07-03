import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * RapidPro / TextIt seed (a messaging Digital Public Good). Seeds a couple of
 * flows, groups and custom fields plus a few contacts, matching the resources
 * the OpenFn rapidpro adaptor reads and writes (contacts, flow_starts,
 * broadcasts) over the /api/v2 DRF API.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const groups = [
    { uuid: 'grp-0001-anc', name: 'ANC Mothers', query: null, status: 'ready', count: 2 },
    { uuid: 'grp-0002-chw', name: 'Community Health Workers', query: null, status: 'ready', count: 1 },
  ];
  for (const g of groups) store.create('groups', g.uuid, g);

  const fields = [
    { key: 'district', name: 'District', type: 'text', label: 'District' },
    { key: 'edd', name: 'Expected Delivery Date', type: 'datetime', label: 'EDD' },
  ];
  for (const f of fields) store.create('fields', f.key, f);

  const flows = [
    { uuid: 'flow-0001-anc-reminder', name: 'ANC Appointment Reminder', type: 'message', archived: false, expires: 10080 },
    { uuid: 'flow-0002-registration', name: 'Patient Registration', type: 'message', archived: false, expires: 10080 },
  ];
  for (const f of flows) store.create('flows', f.uuid, f);

  const contacts = [
    { name: 'Jane Doe', urns: ['tel:+23276000001'], groups: [{ uuid: 'grp-0001-anc', name: 'ANC Mothers' }], fields: { district: 'Bo' } },
    { name: 'Amina Kamara', urns: ['tel:+23276000002'], groups: [{ uuid: 'grp-0001-anc', name: 'ANC Mothers' }], fields: { district: 'Kenema' } },
    { name: 'Mohamed Sesay', urns: ['tel:+23276000003'], groups: [{ uuid: 'grp-0002-chw', name: 'Community Health Workers' }], fields: { district: 'Makeni' } },
  ];
  for (const c of contacts) {
    const uuid = randomUUID();
    store.create('contacts', uuid, {
      uuid,
      name: c.name,
      language: 'eng',
      urns: c.urns,
      groups: c.groups,
      fields: c.fields,
      blocked: false,
      stopped: false,
      created_on: nowIso(),
      modified_on: nowIso(),
    });
  }
}
