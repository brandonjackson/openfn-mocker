import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Dagu seed. A couple of DAGs (keyed by name) so the listing and by-name lookup
 * return data on first boot. The guide's getDag / startDag examples target the
 * 'nightly' DAG.
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  const dags = [
    { name: 'nightly', status: 'idle', schedule: '0 2 * * *' },
    { name: 'hourly-etl', status: 'running', schedule: '0 * * * *' },
  ];
  for (const d of dags) store.create('dags', d.name, d);
}
