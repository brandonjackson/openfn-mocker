import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Ethiopia MFR seed (the national Master Facility Registry at mfr.moh.gov.et).
 *
 * The records here are shaped the way the real registry shapes them: a facility
 * carries integer ids *and* the resolved reference objects (`regionId` + `region`,
 * `facilityTypeId` + `facilityType`, ...), every reference row is the same
 * `LookupItem` shape (name/code/id/isActive plus audit columns), and the
 * administrative hierarchy is region -> zone -> woreda. The plugin wraps all of
 * it in MFR's `{ result, message, model }` envelope on the way out.
 */

/** The audit columns every MFR row carries. */
function audit(rowGuid: string, created = '2019-06-04T09:12:44Z', modified = '2023-11-21T07:35:02Z') {
  return {
    isActive: true,
    createdBy: 1,
    createdDate: created,
    modifiedBy: 1,
    modifiedDate: modified,
    rowGuid,
  };
}

export function seed(store: DataStore, _config: SystemConfig): void {
  // --- Administrative hierarchy: region -> zone -> woreda ---
  const regions = [
    { id: 1, name: 'Addis Ababa City Administration', code: 'AA', logoPath: null, useFacilityLicensing: true, ...audit('7a1a8f3e-1f5d-4a92-9a1c-5c9a4b3e0001') },
    { id: 2, name: 'Oromia Region', code: 'OR', logoPath: null, useFacilityLicensing: true, ...audit('7a1a8f3e-1f5d-4a92-9a1c-5c9a4b3e0002') },
    { id: 3, name: 'Amhara Region', code: 'AM', logoPath: null, useFacilityLicensing: true, ...audit('7a1a8f3e-1f5d-4a92-9a1c-5c9a4b3e0003') },
  ];
  for (const r of regions) store.create('regions', String(r.id), r);
  const regionById = new Map(regions.map((r) => [r.id, r]));

  const zones = [
    { id: 11, regionId: 1, region: regionById.get(1), name: 'Lideta Sub City', code: 'AA-LID', logoPath: null, useFacilityLicensing: true, ...audit('2c5d9b77-3a64-4f18-8d2b-6f0e1a2b0011') },
    { id: 12, regionId: 2, region: regionById.get(2), name: 'East Shewa Zone', code: 'OR-ESH', logoPath: null, useFacilityLicensing: true, ...audit('2c5d9b77-3a64-4f18-8d2b-6f0e1a2b0012') },
    { id: 13, regionId: 3, region: regionById.get(3), name: 'West Gojjam Zone', code: 'AM-WGJ', logoPath: null, useFacilityLicensing: true, ...audit('2c5d9b77-3a64-4f18-8d2b-6f0e1a2b0013') },
  ];
  for (const z of zones) store.create('zones', String(z.id), z);
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const woredas = [
    { id: 101, zoneId: 11, zone: zoneById.get(11), name: 'Woreda 03', code: 'AA-LID-03', logoPath: null, useFacilityLicensing: true, ...audit('9e4f0c21-7b58-4d3a-9e17-4a8c2d5f0101') },
    { id: 102, zoneId: 12, zone: zoneById.get(12), name: 'Adama Town', code: 'OR-ESH-ADA', logoPath: null, useFacilityLicensing: true, ...audit('9e4f0c21-7b58-4d3a-9e17-4a8c2d5f0102') },
    { id: 103, zoneId: 13, zone: zoneById.get(13), name: 'Bahir Dar Town', code: 'AM-WGJ-BDR', logoPath: null, useFacilityLicensing: true, ...audit('9e4f0c21-7b58-4d3a-9e17-4a8c2d5f0103') },
  ];
  for (const w of woredas) store.create('woredas', String(w.id), w);
  const woredaById = new Map(woredas.map((w) => [w.id, w]));

  // --- Reference data. Every MFR lookup collection shares the LookupItem
  // shape; `lookupType` is our own index onto GET /api/Lookup?name=... and is
  // stripped before a row is served. Facility types additionally carry the
  // parent/child links of the FacilityType schema.
  const lookups = [
    { lookupType: 'FacilityType', id: 201, name: 'Specialized Hospital', code: 'SPH', parentFacilityTypeId: null, ...audit('b3c6e8a1-0d47-4c39-8a52-1f6b9c4d0201') },
    { lookupType: 'FacilityType', id: 202, name: 'General Hospital', code: 'GNH', parentFacilityTypeId: null, ...audit('b3c6e8a1-0d47-4c39-8a52-1f6b9c4d0202') },
    { lookupType: 'FacilityType', id: 203, name: 'Referral Hospital', code: 'RFH', parentFacilityTypeId: null, ...audit('b3c6e8a1-0d47-4c39-8a52-1f6b9c4d0203') },
    { lookupType: 'FacilityType', id: 204, name: 'Health Center', code: 'HCN', parentFacilityTypeId: null, ...audit('b3c6e8a1-0d47-4c39-8a52-1f6b9c4d0204') },
    { lookupType: 'Ownership', id: 301, name: 'Public/Government', code: 'PUB', ...audit('c4d7f9b2-1e58-4d40-9b63-2a7c0d5e0301') },
    { lookupType: 'Ownership', id: 302, name: 'Private for Profit', code: 'PRV', ...audit('c4d7f9b2-1e58-4d40-9b63-2a7c0d5e0302') },
    { lookupType: 'OperationalStatus', id: 401, name: 'Operational', code: 'OPR', ...audit('d5e80ac3-2f69-4e51-ac74-3b8d1e6f0401') },
    { lookupType: 'OperationalStatus', id: 402, name: 'Not Operational', code: 'NOP', ...audit('d5e80ac3-2f69-4e51-ac74-3b8d1e6f0402') },
    { lookupType: 'Settlement', id: 501, name: 'Urban', code: 'URB', ...audit('e6f91bd4-306a-4f62-bd85-4c9e2f700501') },
    { lookupType: 'Settlement', id: 502, name: 'Rural', code: 'RUR', ...audit('e6f91bd4-306a-4f62-bd85-4c9e2f700502') },
    { lookupType: 'Status', id: 601, name: 'Approved', code: 'APR', ...audit('f70a2ce5-417b-4073-ce96-5daf30810601') },
    { lookupType: 'Status', id: 602, name: 'Pending', code: 'PND', ...audit('f70a2ce5-417b-4073-ce96-5daf30810602') },
  ];
  for (const l of lookups) store.create('lookups', String(l.id), l);
  const lookupById = new Map(lookups.map((l) => [l.id, l]));

  /** A lookup row as the API serves it: without our `lookupType` index. */
  const ref = (id: number) => {
    const { lookupType: _type, ...row } = lookupById.get(id) as Record<string, any>;
    return row;
  };

  // --- Facilities ---
  const facilities = [
    {
      id: 1071644,
      name: 'Tikur Anbessa Specialized Hospital',
      dhis2Id: 'wprKoIJqBaI',
      hmisCode: 'AA0101',
      ethiopianNationalFacilityId: 'ET-AA-0101',
      facilityId: 'FAC-0001',
      isImported: false,
      city: 'Addis Ababa',
      kebele: '05',
      latitude: 9.0108,
      longitude: 38.7613,
      phoneNumber: '+251115517011',
      email: 'info@tash.moh.gov.et',
      yearOpened: '1972-01-01T00:00:00Z',
      catchmentPopulation: 5000000,
      numberOfInPatientBeds: 700,
      regionId: 1,
      zoneId: 11,
      woredaId: 101,
      statusId: 601,
      ownershipId: 301,
      facilityTypeId: 201,
      operationalStatusId: 401,
      settlementId: 501,
      ...audit('11111111-aaaa-4bbb-8ccc-000000000001'),
    },
    {
      id: 1071645,
      name: 'Adama Hospital Medical College',
      dhis2Id: 'xQrLpJKrCbJ',
      hmisCode: 'OR0210',
      ethiopianNationalFacilityId: 'ET-OR-0210',
      facilityId: 'FAC-0002',
      isImported: false,
      city: 'Adama',
      kebele: '07',
      latitude: 8.5401,
      longitude: 39.2705,
      phoneNumber: '+251221110033',
      email: null,
      yearOpened: '1952-01-01T00:00:00Z',
      catchmentPopulation: 1200000,
      numberOfInPatientBeds: 320,
      regionId: 2,
      zoneId: 12,
      woredaId: 102,
      statusId: 601,
      ownershipId: 301,
      facilityTypeId: 202,
      operationalStatusId: 401,
      settlementId: 501,
      ...audit('11111111-aaaa-4bbb-8ccc-000000000002'),
    },
    {
      id: 1071646,
      name: 'Felege Hiwot Referral Hospital',
      dhis2Id: 'yRsMqKLsDcK',
      hmisCode: 'AM0305',
      ethiopianNationalFacilityId: 'ET-AM-0305',
      facilityId: 'FAC-0003',
      isImported: false,
      city: 'Bahir Dar',
      kebele: '11',
      latitude: 11.5936,
      longitude: 37.3908,
      phoneNumber: '+251582200032',
      email: null,
      yearOpened: '1963-01-01T00:00:00Z',
      catchmentPopulation: 900000,
      numberOfInPatientBeds: 400,
      regionId: 3,
      zoneId: 13,
      woredaId: 103,
      statusId: 601,
      ownershipId: 301,
      facilityTypeId: 203,
      operationalStatusId: 401,
      settlementId: 501,
      ...audit('11111111-aaaa-4bbb-8ccc-000000000003'),
    },
  ];

  for (const f of facilities) {
    store.create('facilities', String(f.id), {
      ...f,
      // The registry returns the resolved reference objects alongside the ids.
      region: regionById.get(f.regionId),
      zone: zoneById.get(f.zoneId),
      woreda: woredaById.get(f.woredaId) ?? null,
      status: ref(f.statusId),
      ownership: ref(f.ownershipId),
      facilityType: ref(f.facilityTypeId),
      operationalStatus: ref(f.operationalStatusId),
      settlement: ref(f.settlementId),
    });
  }
}
