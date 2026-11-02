import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, id32 } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * OpenBoxes (supply-chain / inventory Digital Public Good). The openboxes
 * adaptor is a generic client (get/post/request) hitting the OpenBoxes REST API
 * under /api. Routes and status codes follow the real Grails app
 * (grails-app/controllers/org/pih/warehouse/UrlMappings.groovy and the *ApiController
 * classes it maps to):
 *  - Cookie login: POST /api/login answers 200 with the plain-text body
 *    "Authentication was successful" and a JSESSIONID cookie, which the adaptor
 *    splits off Set-Cookie and replays on every later request.
 *  - Payloads nest under a `data` key ({ data: [...] } for lists, { data: {...} }
 *    for a single record), except POST /api/products (ProductApiController.save),
 *    which answers { product: {...} }.
 *  - Item routes take GET (read), POST or PUT (update, a merge of the posted
 *    fields), DELETE (204, no body). There is no PATCH anywhere in the API, and
 *    stock movements have no update action at all.
 *  - Creates: products 200, locations 200 (LocationApiController.create sets no
 *    status), stock movements 201 (StockMovementApiController.create).
 *  - Errors render as { errorCode, errorMessage } (ErrorsController).
 *  - Ids are 32-char hex strings.
 */

/** Wrap a payload in OpenBoxes' `{ data }` envelope. */
function wrap(data: any): Record<string, any> {
  return { data };
}

/** OpenBoxes' 404 body (ErrorsController.handleNotFound). */
function notFound(reply: FastifyReply, resource: string, id: string): Record<string, any> {
  reply.code(404);
  return { errorCode: 404, errorMessage: `${resource} with identifier ${id} not found` };
}

/** Assign a 32-hex id to a posted body if it lacks one. */
function makeRecord(body: any): Record<string, any> {
  const base = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  if (!base.id) base.id = id32(Math.random().toString(36).slice(2) + Date.now().toString(36));
  return base;
}

/** Grails-style paging: `max` / `offset` query params over the full list. */
function page(items: any[], req: FastifyRequest): any[] {
  const q = req.query as Record<string, any>;
  const offset = Math.max(0, Number.parseInt(String(q.offset ?? '0'), 10) || 0);
  const max = Number.parseInt(String(q.max ?? ''), 10);
  return Number.isFinite(max) && max >= 0 ? items.slice(offset, offset + max) : items.slice(offset);
}

const idOf = (req: FastifyRequest): string => String((req.params as Record<string, any>).id);

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
    // Every route is registered twice: under /api (where a real deployment
    // serves it, and where the guide examples point) and at the mount root. The
    // root copy exists because the credential's `baseUrl` is the mock's mount
    // path with no `/api` suffix, and the adaptor joins its paths onto baseUrl
    // (POST `/login`, get('products') -> /products); against a real server the
    // same calls land under /api because baseUrl ends in /api.
    const both = (path: string) => [`/api${path}`, path];

    // POST /api/login (ApiController.login): cookie session login. The adaptor
    // reads response.headers["set-cookie"].split(";")[0], so Set-Cookie is
    // mandatory. Any credentials are accepted.
    for (const path of both('/login')) {
      app.post(path, async (_req, reply) => {
        reply.header('set-cookie', 'JSESSIONID=mock_openboxes_session; Path=/; HttpOnly');
        reply.code(200).type('text/html; charset=utf-8');
        return 'Authentication was successful';
      });
    }

    const resources = [
      { collection: 'products', label: 'Product', createStatus: 200, update: true, totalCount: true },
      { collection: 'locations', label: 'Location', createStatus: 200, update: true, totalCount: false },
      { collection: 'stockMovements', label: 'StockMovement', createStatus: 201, update: false, totalCount: true },
    ] as const;

    for (const r of resources) {
      for (const basePath of both(`/${r.collection}`)) {
        const itemPath = `${basePath}/:id`;

        app.get(basePath, async (req) => {
          const all = store.list(r.collection);
          const body = wrap(page(all, req));
          if (r.totalCount) body.totalCount = all.length;
          return body;
        });

        app.post(basePath, async (req, reply) => {
          const record = makeRecord(req.body);
          store.create(r.collection, String(record.id), record);
          reply.code(r.createStatus);
          // ProductApiController.save renders { product }, the others { data }.
          return r.collection === 'products' ? { product: record } : wrap(record);
        });

        app.get(itemPath, async (req, reply) => {
          const id = idOf(req);
          const item = store.get(r.collection, id);
          if (item === undefined) return notFound(reply, r.label, id);
          // StockMovementApiController.read adds the line-item count.
          if (r.collection === 'stockMovements') {
            return { data: item, totalCount: Array.isArray(item.lineItems) ? item.lineItems.length : 0 };
          }
          return wrap(item);
        });

        if (r.update) {
          // POST and PUT both map to `update`, which binds the posted fields
          // onto the existing record.
          const update = async (req: FastifyRequest, reply: FastifyReply) => {
            const id = idOf(req);
            const patch = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? { ...(req.body as object) } : {};
            delete (patch as Record<string, any>).id;
            const updated = store.update(r.collection, id, patch);
            if (updated === undefined) return notFound(reply, r.label, id);
            return wrap(updated);
          };
          app.post(itemPath, update);
          app.put(itemPath, update);
        }

        app.delete(itemPath, async (req, reply) => {
          const id = idOf(req);
          if (!store.destroy(r.collection, id)) return notFound(reply, r.label, id);
          reply.code(204);
          return reply.send();
        });
      }
    }

    // GET /api/stockMovements/:id/stockMovementItems — line items of a movement.
    for (const path of both('/stockMovements/:id/stockMovementItems')) {
      app.get(path, async (req, reply) => {
        const id = idOf(req);
        const movement = store.get('stockMovements', id);
        if (movement === undefined) return notFound(reply, 'StockMovement', id);
        return wrap(Array.isArray(movement.lineItems) ? movement.lineItems : []);
      });
    }
  },

  seed,
};

export default plugin;
