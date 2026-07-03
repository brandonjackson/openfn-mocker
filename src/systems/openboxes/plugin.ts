import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { registerCrud } from '../../engine/route-registrar.js';
import { seed, id32 } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * OpenBoxes (supply-chain / inventory Digital Public Good). The openboxes
 * adaptor is a generic client (get/post/request) hitting the OpenBoxes REST API
 * under /api. Faithful quirks:
 *  - Cookie login: POST /login sets a session cookie (Set-Cookie) that the
 *    adaptor splits off and replays on subsequent requests.
 *  - Every payload nests under a `data` key ({ data: [...] } for lists,
 *    { data: {...} } for single/create).
 *  - Ids are 32-char hex strings.
 */

/** Wrap a payload in OpenBoxes' `{ data }` envelope. */
function wrap(data: any): Record<string, any> {
  return { data };
}

/** Assign a 32-hex id to a posted body if it lacks one. */
function makeRecord(body: any): Record<string, any> {
  const base = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  if (!base.id) base.id = id32(Math.random().toString(36).slice(2) + Date.now().toString(36));
  return base;
}

const plugin: MockSystemPlugin = {
  name: 'openboxes',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST /login — cookie session login. The adaptor joins baseUrl + "/login",
    // then reads response.headers["set-cookie"].split(";")[0] as the session
    // cookie it replays on every later request, so a Set-Cookie header is
    // mandatory (accept any credentials). `/api/login` is kept for parity.
    const login = async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.header('set-cookie', 'JSESSIONID=mock_openboxes_session; Path=/; HttpOnly');
      reply.code(200);
      return wrap({ token: 'mock_openboxes_token', roles: ['ROLE_ADMIN'] });
    };
    app.post('/login', login);
    app.post('/api/login', login);

    // products / locations / stockMovements — CRUD with the { data } envelope.
    // Registered at both the origin root (where the adaptor builds paths from a
    // root-mounted baseUrl: get('products') -> /products) and under /api (the
    // prefix a real deployment carries in baseUrl).
    for (const collection of ['products', 'locations', 'stockMovements'] as const) {
      for (const basePath of [`/${collection}`, `/api/${collection}`]) {
        registerCrud(app, store, {
          collection,
          basePath,
          idParam: 'id',
          idField: 'id',
          makeRecord: (body) => makeRecord(body),
          wrapList: (items) => wrap(items),
          wrapItem: (item) => wrap(item),
          wrapCreate: (item) => wrap(item),
          createStatus: 201,
          notFoundBody: () => ({ errorMessages: ['Not found'] }),
        });
      }
    }

    // GET /stockMovements/:id/stockMovementItems — line items of a movement.
    const stockMovementItems = async (req: FastifyRequest, reply: FastifyReply) => {
      const id = String((req.params as Record<string, any>).id);
      const movement = store.get('stockMovements', id);
      if (movement === undefined) {
        reply.code(404);
        return { errorMessages: ['Not found'] };
      }
      return wrap(Array.isArray(movement.lineItems) ? movement.lineItems : []);
    };
    app.get('/stockMovements/:id/stockMovementItems', stockMovementItems);
    app.get('/api/stockMovements/:id/stockMovementItems', stockMovementItems);
  },

  seed,
};

export default plugin;
