import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, oid } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * OpenHIM (health-information-mediator Digital Public Good). The openhim adaptor
 * mediates messages and manages the OpenHIM Core API: channels, clients, tasks
 * and (read-only) transactions, plus a sample `/chw/encounter` route it posts
 * clinical encounters to. Records are Mongo documents keyed by a 24-hex `_id`.
 *
 * Responses follow OpenHIM core (jembi/openhim-core-js, src/api/*.js): list and
 * read routes return JSON (bare arrays for lists), while create, update and
 * delete return a short text/plain confirmation ("Client successfully
 * created", 201) rather than the stored document, and a missing id is a 404
 * with a text message. Updates are PUT merges (Mongo findByIdAndUpdate); core
 * registers no PATCH routes. Auth is Basic (accept-all here).
 */

/** Assign a Mongo-style _id to a posted body if it lacks one. */
function makeRecord(body: any): Record<string, any> {
  const base = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  if (!base._id) base._id = oid(randomUUID().replace(/-/g, '')).slice(0, 24);
  return base;
}

/** Send a text/plain body, as Koa does for a string `ctx.body`. */
function text(reply: FastifyReply, status: number, message: string): string {
  reply.code(status).type('text/plain; charset=utf-8');
  return message;
}

/** The authenticated user's email, from the Basic auth header (core uses ctx.authenticated.email). */
function userEmail(req: FastifyRequest): string {
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Basic ')) {
    const user = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':')[0];
    if (user) return user;
  }
  return 'root@openhim.org';
}

/** Body of a PUT, minus its _id (core never moves a doc to a new id). */
function updateBody(body: any): Record<string, any> {
  const patch = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  delete patch._id;
  return patch;
}

interface Resource {
  collection: string;
  base: string;
  notFound(id: string): string;
  created(record: any, req: FastifyRequest): string;
  updated(id: string): string;
  deleted(id: string): string;
  /** Turn a POST body into the stored doc (default: the body plus an _id). */
  build?(body: any, req: FastifyRequest): Record<string, any>;
  /** Shape list items (core's task list projects out `transactions`). */
  listItem?(item: any): any;
}

/** GET list/item, POST, PUT and DELETE for one OpenHIM core resource. */
function registerResource(app: FastifyInstance, store: DataStore, r: Resource): void {
  const idOf = (req: FastifyRequest) => String((req.params as Record<string, string>).id);

  app.get(r.base, async () => {
    const items = store.list(r.collection);
    return r.listItem ? items.map(r.listItem) : items;
  });

  app.get(`${r.base}/:id`, async (req, reply) => {
    const id = idOf(req);
    const item = store.get(r.collection, id);
    return item === undefined ? text(reply, 404, r.notFound(id)) : item;
  });

  app.post(r.base, async (req, reply) => {
    const record = r.build ? r.build(req.body, req) : makeRecord(req.body);
    store.create(r.collection, String(record._id), record);
    return text(reply, 201, r.created(record, req));
  });

  app.put(`${r.base}/:id`, async (req, reply) => {
    const id = idOf(req);
    if (store.update(r.collection, id, updateBody(req.body)) === undefined) {
      return text(reply, 404, r.notFound(id));
    }
    return text(reply, 200, r.updated(id));
  });

  app.delete(`${r.base}/:id`, async (req, reply) => {
    const id = idOf(req);
    if (!store.destroy(r.collection, id)) return text(reply, 404, r.notFound(id));
    return text(reply, 200, r.deleted(id));
  });
}

/** A rerun task doc built from a TaskCreateRequest ({ tids, batchSize?, paused? }), as core's addTask does. */
function buildTask(body: any, req: FastifyRequest): Record<string, any> {
  const tids: string[] = Array.isArray(body?.tids) ? body.tids.map(String) : [];
  return {
    _id: makeRecord({})._id,
    status: body?.paused ? 'Paused' : 'Queued',
    transactions: tids.map((tid) => ({ tid, tstatus: 'Queued' })),
    created: new Date().toISOString(),
    user: userEmail(req),
    remainingTransactions: tids.length,
    totalTransactions: tids.length,
    batchSize: typeof body?.batchSize === 'number' ? body.batchSize : 1,
  };
}

const plugin: MockSystemPlugin = {
  name: 'openhim',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'apiUrl', role: 'url' },
      { name: 'username', role: 'email', value: 'root@openhim.org' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST /chw/encounter — sample mediator route (createEncounter). Its body is
    // whatever the mediator behind the channel returns; this one echoes the
    // stored encounter.
    app.post('/chw/encounter', async (req, reply) => {
      const record = makeRecord(req.body);
      record.receivedAt = new Date().toISOString();
      store.create('encounters', String(record._id), record);
      reply.code(201);
      return record;
    });

    // Messages are core's own (src/api/channels.js, clients.js, tasks.js).
    registerResource(app, store, {
      collection: 'channels',
      base: '/channels',
      notFound: (id) => `We could not find a channel with Id:'${id}'.`,
      created: () => 'Channel successfully created',
      updated: () => 'The channel was successfully updated',
      deleted: () => 'The channel was successfully deleted',
    });
    registerResource(app, store, {
      collection: 'clients',
      base: '/clients',
      notFound: (id) => `Client with id ${id} could not be found.`,
      created: () => 'Client successfully created',
      updated: () => 'Successfully updated client.',
      deleted: (id) => `Successfully removed client with ID ${id}`,
    });
    registerResource(app, store, {
      collection: 'tasks',
      base: '/tasks',
      notFound: (id) => `We could not find a Task with this ID: ${id}.`,
      created: (task, req) => `User ${userEmail(req)} created task with id ${task._id}`,
      updated: () => 'The Task was successfully updated',
      deleted: () => 'The Task was successfully deleted',
      build: buildTask,
      listItem: ({ transactions: _transactions, ...rest }) => rest,
    });

    // transactions — read-only here (list + get).
    app.get('/transactions', async () => store.list('transactions'));
    app.get('/transactions/:id', async (req, reply) => {
      const id = String((req.params as Record<string, string>).id);
      const item = store.get('transactions', id);
      return item === undefined ? text(reply, 404, `Could not find transaction with ID: ${id}`) : item;
    });
  },

  seed,
};

export default plugin;
