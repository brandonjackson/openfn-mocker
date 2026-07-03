import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { registerCrud } from '../../engine/route-registrar.js';
import { seed, oid } from './seed.js';

/**
 * OpenHIM (health-information-mediator Digital Public Good). The openhim adaptor
 * mediates messages and manages the OpenHIM Core API: channels, clients, tasks
 * and (read-only) transactions, plus a sample `/chw/encounter` route it posts
 * clinical encounters to. Records are Mongo documents keyed by a 24-hex `_id`;
 * list endpoints return bare arrays and creates return 201 with the new doc.
 * Auth is OpenHIM's custom header scheme (accept-all here).
 */

/** Assign a Mongo-style _id to a posted body if it lacks one. */
function makeRecord(body: any): Record<string, any> {
  const base = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  if (!base._id) base._id = oid(randomUUID().replace(/-/g, '')).slice(0, 24);
  return base;
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

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST /chw/encounter — sample mediator route (createEncounter).
    app.post('/chw/encounter', async (req, reply) => {
      const record = makeRecord(req.body);
      record.receivedAt = new Date().toISOString();
      store.create('encounters', String(record._id), record);
      reply.code(201);
      return record;
    });
    app.get('/chw/encounter', async () => store.list('encounters'));

    // channels / clients / tasks — full CRUD keyed by _id, bare-array lists.
    for (const collection of ['channels', 'clients', 'tasks'] as const) {
      registerCrud(app, store, {
        collection,
        basePath: `/${collection}`,
        idParam: 'id',
        idField: '_id',
        makeRecord: (body) => makeRecord(body),
        createStatus: 201,
      });
    }

    // transactions — read-only (list + get).
    registerCrud(app, store, {
      collection: 'transactions',
      basePath: '/transactions',
      idParam: 'id',
      idField: '_id',
      methods: ['list', 'get'],
    });
  },

  seed,
};

export default plugin;
