import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * DAGU, Ethiopia's facility pharmacy management / dispensing tool (EPSS, JSI),
 * as engaged by `@openfn/language-dagu@1.3.x`. Not dagu-org's workflow engine,
 * which shares the name.
 *
 * The adaptor exposes only `get(path, options)`, `post(path, body, options)`
 * and `request(method, path, body, options)` against `configuration.baseUrl`.
 * Before its first call it logs in:
 *
 *   1. POST /account/login with JSON `{ username, password }`, reading
 *      `body.token.access_token` (cached for the life of the process);
 *   2. every call then carries `Authorization: Bearer <access_token>` and a
 *      JSON body, or a multipart/form-data body when `options.contentType` is
 *      'form' (nested objects are JSON-stringified into the form field).
 *
 * Paths are relative in job code ('DispensingUnit/...'); the adaptor joins
 * them onto baseUrl. The routes below are the login endpoint plus the four
 * paths the adaptor's examples and tests use, which is all the openfn-api-specs
 * `dagu` spec models (DAGU publishes no API reference). Every response uses
 * DAGU's `{ result, message, model }` envelope; the two history endpoints are
 * DataTables server-side paging (`start` / `length` / `draw` in,
 * `recordsTotal` / `recordsFiltered` / `data` out).
 */

/** DAGU's response envelope. `result` 0 is what the vendor's examples show for success. */
const envelope = (model: unknown, message: string | null = 'Success', result = 0) => ({ result, message, model });

/** Coerce a multipart field value back to what the adaptor encoded (numbers, JSON objects). */
function coerceFormValue(value: string): unknown {
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^\s*[{[]/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/** Minimal multipart/form-data field parser (text fields only; the adaptor sends no files here). */
export function parseMultipartFields(body: string, contentType: string): Record<string, unknown> {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) return {};
  const boundary = `--${match[1] ?? match[2]}`;
  const fields: Record<string, unknown> = {};
  for (const part of body.split(boundary)) {
    const sep = part.indexOf('\r\n\r\n');
    if (sep === -1) continue;
    const head = part.slice(0, sep);
    const name = /name="([^"]*)"/i.exec(head)?.[1];
    if (!name) continue;
    const value = part.slice(sep + 4).replace(/\r\n$/, '');
    fields[name] = coerceFormValue(value);
  }
  return fields;
}

/** A DataTables server-side page over `rows`, filtered by `search.value` (or a bare string). */
function dataTablesPage(rows: Record<string, unknown>[], req: Record<string, any>) {
  const start = Math.max(0, Number.parseInt(String(req.start ?? 0), 10) || 0);
  const rawLength = Number.parseInt(String(req.length ?? 10), 10);
  const length = Number.isNaN(rawLength) ? 10 : rawLength;
  const draw = Number.parseInt(String(req.draw ?? 1), 10) || 1;
  const term = String(typeof req.search === 'string' ? req.search : (req.search?.value ?? ''))
    .trim()
    .toLowerCase();

  const filtered = term
    ? rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(term)))
    : rows;
  // DataTables convention: length -1 means "all rows".
  const data = length < 0 ? filtered.slice(start) : filtered.slice(start, start + length);
  const additionalParameters =
    req.additionalParameters && typeof req.additionalParameters === 'object' ? req.additionalParameters : {};

  return {
    draw,
    error: null,
    totalRecords: rows.length,
    totalRecordsFiltered: filtered.length,
    data,
    additionalParameters,
    recordsTotal: rows.length,
    recordsFiltered: filtered.length,
    additionalResponse: {},
  };
}

const plugin: MockSystemPlugin = {
  name: 'dagu',
  // Every call carries the Bearer token from the login handshake, which itself
  // authenticates with `{ username, password }` in its body.
  auth: { required: true, schemes: ['bearer'], exemptPaths: ['/account/login'] },
  credential: {
    type: 'userpass',
    authHeader: { scheme: 'bearer', value: 'mock-access-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // The adaptor's `{ contentType: 'form' }` option sends multipart/form-data.
    try {
      app.addContentTypeParser('multipart/form-data', { parseAs: 'string' }, (req, body, done) => {
        done(null, parseMultipartFields(String(body), String(req.headers['content-type'] ?? '')));
      });
    } catch {
      /* already registered */
    }

    // --- Login handshake ---
    // The adaptor reads body.token.access_token and sends it as a Bearer token.
    // Credentials are presence-checked, never validated.
    app.post('/account/login', async (req, reply) => {
      const { username, password } = (req.body ?? {}) as Record<string, unknown>;
      if (!username || !password) {
        reply.code(400);
        return envelope(null, 'Username and password are required.', 1);
      }
      return { token: { access_token: randomUUID().replace(/-/g, '') } };
    });

    // --- Dispensing unit dashboard: items currently stocked out ---
    app.get('/DispensingUnit/Dashboard/StockOutReport', async () => envelope(store.list('stockOuts')));

    // --- Dispensing unit requisition history (DataTables paging) ---
    app.post('/DispensingUnit/Request/History', async (req) =>
      envelope(dataTablesPage(store.list('requests'), (req.body ?? {}) as Record<string, any>))
    );

    // --- Check one prescription row before dispensing ---
    app.post('/Patient/CheckPrescription', async (req, reply) => {
      const { prescriptionRowGuid } = (req.body ?? {}) as Record<string, unknown>;
      if (!prescriptionRowGuid) {
        reply.code(400);
        return envelope(null, 'prescriptionRowGuid is required.', 1);
      }
      const rx = store.get('prescriptions', String(prescriptionRowGuid));
      if (!rx) return envelope(null, `Prescription ${prescriptionRowGuid} not found.`, 1);

      const stockedOut = store.list('stockOuts').some((s) => s.itemName === rx.itemName);
      const remaining = rx.quantityPrescribed - rx.quantityDispensed;
      return envelope({
        ...rx,
        quantityRemaining: remaining,
        isAvailableInStock: !stockedOut,
        canDispense: remaining > 0 && !stockedOut,
      });
    });

    // --- Patient prescription history (DataTables paging; JSON or form body) ---
    app.post('/Patient/Prescription/History', async (req) =>
      envelope(dataTablesPage(store.list('prescriptions'), (req.body ?? {}) as Record<string, any>))
    );
  },

  seed,
};

export default plugin;
