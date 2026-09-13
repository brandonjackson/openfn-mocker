import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { documentNumber, seed, toBirthRecord, toDeathRecord, withoutStatusFields } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Ghana BDR — HBDRP, the Births & Deaths Registry's third-party integration API
 * (hosted by Npontu), as engaged by `@openfn/language-ghana-bdr@1.0.x`.
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
 * SURFACE. Adaptor 1.0.0 (July 2026) replaced the API wholesale: the old CHIM
 * eTracker endpoint on tracker.chimgh.org, its `registry_code` + nested
 * `child`/`mother`/`father` payload and its double-encoded JSON are all gone.
 * The routes below are exactly the eight operations the vendor's own "HBDRP
 * INTEGRATION" Postman collection documents (openfn-api-specs `ghana-bdr`):
 * token, refresh, birth create / status / update, death create / status, and
 * the utility lookup. There is deliberately NO birth-registration list
 * endpoint — the registry does not publish one, and a workflow that paged
 * `GET .../registrations/birth` against production would get nothing back.
 *
 * SHAPES. Every response is the registry's envelope
 * `{ api_code, api_status, api_message, api_data }`; the record itself is flat
 * (`child_first_name`, `mother_age`, ... — no nesting). Only `status`,
 * `region_id` and `district_id` are enforced at submit time: DRAFT saves the
 * record as-is and COMPLETE moves it on to verification, which is the vendor's
 * own two-mode validation and not a mock convenience.
 */

const BASE = '/api/v1/UserManagementService/integrations';
const TOKEN_PATH = `${BASE}/auth/token`;
const REFRESH_PATH = `${BASE}/auth/refresh`;
const BIRTH_PATH = `${BASE}/registrations/birth`;
const DEATH_PATH = `${BASE}/registrations/death`;
const UTILITY_PATH = `${BASE}/utility`;

/** Seconds an issued access token stays valid (the adaptor caches against this). */
const TOKEN_TTL_SECONDS = 3600;

/** The registry's standard response envelope. */
function envelope(
  apiData: any,
  opts: { code?: number; status?: string; message?: string } = {}
): Record<string, any> {
  return {
    api_code: opts.code ?? 200,
    api_status: opts.status ?? 'success',
    api_message: opts.message ?? 'Your action has been processed.',
    api_data: apiData,
  };
}

/** The same envelope, with `api_data: []` as the registry returns on errors. */
function errorEnvelope(code: number, message: string): Record<string, any> {
  return envelope([], { code, status: 'error', message });
}

