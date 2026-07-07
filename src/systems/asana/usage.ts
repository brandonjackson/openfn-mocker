import type { UsageExample } from '../types.js';

/**
 * Usage examples for the asana sandbox "Usage" tab: one entry per adaptor
 * function. Each `apiRef` links to a matching example id on the guide.
 */
export const usage: UsageExample[] = [
  {
    fn: 'getTasks',
    signature: 'getTasks(params, callback?)',
    description: 'List tasks, typically scoped to a project.',
    code: "getTasks('projectGid');",
    apiRef: 'listTasks',
  },
  {
    fn: 'getTask',
    signature: 'getTask(taskGid, params?, callback?)',
    description: 'Fetch a single task by gid.',
    code: "getTask('task_seed01');",
    apiRef: 'getTask',
  },
  {
    fn: 'createTask',
    signature: 'createTask(params, callback?)',
    description: 'Create a new task.',
    code: "createTask({\n  name: 'New task',\n  notes: 'details',\n  projects: ['projectGid']\n});",
    apiRef: 'createTask',
  },
  {
    fn: 'updateTask',
    signature: 'updateTask(taskGid, params, callback?)',
    description: 'Update fields on an existing task.',
    code: "updateTask('task_seed01', { completed: true });",
    apiRef: 'updateTask',
  },
  {
    fn: 'searchTask',
    signature: 'searchTask(searchTerm, callback?)',
    description: 'Search tasks in the configured workspace by free text.',
    code: "searchTask('Write');",
    apiRef: 'search',
  },
  {
    fn: 'createTaskStory',
    signature: 'createTaskStory(taskGid, params, callback?)',
    description: 'Add a comment (story) to a task.',
    code: "createTaskStory('task_seed01', { text: 'Nice work!' });",
    apiRef: 'story',
  },
  {
    fn: 'upsertTask',
    signature: 'upsertTask(projectGid, { externalId, data }, callback?)',
    description:
      'Find a task in a project by an external-id field and update it, or create it when absent.',
    code: "upsertTask('proj_seed01', {\n  externalId: 'name',\n  data: { name: 'Write spec', notes: 'Upserted' }\n});",
    apiRef: 'updateTask',
  },
];
