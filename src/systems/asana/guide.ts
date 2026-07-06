import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the asana system. Paths match the Asana API 1.0 resources
 * the adaptor calls; every response uses Asana's `{ data: ... }` envelope. The
 * example ids are the cross-link targets for the usage examples' `apiRef`.
 */
export const guide: SystemGuide = {
  title: 'Asana',
  docs: 'https://docs.openfn.org/adaptors/packages/asana-docs',
  blurb:
    'Work management. The adaptor authenticates with a Bearer personal access token against https://app.asana.com/api/1.0 and works with tasks, stories and searches. Asana wraps every request body and response in a { data: ... } envelope.',
  auth: 'Bearer (personal access token)',
  examples: [
    { id: 'listTasks', method: 'GET', path: '/api/1.0/tasks', label: 'List tasks (getTasks)' },
    { id: 'getTask', method: 'GET', path: '/api/1.0/tasks/task_seed01', label: 'Fetch a task by gid' },
    {
      id: 'createTask',
      method: 'POST',
      path: '/api/1.0/tasks',
      label: 'Create a task',
      body: JSON.stringify({ data: { name: 'New task', notes: 'details' } }, null, 2),
    },
    {
      id: 'updateTask',
      method: 'PUT',
      path: '/api/1.0/tasks/task_seed01',
      label: 'Update a task',
      body: JSON.stringify({ data: { completed: true } }, null, 2),
    },
    {
      id: 'search',
      method: 'GET',
      path: '/api/1.0/workspaces/12345/tasks/search?text=Write',
      label: 'Search tasks in a workspace',
    },
    {
      id: 'story',
      method: 'POST',
      path: '/api/1.0/tasks/task_seed01/stories',
      label: 'Add a comment (story) to a task',
      body: JSON.stringify({ data: { text: 'Nice work!' } }, null, 2),
    },
  ],
};
