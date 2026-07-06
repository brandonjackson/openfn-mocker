import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Ibipimo seed. Seeds one site, one viral-load result and one sample so the
 * read endpoints (GET /api/v1/sites, GET /api/v1/samples/status) and the
 * results lookup (POST /api/v1/ask-for-vl-results) return data on first boot.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const site = { id: 'ST-01', name: 'Central Health Facility', code: 'ST-01' };
  store.create('sites', site.id, site);

  const vlresult = {
    sampleId: 'SMP-1001',
    patientId: 'PT-001',
    result: '<40 copies/mL (Undetectable)',
    resultDate: nowIso(),
  };
  store.create('vlresults', vlresult.sampleId, vlresult);

  const sample = { sampleId: 'SMP-1001', status: 'resulted' };
  store.create('samples', sample.sampleId, sample);
}
