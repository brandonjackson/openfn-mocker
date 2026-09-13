import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Resource Map seed (an open-source tool for mapping and tracking facilities /
 * resources by collection). The resourcemap adaptor submits sites into a
 * collection via POST /api/collections/:id/sites.json; the read side is the
 * query endpoint GET /api/collections/:id.json. We seed a couple of collections
 * and their sites so both work on first boot.
 *
 * Sites are stored in the *record* shape Rails persists and the write endpoints
 * return (`lat`/`lng`, `uuid`, `version`, `created_at`); the query endpoint
 * projects them into the query-API shape (`lat`/`long`, `createdAt`) itself.
 */

export function seed(store: DataStore, _config: SystemConfig): void {
  const collections = [
    {
      id: 1,
      name: 'Health Facilities',
      description: 'National health facility registry',
      icon: 'default',
      lat: -1.9536,
      lng: 30.0606,
      public: null,
      created_at: '2012-03-27T07:40:06Z',
      updated_at: '2012-03-28T07:58:02Z',
    },
    {
      id: 2,
      name: 'Cold Chain Equipment',
      description: 'Fridges and freezers by site',
      icon: 'default',
      lat: -1.9536,
      lng: 30.0606,
      public: null,
      created_at: '2012-04-02T11:12:41Z',
      updated_at: '2012-04-09T09:03:18Z',
    },
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
      location_mode: 'manual',
      uuid: '3f6b1f2a-2b5c-4a1e-9a6f-9c0f3d0a1b11',
      version: 1,
      created_at: '2012-03-28T07:55:56Z',
      updated_at: '2012-03-28T07:55:56Z',
    },
    {
      id: 102,
      collection_id: 1,
      name: 'Nyarugenge Health Center',
      lat: -1.9441,
      lng: 30.0588,
      properties: { type: 'health_center', ownership: 'public' },
      location_mode: 'manual',
      uuid: 'a1c9d4e7-5f32-4d0b-8c77-2e1b6a4c9d22',
      version: 1,
      created_at: '2012-03-28T08:02:11Z',
      updated_at: '2012-03-28T08:02:11Z',
    },
    {
      id: 201,
      collection_id: 2,
      name: 'Kigali DH — Fridge #1',
      lat: -1.9536,
      lng: 30.0606,
      properties: { model: 'VLS-054', status: 'working' },
      location_mode: 'manual',
      uuid: '7d2e8b40-9a11-4c6d-b3f5-0c8a5e7f1d33',
      version: 1,
      created_at: '2012-04-02T11:20:03Z',
      updated_at: '2012-04-02T11:20:03Z',
    },
  ];
  for (const s of sites) store.create('sites', String(s.id), s);
}
