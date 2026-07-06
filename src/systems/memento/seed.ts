import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Memento Database seed. Seeds one library (with a field schema) and one entry so
 * reads work on first boot; createEntry adds to the same 'entries' collection.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  store.create('libraries', 'lib_seed01', {
    id: 'lib_seed01',
    name: 'Contacts',
    owner: 'mock',
    createdTime: nowIso(),
    fields: [
      { id: 1, name: 'Name', type: 'text' },
      { id: 2, name: 'Phone', type: 'text' },
    ],
  });

  store.create('entries', 'entry_seed01', {
    id: 'entry_seed01',
    author: 'mock',
    createdTime: nowIso(),
    modifiedTime: nowIso(),
    fields: [
      { id: 1, value: 'Ada' },
      { id: 2, value: '555-1000' },
    ],
  });
}
