import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Asana seed. Seeds a couple of tasks so getTasks / getTask / searchTask work on
 * first boot; createTask adds to the same 'tasks' collection. Records are stored
 * unwrapped (Asana wraps every response in `{ data: ... }`, added by the plugin).
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const tasks = [
    {
      gid: 'task_seed01',
      resource_type: 'task',
      name: 'Write spec',
      notes: '',
      completed: false,
      projects: ['proj_seed01'],
      created_at: nowIso(),
      modified_at: nowIso(),
    },
    {
      gid: 'task_seed02',
      resource_type: 'task',
      name: 'Review pull request',
      notes: 'Check the mocker changes',
      completed: false,
      projects: ['proj_seed01'],
      created_at: nowIso(),
      modified_at: nowIso(),
    },
  ];
  for (const t of tasks) store.create('tasks', t.gid, t);
}
