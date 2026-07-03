import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Ethiopia MFR seed (the national Master Facility Registry at mfr.moh.gov.et).
 * The et-mfr adaptor is a thin HTTP wrapper (get/post/request) over a REST API
 * whose paths are joined onto `/api/` — regions under /api/Location/Regions and
 * facilities under /api/Facility*. We seed a few regions and facilities so those
 * reads return realistic data on first boot.
 */

export function seed(store: DataStore, _config: SystemConfig): void {
  const regions = [
    { id: 1, name: 'Addis Ababa', code: 'ET-AA' },
    { id: 2, name: 'Oromia', code: 'ET-OR' },
    { id: 3, name: 'Amhara', code: 'ET-AM' },
  ];
  for (const r of regions) store.create('regions', String(r.id), r);

  const facilities = [
    {
      facilityId: 'FAC-0001',
      facilityName: 'Tikur Anbessa Specialized Hospital',
      hmisCode: 'AA0101',
      ownership: 'Public',
      facilityType: 'Specialized Hospital',
      operationalStatus: 'Operational',
      settlement: 'Urban',
      region: 'Addis Ababa',
      zone: 'Lideta',
      woreda: 'Woreda 03',
      latitude: 9.0108,
      longitude: 38.7613,
    },
    {
      facilityId: 'FAC-0002',
      facilityName: 'Adama Hospital Medical College',
      hmisCode: 'OR0210',
      ownership: 'Public',
      facilityType: 'General Hospital',
      operationalStatus: 'Operational',
      settlement: 'Urban',
      region: 'Oromia',
      zone: 'East Shewa',
      woreda: 'Adama',
      latitude: 8.5401,
      longitude: 39.2705,
    },
    {
      facilityId: 'FAC-0003',
      facilityName: 'Felege Hiwot Referral Hospital',
      hmisCode: 'AM0305',
      ownership: 'Public',
      facilityType: 'Referral Hospital',
      operationalStatus: 'Operational',
      settlement: 'Urban',
      region: 'Amhara',
      zone: 'West Gojjam',
      woreda: 'Bahir Dar',
      latitude: 11.5936,
      longitude: 37.3908,
    },
  ];
  for (const f of facilities) store.create('facilities', f.facilityId, f);
}
