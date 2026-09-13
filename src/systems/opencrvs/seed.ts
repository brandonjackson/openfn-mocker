import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenCRVS seed (civil-registration & vital-statistics Digital Public Good).
 *
 * Shapes follow the vendor's own OpenAPI documents for v2 (`release-v2.0.0`):
 *  - `locations` records are the inline object `GET /api/events/locations`
 *    returns — `{ id, name, externalId, administrativeAreaId, validUntil,
 *    locationType }` and nothing else. Ids are uuids; the tree is expressed by
 *    `administrativeAreaId` pointing at the parent admin area (there is no
 *    `partOf`/`jurisdictionType` in v2 — those were v1 FHIR Location fields).
 *  - `events` records are `EventDocument`s — `{ id, type, createdAt, updatedAt,
 *    actions, trackingId }`. There is no top-level `status`, `registrationNumber`
 *    or `data`: an event's history lives in `actions[]` (CREATE, NOTIFY, DECLARE,
 *    REGISTER, …), each carrying the declaration fields it contributed, and the
 *    status/registration number are *derived* from that list (see plugin.ts).
 *
 * The cast (Sierra Leone: Bo district, Ngelehun CHC) matches the rest of the
 * default dataset. All names are synthetic.
 */

/** Location ids — uuids, as v2 requires. Exported so plugin/tests can reference them. */
export const LOCATIONS = {
  country: '8f2a6e04-5d3b-4a9c-9f21-7c6b1d0e45a3',
  district: 'b41c7d28-9e60-4f13-8a5d-2c9f6b3e84d7',
  facility: '6d9e3b51-2a47-4c88-b16f-5e0a7d4c93b2',
  office: 'c73f0a16-8b52-4d6e-9c47-1f8e5a2b60d9',
} as const;

/** Seeded event ids, referenced by the guide/usage examples and the tests. */
export const EVENTS = {
  birth: '2e5c9a71-4b3d-4e82-a9f6-0c7d1b8e35a4',
  death: '9a1f4c60-7d28-4b53-8e9a-3f6c2d0b71e5',
} as const;

/** Synthetic users the seeded actions are attributed to. */
const REGISTRAR = '0f9d2b57-4c83-41ae-9e36-8b1a7d5c204e';
const FIELD_AGENT = 'a7c31e68-2d94-4f07-b52a-3e8d6c1f9074';

export function seed(store: DataStore, _config: SystemConfig): void {
  const locations = [
    {
      id: LOCATIONS.country,
      name: 'Sierra Leone',
      externalId: 'SL',
      administrativeAreaId: null,
      validUntil: null,
      locationType: 'ADMIN_STRUCTURE',
    },
    {
      id: LOCATIONS.district,
      name: 'Bo',
      externalId: 'BO',
      administrativeAreaId: LOCATIONS.country,
      validUntil: null,
      locationType: 'ADMIN_STRUCTURE',
    },
    {
      id: LOCATIONS.facility,
      name: 'Ngelehun CHC',
      externalId: 'HPGiE9Jjh2r',
      administrativeAreaId: LOCATIONS.district,
      validUntil: null,
      locationType: 'HEALTH_FACILITY',
    },
    {
      id: LOCATIONS.office,
      name: 'Bo District Office',
      externalId: null,
      administrativeAreaId: LOCATIONS.district,
      validUntil: null,
      locationType: 'CRVS_OFFICE',
    },
  ];
  for (const l of locations) store.create('locations', l.id, l);

  const events = [
    {
      // A completed birth registration: created, declared, registered.
      id: EVENTS.birth,
      type: 'v2.birth',
      createdAt: '2024-02-01T09:00:00.000Z',
      updatedAt: '2024-02-03T14:00:00.000Z',
      trackingId: 'BQSQGYH',
      actions: [
        {
          id: '1c8b5d37-6e94-4a21-9b7f-2d4e8c0a6f31',
          type: 'CREATE',
          status: 'Accepted',
          transactionId: 'seed-birth-create',
          createdAt: '2024-02-01T09:00:00.000Z',
          createdBy: FIELD_AGENT,
          createdByRole: 'FIELD_AGENT',
          createdByUserType: 'user',
          createdAtLocation: LOCATIONS.office,
          declaration: {},
        },
        {
          id: '4f2e7a90-3c15-4d68-ab29-6e0b7c4d1a83',
          type: 'DECLARE',
          status: 'Accepted',
          transactionId: 'seed-birth-declare',
          createdAt: '2024-02-02T11:30:00.000Z',
          createdBy: FIELD_AGENT,
          createdByRole: 'FIELD_AGENT',
          createdByUserType: 'user',
          createdAtLocation: LOCATIONS.office,
          declaration: {
            'child.name': { firstname: 'Amina', surname: 'Kamara' },
            'child.dob': '2024-01-28',
            'child.gender': 'female',
            'child.placeOfBirth': LOCATIONS.facility,
          },
        },
        {
          id: '7b3d1e59-8a26-4c47-9d05-1a6f2e8b473c',
          type: 'REGISTER',
          status: 'Accepted',
          transactionId: 'seed-birth-register',
          createdAt: '2024-02-03T14:00:00.000Z',
          createdBy: REGISTRAR,
          createdByRole: 'LOCAL_REGISTRAR',
          createdByUserType: 'user',
          createdAtLocation: LOCATIONS.office,
          declaration: {},
          registrationNumber: '2024BQSQGYH',
        },
      ],
    },
    {
      // A death event still at the declared stage (notified from the field first).
      id: EVENTS.death,
      type: 'v2.death',
      createdAt: '2024-02-10T10:00:00.000Z',
      updatedAt: '2024-02-10T12:15:00.000Z',
      trackingId: 'DFGTR12',
      actions: [
        {
          id: '3a6e2c84-5f71-4b39-8c62-9d0a4f1e7b58',
          type: 'CREATE',
          status: 'Accepted',
          transactionId: 'seed-death-create',
          createdAt: '2024-02-10T10:00:00.000Z',
          createdBy: FIELD_AGENT,
          createdByRole: 'FIELD_AGENT',
          createdByUserType: 'system',
          createdAtLocation: LOCATIONS.office,
          declaration: {},
        },
        {
          id: '5d0b7f43-1a29-4e65-b83c-7f2e6a9d40c1',
          type: 'NOTIFY',
          status: 'Accepted',
          transactionId: 'seed-death-notify',
          createdAt: '2024-02-10T10:05:00.000Z',
          createdBy: FIELD_AGENT,
          createdByRole: 'FIELD_AGENT',
          createdByUserType: 'system',
          createdAtLocation: LOCATIONS.office,
          declaration: {
            'deceased.name': { firstname: 'John', surname: 'Smith' },
            'deceased.dod': '2024-02-08',
          },
        },
        {
          id: '8c4a0d62-9b37-4f18-92e5-6a1d3b7c085f',
          type: 'DECLARE',
          status: 'Accepted',
          transactionId: 'seed-death-declare',
          createdAt: '2024-02-10T12:15:00.000Z',
          createdBy: REGISTRAR,
          createdByRole: 'LOCAL_REGISTRAR',
          createdByUserType: 'user',
          createdAtLocation: LOCATIONS.office,
          declaration: {},
        },
      ],
    },
  ];
  for (const e of events) store.create('events', e.id, e);
}
