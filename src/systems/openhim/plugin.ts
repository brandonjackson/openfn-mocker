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

  usage: [
    { fn: "getChannels", signature: "getChannels(channelId?)", description: "Fetch all OpenHIM channel records, or a single channel by id.",
      code: "getChannels();", apiRef: "ex0" },
    { fn: "createChannel", signature: "createChannel(body)", description: "Create a new routing channel in OpenHIM.",
      code: "createChannel({ name: 'FHIR Server Testing', urlPattern: '^/fhir/.*$', methods: ['GET', 'POST'] });" },
    { fn: "getClients", signature: "getClients(clientId?)", description: "Fetch all registered OpenHIM client records, or a single client by id.",
      code: "getClients();", apiRef: "ex1" },
    { fn: "createClient", signature: "createClient(body)", description: "Register a new client record in OpenHIM.",
      code: "createClient({ clientID: 'fhir-server-7', name: 'FHIR Server', roles: ['fhir'] });", apiRef: "ex3" },
    { fn: "getTransactions", signature: "getTransactions(options = {})", description: "Fetch OpenHIM transactions, optionally filtered/paginated or by id.",
      code: "getTransactions({ filterLimit: 5, filterPage: 0 });", apiRef: "ex2" },
    { fn: "getTasks", signature: "getTasks(options)", description: "Fetch all OpenHIM tasks, or a single task by id.",
      code: "getTasks({ filterLimit: 10, filterPage: 0 });" },
    { fn: "createTask", signature: "createTask(body)", description: "Create a new orchestrated task (batch of transaction retries).",
      code: "createTask({ tids: ['5bb777777bbb66cc5d4444ee'], batchSize: 2, paused: true });" },
    { fn: "createEncounter", signature: "createEncounter(encounterData)", description: "Create a CHW encounter record via the sample mediator route.",
      code: "createEncounter({ patientId: '12345', encounterType: 'home-visit' });", apiRef: "ex4" },
    { fn: "http.request", signature: "http.request(method, path, body, options = {})", description: "Make a general-purpose HTTP request with any method to OpenHIM.",
      code: "http.request('GET', '/transactions');", apiRef: "ex2" },
  ],

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
