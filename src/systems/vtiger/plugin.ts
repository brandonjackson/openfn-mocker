import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, MODULE_IDS } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Vtiger CRM — a single REST entry point at /webservice.php. The vtiger adaptor's
 * `execute` runs `challenge` then `login` before every operation:
 *   GET  /webservice.php?operation=getchallenge&username=<u>  -> { result: { token } }
 *   POST /webservice.php  form { operation: 'login', username, accessKey }
 *        -> { result: { sessionName, sessionId, userId } }
 * then listTypes / postElement (create|update|delete) as form POSTs carrying the
 * sessionName. Reads (retrieve, query, describe, listtypes) also accept GET. Every
 * response uses Vtiger's `{ success, result }` envelope. Records are keyed by their
 * `<moduleId>x<n>` webservice id. Auth (accessToken via a getchallenge/md5 login)
 * is accept-all here — any challenge/session values are handed back.
 */

const WS = '/webservice.php';

/** Vtiger success envelope. */
function ok(result: any): Record<string, any> {
  return { success: true, result };
}

/** Vtiger error envelope. */
function err(code: string, message: string): Record<string, any> {
  return { success: false, error: { code, message } };
}

/** Next webservice id for a module, e.g. "12x3" for the 3rd Contacts record. */
function nextId(store: DataStore, module: string): string {
  const typeId = MODULE_IDS[module] ?? 1;
  const nums = store
    .list(module)
    .map((r) => Number(String(r.id).split('x')[1]))
    .filter(Number.isFinite);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${typeId}x${next}`;
}

/** Parse the `element` form field (Vtiger sends it as a JSON string). */
function parseElement(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Dispatch a Vtiger operation against the store. `params` is the merged query +
 * form body; `operation` is matched case-insensitively so both the adaptor's
 * `listTypes` and Vtiger's `listtypes` spelling resolve.
 */
function dispatch(store: DataStore, params: Record<string, any>): { code: number; body: any } {
  const operation = String(params.operation ?? '').toLowerCase();
  switch (operation) {
    case 'getchallenge':
      return {
        code: 200,
        body: ok({
          token: 'mock-challenge-token',
          serverTime: Math.floor(Date.now() / 1000),
          expireTime: Math.floor(Date.now() / 1000) + 300,
        }),
      };
    case 'login':
      return {
        code: 200,
        body: ok({
          sessionName: 'mock-session-' + Math.random().toString(36).slice(2, 10),
          sessionId: 'mock-session-id',
          userId: '19x1',
          version: '0.22',
          vtigerVersion: '7.5.0',
        }),
      };
    case 'listtypes':
      return {
        code: 200,
        body: ok({
          types: Object.keys(MODULE_IDS),
          information: Object.fromEntries(
            Object.keys(MODULE_IDS).map((t) => [t, { isEntity: true, label: t, singular: t.replace(/s$/, '') }])
          ),
        }),
      };
    case 'describe': {
      const type = String(params.elementType ?? '');
      return {
        code: 200,
        body: ok({
          label: type,
          name: type,
          createable: true,
          updateable: true,
          deleteable: true,
          retrieveable: true,
          fields: [
            { name: 'id', label: 'ID', type: { name: 'string' } },
            { name: 'assigned_user_id', label: 'Assigned To', type: { name: 'owner' } },
          ],
        }),
      };
    }
    case 'retrieve': {
      const id = String(params.id ?? '');
      const module = id.split('x')[0];
      const modName = Object.keys(MODULE_IDS).find((m) => String(MODULE_IDS[m]) === module);
      const record = modName ? store.get(modName, id) : undefined;
      if (!record) return { code: 200, body: err('RECORD_NOT_FOUND', `Record ${id} not found`) };
      return { code: 200, body: ok(record) };
    }
    case 'query': {
      // Minimal SQL-ish support: `select ... from <Module> ...;`
      const q = String(params.query ?? '');
      const match = /from\s+([A-Za-z]+)/i.exec(q);
      const module = match?.[1];
      if (!module || !(module in MODULE_IDS)) {
        return { code: 200, body: ok([]) };
      }
      return { code: 200, body: ok(store.list(module)) };
    }
    case 'create': {
      const module = String(params.elementType ?? '');
      const element = parseElement(params.element);
      const id = nextId(store, module);
      const record = { ...element, id };
      store.create(module, id, record);
      return { code: 200, body: ok(record) };
    }
    case 'update': {
      const element = parseElement(params.element);
      const id = String(element.id ?? params.id ?? '');
      const module =
        String(params.elementType ?? '') ||
        (Object.keys(MODULE_IDS).find((m) => String(MODULE_IDS[m]) === id.split('x')[0]) ?? '');
      const existing = module ? store.get(module, id) : undefined;
      if (!existing) return { code: 200, body: err('RECORD_NOT_FOUND', `Record ${id} not found`) };
      const merged = store.update(module, id, element);
      return { code: 200, body: ok(merged) };
    }
    case 'delete': {
      const element = parseElement(params.element);
      const id = String(params.id ?? element.id ?? '');
      const module = Object.keys(MODULE_IDS).find((m) => String(MODULE_IDS[m]) === id.split('x')[0]);
      if (module) store.destroy(module, id);
      return { code: 200, body: ok({ status: 'successful' }) };
    }
    default:
      return { code: 200, body: err('INVALID_OPERATION', `Unknown operation: ${params.operation}`) };
  }
}

const plugin: MockSystemPlugin = {
  name: 'vtiger',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'hostUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'accessToken', role: 'secret', secret: { charset: 'alnum', length: 20 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // Reads (getchallenge, retrieve, query, describe, listtypes) come in as GET.
    app.get(WS, async (req: FastifyRequest, reply: FastifyReply) => {
      const { code, body } = dispatch(store, (req.query ?? {}) as Record<string, any>);
      reply.code(code);
      return body;
    });

    // Writes (login, create, update, delete) come in as form-encoded POSTs; merge
    // the form body with any query params so either transport works.
    app.post(WS, async (req: FastifyRequest, reply: FastifyReply) => {
      const params = { ...(req.query as object), ...(req.body as object) } as Record<string, any>;
      const { code, body } = dispatch(store, params);
      reply.code(code);
      return body;
    });
  },

  seed,
};

export default plugin;
