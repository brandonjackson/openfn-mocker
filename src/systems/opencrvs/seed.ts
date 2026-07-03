import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenCRVS seed (civil-registration & vital-statistics Digital Public Good).
 * Seeds a small location tree and a couple of registration events (a birth and a
 * death) exposed through both the GraphQL search API and the events REST API the
 * opencrvs adaptor uses.
 */

export function seed(store: DataStore, _config: SystemConfig): void {
  const locations = [
    { id: 'loc-sl', name: 'Sierra Leone', alias: 'Sierra Leone', partOf: null, type: 'ADMIN_STRUCTURE', jurisdictionType: 'STATE' },
    { id: 'loc-bo', name: 'Bo', alias: 'Bo', partOf: 'Location/loc-sl', type: 'ADMIN_STRUCTURE', jurisdictionType: 'DISTRICT' },
    { id: 'loc-ngelehun-chc', name: 'Ngelehun CHC', alias: 'Ngelehun CHC', partOf: 'Location/loc-bo', type: 'HEALTH_FACILITY' },
  ];
  for (const l of locations) store.create('locations', l.id, l);

  const events = [
    {
      id: 'event-birth-0001',
      type: 'v2.birth',
      status: 'REGISTERED',
      trackingId: 'BQSQGYH',
      registrationNumber: '2024BQSQGYH',
      createdAt: '2024-02-01T09:00:00.000Z',
      updatedAt: '2024-02-03T14:00:00.000Z',
      data: { 'child.firstname': 'Baby', 'child.surname': 'Kamara', 'child.dob': '2024-01-28', 'child.placeOfBirth': 'loc-ngelehun-chc' },
    },
    {
      id: 'event-death-0001',
      type: 'v2.death',
      status: 'DECLARED',
      trackingId: 'DFGTR12',
      registrationNumber: null,
      createdAt: '2024-02-10T10:00:00.000Z',
      updatedAt: '2024-02-10T10:00:00.000Z',
      data: { 'deceased.firstname': 'Musa', 'deceased.surname': 'Sesay', 'deceased.dod': '2024-02-08' },
    },
  ];
  for (const e of events) store.create('events', e.id, e);
}
