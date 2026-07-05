import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Resource Map seed (an open-source tool for mapping and tracking facilities /
 * resources by collection). The resourcemap adaptor submits sites into a
 * collection via POST /api/collections/:id/sites.json; we seed a couple of
 * collections and their sites so the collection/site reads work on first boot.
 */

export function seed(store: DataStore, _config: SystemConfig): void {
  const collections = [
    { id: 1, name: 'Health Facilities', description: 'National health facility registry' },
    { id: 2, name: 'Cold Chain Equipment', description: 'Fridges and freezers by site' },
  ];
  for (const c of collections) store.create('collections', String(c.id), c);

  const sites = [
    {
      id: 101,
      collection_id: 1,
      name: 'Kigali District Hospital',
      lat: -1.9536,
      lng: 30.0606,
      properties: { type: 'hospital', ownership: 'public' },
    },
    {
      id: 102,
      collection_id: 1,
      name: 'Nyarugenge Health Center',
      lat: -1.9441,
      lng: 30.0588,
      properties: { type: 'health_center', ownership: 'public' },
    },
    {
      id: 201,
      collection_id: 2,
      name: 'Kigali DH — Fridge #1',
      lat: -1.9536,
      lng: 30.0606,
      properties: { model: 'VLS-054', status: 'working' },
    },
  ];
  for (const s of sites) store.create('sites', String(s.id), s);
}
