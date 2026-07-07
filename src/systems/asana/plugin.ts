import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Asana API 1.0. The adaptor authenticates with a Bearer personal access token
 * against https://app.asana.com/api/1.0 and works with tasks, stories and
 * searches. Asana wraps every request body and every response in a `{ data: ... }`
 * envelope, so POST/PUT handlers read `(req.body as any).data ?? req.body` and all
 * responses are returned as `{ data: ... }`.
 */

/** Numeric-ish Asana gid (they are long numeric strings; a hex slice is fine here). */
function makeGid(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

/** Asana "not a recognized id" error envelope. */
function notFound(kind: string, gid: string): Record<string, any> {
  return {
    errors: [
      {
        message: `${kind}: Not a recognized ID: ${gid}`,
        help: 'For more information on API status codes and how to handle them, read the docs on errors: https://developers.asana.com/docs/errors',
      },
    ],
  };
}

const plugin: MockSystemPlugin = {
  name: 'asana',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-pat' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'token', role: 'secret', secret: { charset: 'alnum', length: 32, prefix: '1/' } },
      { name: 'workspaceGid', role: 'static', value: '12345' },
    ],
  },
  // The adaptor hardcodes https://app.asana.com (no configurable base URL — the
  // `baseUrl` field above is inert, like mailgun's), so `pnpm test:usage` must
  // alias that host to the mock. See src/systems/types.ts `hostAliases`.
  hostAliases: ['app.asana.com'],

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // GET /api/1.0/tasks — list tasks (getTasks, filtered by ?project= in real API).
    app.get('/api/1.0/tasks', async () => ({ data: store.list('tasks') }));

    // POST /api/1.0/tasks — create a task; body is wrapped in { data: {...} }.
    app.post('/api/1.0/tasks', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const input = (body.data ?? body) as Record<string, any>;
      const gid = makeGid();
      const task = {
        gid,
        resource_type: 'task',
        name: input.name ?? null,
        notes: input.notes ?? '',
        completed: input.completed ?? false,
        projects: input.projects ?? [],
        created_at: nowIso(),
        modified_at: nowIso(),
      };
      store.create('tasks', gid, task);
      reply.code(201);
      return { data: task };
    });

    // GET /api/1.0/tasks/:gid — one task.
    app.get('/api/1.0/tasks/:gid', async (req, reply) => {
      const gid = String((req.params as Record<string, any>).gid);
      const task = store.get('tasks', gid);
      if (!task) {
        reply.code(404);
        return notFound('task', gid);
      }
      return { data: task };
    });

    // PUT /api/1.0/tasks/:gid — update a task; body is wrapped in { data: {...} }.
    app.put('/api/1.0/tasks/:gid', async (req, reply) => {
      const gid = String((req.params as Record<string, any>).gid);
      const body = (req.body ?? {}) as Record<string, any>;
      const patch = (body.data ?? body) as Record<string, any>;
      const updated = store.update('tasks', gid, { ...patch, modified_at: nowIso() });
      if (!updated) {
        reply.code(404);
        return notFound('task', gid);
      }
      return { data: updated };
    });

    // POST /api/1.0/tasks/:gid/stories — add a comment/story to a task.
    app.post('/api/1.0/tasks/:gid/stories', async (req, reply) => {
      const gid = String((req.params as Record<string, any>).gid);
      const body = (req.body ?? {}) as Record<string, any>;
      const input = (body.data ?? body) as Record<string, any>;
      const storyGid = makeGid();
      const story = {
        gid: storyGid,
        resource_type: 'story',
        text: input.text ?? null,
        type: 'comment',
        target: { gid, resource_type: 'task' },
        created_at: nowIso(),
      };
      store.create('stories', storyGid, story);
      reply.code(201);
      return { data: story };
    });

    // GET /api/1.0/workspaces/:wsgid/tasks/search — search tasks (searchTask).
    app.get('/api/1.0/workspaces/:wsgid/tasks/search', async () => ({
      data: store.list('tasks'),
    }));

    // GET /api/1.0/projects/:pgid/tasks — tasks in a project.
    app.get('/api/1.0/projects/:pgid/tasks', async () => ({ data: store.list('tasks') }));
  },

  seed,
};

export default plugin;
