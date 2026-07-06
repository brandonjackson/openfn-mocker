import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenFn (Lightning) seed. A couple of jobs and one project so listings and
 * by-id lookups return data on first boot. Ids are UUIDs, matching Lightning's
 * resource ids. The first job id is referenced by the guide's getJob example.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/** Fixed seed job id, referenced by the guide's getJob example. */
export const SEED_JOB_ID = '11111111-1111-4111-8111-111111111111';

export function seed(store: DataStore, _config: SystemConfig): void {
  const jobs = [
    {
      id: SEED_JOB_ID,
      name: 'Fetch patients',
      adaptor: '@openfn/language-http',
      enabled: true,
      inserted_at: nowIso(),
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Sync to DHIS2',
      adaptor: '@openfn/language-dhis2',
      enabled: false,
      inserted_at: nowIso(),
    },
  ];
  for (const j of jobs) store.create('jobs', j.id, j);

  const projects = [
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Health data pipeline',
      description: 'Nightly sync of facility data into the national HMIS.',
      inserted_at: nowIso(),
    },
  ];
  for (const p of projects) store.create('projects', p.id, p);
}
