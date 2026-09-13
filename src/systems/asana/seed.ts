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

/**
 * The `projects` a task belongs to come back as *compact project objects*
 * (`ProjectCompact` in Asana's OpenAPI), not as bare gids — even though the
 * create/update request accepts an array of gids. `projectRef` turns either
 * form into the response shape.
 */
export function projectRef(project: unknown): Record<string, any> {
  if (project && typeof project === 'object') return project as Record<string, any>;
  const gid = String(project);
  return { gid, resource_type: 'project', name: projectNames[gid] ?? 'Untitled project' };
}

const projectNames: Record<string, string> = {
  proj_seed01: 'Mock project',
};

export function seed(store: DataStore, _config: SystemConfig): void {
  const tasks = [
    {
      gid: 'task_seed01',
      resource_type: 'task',
      name: 'Write spec',
      notes: '',
      completed: false,
      projects: [projectRef('proj_seed01')],
      created_at: nowIso(),
      modified_at: nowIso(),
    },
    {
      gid: 'task_seed02',
      resource_type: 'task',
      name: 'Review pull request',
      notes: 'Check the mocker changes',
      completed: false,
      projects: [projectRef('proj_seed01')],
      created_at: nowIso(),
      modified_at: nowIso(),
    },
  ];
  for (const t of tasks) store.create('tasks', t.gid, t);
}
