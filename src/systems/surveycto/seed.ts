import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * SurveyCTO seed. A couple of wide-JSON form submissions so fetchSubmissions
 * returns data on first boot, plus one server dataset so list('datasets') is
 * non-empty. Submission keys use SurveyCTO's `uuid:` KEY style.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const submissions = [
    {
      KEY: 'uuid:seed01',
      field_name: 'Ada',
      age: '36',
      CompletionDate: 'Jan 05, 2024 09:12:00 AM',
      SubmissionDate: nowIso(),
    },
    {
      KEY: 'uuid:seed02',
      field_name: 'Grace',
      age: '41',
      CompletionDate: 'Jan 06, 2024 02:44:00 PM',
      SubmissionDate: nowIso(),
    },
  ];
  for (const s of submissions) store.create('submissions', s.KEY, s);

  const datasets = [
    {
      id: 'demographics',
      title: 'Demographics',
      type: 'SERVER_DATASET',
      lastModified: nowIso(),
    },
  ];
  for (const d of datasets) store.create('datasets', d.id, d);
}