const plugin: MockSystemPlugin = {
  name: 'ghana-bdr',
  // Every call carries `Authorization: Bearer <access_token>` except the two
  // auth endpoints: the token exchange authenticates with a `Token:` header the
  // generic parser doesn't recognise, and the refresh endpoint's credential is
  // the refresh token in its body (`security: []` upstream).
  auth: { required: true, schemes: ['bearer'], exemptPaths: [TOKEN_PATH, REFRESH_PATH] },
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
    /** A fresh token pair. */
    const tokenPair = () => ({
      access_token: `mock-access-${randomUUID().replace(/-/g, '')}`,
      refresh_token: `mock-refresh-${randomUUID().replace(/-/g, '')}`,
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_SECONDS,
    });

    /** Next document number for a collection (sequence continues past the seed). */
    const nextDocumentNumber = (kind: 'BIRTH' | 'DEATH', collection: string) =>
      documentNumber(kind, store.count(collection) + 1);

    // POST .../auth/token — trade the long-lived API-consumer token for a
    // short-lived access token. Auth-exempt (see plugin.auth.exemptPaths), so
    // the credential is presence-checked here instead; the value is never
    // validated. The vendor accepts it in the `Token` header or as
    // `Authorization: Bearer`, so both are honoured.
    app.post(TOKEN_PATH, async (req, reply) => {
      const consumerToken = req.headers.token ?? req.headers.authorization;
      if (!consumerToken) {
        reply.code(401);
        return errorEnvelope(401, 'Missing API consumer token');
      }
      return envelope(tokenPair(), { message: 'Token issued successfully' });
    });

    // POST .../auth/refresh — trade a refresh token for a new pair. The refresh
    // token is itself the credential, so no auth header is required.
    app.post(REFRESH_PATH, async (req, reply) => {
      const { refresh_token: refreshToken } = (req.body ?? {}) as Record<string, any>;
      if (!refreshToken) {
        reply.code(422);
        return errorEnvelope(422, 'The refresh token field is required.');
      }
      return envelope(tokenPair(), { message: 'Token issued successfully' });
    });

    /** status, region_id and district_id are enforced in both DRAFT and COMPLETE mode. */
    const missingRequired = (body: Record<string, any>, fields: string[]): string | undefined => {
      const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
      return missing.length > 0 ? `The ${missing.join(', ')} field is required.` : undefined;
    };

    // POST .../registrations/birth — createBirthRecord.
    app.post(BIRTH_PATH, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const invalid = missingRequired(body, ['status', 'region_id', 'district_id']);
      if (invalid) {
        reply.code(422);
        return errorEnvelope(422, invalid);
      }
      const record = toBirthRecord(body, { documentNumber: nextDocumentNumber('BIRTH', 'birthRecords') });
      store.create('birthRecords', record.document_number, record);
      reply.code(200);
      return envelope(withoutStatusFields(record));
    });

    // GET .../registrations/birth/:documentNumber — the record with its process
    // flow and callback history (the poll-for-progress endpoint).
    app.get(`${BIRTH_PATH}/:documentNumber`, async (req, reply) => {
      const docNumber = String((req.params as Record<string, any>).documentNumber);
      const record = store.get('birthRecords', docNumber);
      if (!record) {
        reply.code(404);
        return errorEnvelope(404, `No record found for document number ${docNumber}`);
      }
      return envelope(record);
    });

    // POST .../registrations/birth/:documentNumber — updateBirthRecord. Same
    // payload as create; submitting it COMPLETE moves the record to verification.
    app.post(`${BIRTH_PATH}/:documentNumber`, async (req, reply) => {
      const docNumber = String((req.params as Record<string, any>).documentNumber);
      const existing = store.get('birthRecords', docNumber);
      if (!existing) {
        reply.code(404);
        return errorEnvelope(404, `No record found for document number ${docNumber}`);
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const invalid = missingRequired(body, ['status', 'region_id', 'district_id']);
      if (invalid) {
        reply.code(422);
        return errorEnvelope(422, invalid);
      }
      const updated = toBirthRecord(body, {
        documentNumber: docNumber,
        registryId: existing.registry_id,
      });
      updated.created_at = existing.created_at;
      store.replace('birthRecords', docNumber, updated);
      reply.code(200);
      return envelope(withoutStatusFields(updated));
    });

    // POST .../registrations/death — createDeathRecord. (The vendor's sample
    // institution is authorised for birth services only, so its saved examples
    // are 403s; a mock that cannot register a death would be useless, so this
    // answers as an institution that *is* authorised.)
    app.post(DEATH_PATH, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const invalid = missingRequired(body, ['region_id', 'district_id', 'deceased_date_of_death']);
      if (invalid) {
        reply.code(422);
        return errorEnvelope(422, invalid);
      }
      const record = toDeathRecord(body, { documentNumber: nextDocumentNumber('DEATH', 'deathRecords') });
      store.create('deathRecords', record.document_number, record);
      reply.code(200);
      return envelope(withoutStatusFields(record));
    });

    // GET .../registrations/death/:documentNumber — death record status lookup.
    app.get(`${DEATH_PATH}/:documentNumber`, async (req, reply) => {
      const docNumber = String((req.params as Record<string, any>).documentNumber);
      const record = store.get('deathRecords', docNumber);
      if (!record) {
        reply.code(404);
        return errorEnvelope(404, `No record found for document number ${docNumber}`);
      }
      return envelope(record);
    });

    // POST .../utility — the coded-value lookups every *_id and coded name field
    // must be filled from. Location lists are narrowed by their parent id.
    app.post(UTILITY_PATH, async (req, reply) => {
      const {
        utility_type: utilityType,
        country_id: countryId,
        region_id: regionId,
        district_id: districtId,
      } = (req.body ?? {}) as Record<string, any>;
      if (!utilityType) {
        reply.code(422);
        return errorEnvelope(422, 'The utility type field is required.');
      }
      const entry = store.get('utilities', String(utilityType).toUpperCase());
      if (!entry) {
        reply.code(422);
        return errorEnvelope(422, `The selected utility type ${utilityType} is invalid.`);
      }
      const narrow = (rows: any[]): any[] => {
        if (countryId !== undefined) return rows.filter((r) => r.country_id === Number(countryId));
        if (regionId !== undefined) return rows.filter((r) => r.region_id === Number(regionId));
        if (districtId !== undefined) return rows.filter((r) => r.district_id === Number(districtId));
        return rows;
      };
      return envelope(narrow(entry.values));
    });
  },

  seed,
};

export default plugin;
