import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenFn Collections seed. One collection ('patients') with a couple of
 * key/value pairs so collections.get / collections.each return data on boot.
 * Records are stored under the collection name, shaped { key, value, created,
 * updated } and keyed by `key`.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const now = nowIso();
  const pairs: Array<{ key: string; value: Record<string, any> }> = [
    { key: 'patient-001', value: { name: 'Ada' } },
    { key: 'patient-002', value: { name: 'Grace' } },
  ];
  for (const p of pairs) {
    store.create('patients', p.key, { key: p.key, value: p.value, created: now, updated: now });
  }
}
