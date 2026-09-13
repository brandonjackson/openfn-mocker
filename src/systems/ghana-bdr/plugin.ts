import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, toBirthRecord } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Ghana BDR (Births & Deaths Registry), as engaged by
 * `@openfn/language-ghana-bdr@1.0.1`.
 *
 * The adaptor exposes `get(path, query)`, `post(path, data)`,
 * `request(method, path, body, options)` and `createBirthRecord(data)`, and
 * wraps every one of them in a token exchange:
 *
 *   1. POST /api/v1/UserManagementService/integrations/auth/token with a
 *      `Token: <configuration.token>` header, reading
 *      `{ api_data: { access_token, expires_in } }` off the response — it
 *      throws if `access_token` is missing or `expires_in` is not a number;
 *   2. the real call, with `Authorization: Bearer <access_token>`. A 401 is
 *      retried once against a freshly exchanged token.
 *
 * `createBirthRecord` posts to
 * /api/v1/UserManagementService/integrations/registrations/birth. The generic
 * get/post/request take any path.
 *
 * RESPONSE SHAPE. The `api_data` envelope is pinned by the adaptor for the
 * token exchange only. For the birth record itself the adaptor is agnostic (it
 * hands the parsed body straight to `composeNextState`), so this mock returns
 * the bare record documented by openfn-api-specs'
 * `ghana-bdr/BirthNotificationResponse` rather than inventing an envelope
 * around it. Note that spec was captured against the adaptor's previous API
 * (POST /api/notification on tracker.chimgh.org, double-encoded JSON on the
 * wire, username/password in the body); 1.0.1 replaced all of that, so the
 * record *shape* is the only part of it still in force here.
 */

const TOKEN_PATH = '/api/v1/UserManagementService/integrations/auth/token';
const BIRTH_PATH = '/api/v1/UserManagementService/integrations/registrations/birth';

/** Seconds an issued access token stays valid (the adaptor caches against this). */
const TOKEN_TTL_SECONDS = 3600;

const plugin: MockSystemPlugin = {
  name: 'ghana-bdr',
  // Every call carries `Authorization: Bearer <access_token>` except the token
  // exchange itself, which authenticates with a `Token:` header the generic
  // parser doesn't recognise — hence the exemption.
  auth: { required: true, schemes: ['bearer'], exemptPaths: [TOKEN_PATH] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-access-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      // The long-lived API consumer token, traded for a short-lived access
      // token. Required by the adaptor's configuration-schema.json alongside
      // baseUrl; it throws "Missing configuration.token" without it.
      { name: 'token', role: 'secret', secret: { charset: 'alnum', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST .../auth/token — trade the long-lived `Token` header for a
    // short-lived access token. Auth-exempt (see plugin.auth.exemptPaths), so
    // the header is presence-checked here instead; the value is never validated.
    app.post(TOKEN_PATH, async (req, reply) => {
      const token = req.headers.token;
      if (!token) {
        reply.code(401);
        return { message: 'Missing Token header', messagecode: '401', issuccessful: false };
      }
      return {
        api_data: {
          access_token: `mock-access-${randomUUID().replace(/-/g, '')}`,
          expires_in: TOKEN_TTL_SECONDS,
        },
      };
    });

    // POST .../registrations/birth — createBirthRecord (and a generic post to
    // the same path): register a birth and mint a certificate number.
    app.post(BIRTH_PATH, async (req, reply) => {
      const record = toBirthRecord((req.body ?? {}) as Record<string, any>, {
        certificateNumber: `${String(randomInt(0, 1_000_000)).padStart(6, '0')}-${String(
          randomInt(0, 100)
        ).padStart(2, '0')}-2024`,
        referenceId: `${randomUUID().slice(0, 8)}-${randomInt(1000, 9999)}`,
      });
      store.create('birthRecords', record.reference_id, record);
      reply.code(200);
      return record;
    });

    // GET .../registrations/birth — list registered births, optionally narrowed
    // by ?registry_code (what `get(path, query)` sends).
    app.get(BIRTH_PATH, async (req) => {
      const { registry_code: registryCode } = req.query as Record<string, any>;
      const records = store
        .list('birthRecords')
        .filter((r) => !registryCode || r.registry_code === String(registryCode));
      return { count: records.length, records };
    });

    // GET .../registrations/birth/:referenceId — one registered birth.
    app.get(`${BIRTH_PATH}/:referenceId`, async (req, reply) => {
      const referenceId = String((req.params as Record<string, any>).referenceId);
      const record = store.get('birthRecords', referenceId);
      if (!record) {
        reply.code(404);
        return {
          message: `No record found for reference_id : ${referenceId}`,
          messagecode: '404',
          issuccessful: false,
        };
      }
      return record;
    });
  },

  seed,
};

export default plugin;
