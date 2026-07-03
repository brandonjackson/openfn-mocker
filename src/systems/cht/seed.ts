import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * CHT / Community Health Toolkit (Medic) seed — a community-health Digital
 * Public Good built on CouchDB. Contacts (district -> health center -> clinic ->
 * person) and a report are seeded as CouchDB docs, plus app settings. The cht
 * adaptor reads/writes these through the Medic REST API and CouchDB endpoints.
 */

/** A CouchDB-style _rev. */
export function rev(n = 1): string {
  return `${n}-${'0'.repeat(32).slice(0, 32)}`;
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const docs = [
    { _id: 'district-bo', type: 'district_hospital', name: 'Bo District', parent: null },
    { _id: 'hc-ngelehun', type: 'health_center', name: 'Ngelehun CHC', parent: { _id: 'district-bo' } },
    { _id: 'clinic-0001', type: 'clinic', name: 'Ngelehun Clinic A', parent: { _id: 'hc-ngelehun' } },
    {
      _id: 'person-chw-0001',
      type: 'person',
      name: 'Aminata Kamara',
      role: 'chw',
      phone: '+23276000001',
      parent: { _id: 'clinic-0001' },
    },
    {
      _id: 'person-patient-0001',
      type: 'person',
      name: 'Jane Doe',
      sex: 'female',
      date_of_birth: '1990-04-12',
      parent: { _id: 'clinic-0001' },
    },
    {
      _id: 'report-anc-0001',
      type: 'data_record',
      form: 'pregnancy',
      reported_date: 1710000000000,
      contact: { _id: 'person-chw-0001' },
      fields: { patient_id: 'person-patient-0001', lmp_date: '2024-01-01', edd: '2024-10-08' },
    },
  ];

  docs.forEach((doc, i) => {
    store.create('docs', doc._id, { ...doc, _rev: rev(1) });
    store.create('changes', doc._id, { seq: i + 1, id: doc._id, changes: [{ rev: rev(1) }] });
  });

  store.create('settings', 'settings', {
    settings: {
      locale: 'en',
      locales: [{ code: 'en', name: 'English' }],
      roles: { chw: { name: 'CHW' }, district_admin: { name: 'District Admin' } },
    },
  });
}
