import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Ibipimo seed. Seeds one site and one sample for the read endpoints
 * (GET /api/v1/sites, GET /api/v1/samples/status), and one submitted
 * viral-load request so POST /api/v1/ask-for-vl-results can report a sample
 * status on first boot. No published result is seeded: the adaptor documents
 * `results` only as an empty array, so its element shape is unknown.
 */

export const SEEDED_SITEID = '77889900';
export const SEEDED_SAMPLE_UID = 'IBI-2024-000001';

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const site = { id: 'ST-01', name: 'Central Health Facility', code: 'ST-01' };
  store.create('sites', site.id, site);

  // A viral-load request already submitted through the API and not yet
  // processed by the lab: the state the adaptor README's own example shows.
  store.create('vlrequests', SEEDED_SAMPLE_UID, {
    id: 830001,
    s_uid: SEEDED_SAMPLE_UID,
    siteid: SEEDED_SITEID,
    codepatient: '000010',
    sidainfo_uid: '147460',
    date_prelevement: '15/04/2024 11:49:00',
    updated_at: '2026-02-18 12:52:51',
    created_at: '2026-02-18T12:52:51.000000Z',
  });

  const sample = { sampleId: 'SMP-1001', status: 'resulted' };
  store.create('samples', sample.sampleId, sample);
}
