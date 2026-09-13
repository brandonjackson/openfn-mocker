import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * DIVOC — Digital Infrastructure for Vaccination & Open Credentialing (a Digital
 * Public Good for issuing digital vaccination certificates).
 *
 * The divoc adaptor authenticates with a Bearer `access_token` that must already
 * be present in the credential — its `configureAuth` throws "Invalid authorization
 * credentials. Include an access token" when it is missing, and it never performs
 * a login itself. So the credential is `baseUrl` + `access_token`. Its only
 * business call is certifyVaccination -> POST /v1/certify (path joined onto
 * `baseUrl`). Auth is accept-all here (token value is not validated).
 *
 * SURFACE. Every route below is an operation in the vendor's own
 * `interfaces/vaccination-api.yaml` (openfn-api-specs `divoc`, a verbatim
 * conversion of the vendor Swagger): POST /authorize, POST /v1/certify,
 * GET /v1/certificates, DELETE /v1/certificates/{preEnrollmentCode},
 * GET /v1/preEnrollments(/{code}), GET /v1/programs/current, GET /v1/vaccinators,
 * GET /v1/users/me and GET /v1/ping. The ones the adaptor does not call are
 * there so the sandbox can show a realistic vaccination flow — but nothing here
 * is invented: an endpoint the vendor does not document is an endpoint a
 * workflow would fail on in production.
 *
 * Two things deliberately NOT mocked under the API base:
 *   - a certificate-by-id read. The vaccination API has no such operation; a
 *     recipient reads their own certificate from GET /v1/certificates.
 *   - DIVOC's bundled Keycloak. It is a separate service, not part of this API
 *     (the spec's OAuth2 scheme points at `<host>/keycloak/auth/realms/divoc/...`,
 *     outside the `/divoc/api` base path), so the token endpoint is mocked at
 *     exactly that path and is not part of the API surface the sandbox lists.
 */

/** Mint a realistic-looking opaque token (value is never validated). */
function mintToken(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
}

/** Keycloak's token endpoint as the spec's OAuth2 scheme names it (NOT under the API base path). */
const KEYCLOAK_TOKEN_PATH = '/keycloak/auth/realms/divoc/protocol/openid-connect/token';

const plugin: MockSystemPlugin = {
  name: 'divoc',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'access_token', role: 'secret', secret: { charset: 'hex', length: 48 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- POST /authorize — "Establish token" (LoginRequest -> LoginResponse) ---
    // DIVOC's own login: a mobile number plus the 2FA code it was sent, traded
    // for the token the adaptor then sends as `Authorization: Bearer <token>`.
    app.post('/authorize', async (req, reply) => {
      const { mobile } = (req.body ?? {}) as Record<string, any>;
      if (!mobile) {
        reply.code(401);
        return { code: 'UNAUTHORIZED', message: 'mobile is required' };
      }
      return { token: mintToken(), refreshToken: mintToken() };
    });

    // --- Keycloak (bundled, but a separate service — see the note above) ---
    // Accepts either a form-urlencoded password grant or a JSON body.
    app.post(KEYCLOAK_TOKEN_PATH, async (_req, reply) => {
      reply.code(200);
      return {
        access_token: mintToken(),
        expires_in: 300,
        refresh_expires_in: 1800,
        refresh_token: mintToken(),
        token_type: 'Bearer',
        scope: 'openid profile',
      };
    });

    // --- certifyVaccination -> POST /v1/certify ---
    // The vendor types the body as an ARRAY of CertificationRequest, and
    // certification is asynchronous, so it answers 200 (not 201). A bare object
    // is still accepted here because the adaptor posts whatever the job hands it
    // (its own JSDoc example passes a single object) — the sandbox examples use
    // the array the real API documents. Each request is stored with a generated
    // certificateId so the reads below can echo it back.
    app.post('/v1/certify', async (req, reply) => {
      const body = req.body ?? {};
      const items = Array.isArray(body) ? body : [body];
      const issued: string[] = [];
      for (const item of items) {
        const src = (item ?? {}) as Record<string, any>;
        const certificateId = `cert-${randomUUID().slice(0, 8)}`;
        store.create('certificates', certificateId, {
          certificateId,
          preEnrollmentCode: src.preEnrollmentCode ?? null,
          recipient: src.recipient ?? {},
          vaccination: src.vaccination ?? {},
          vaccinator: src.vaccinator ?? {},
          facility: src.facility ?? {},
          createdAt: nowIso(),
        });
        issued.push(certificateId);
      }
      reply.code(200);
      return { status: 'success', count: issued.length, certificateIds: issued };
    });

    // --- GET /v1/certificates — the signed-in recipient's certificate ---
    // Restricted to `hasRole: recipient` upstream and typed as a single object,
    // not a list: it answers "my certificate", not "everyone's". The mock has no
    // signed-in recipient, so it serves the most recently issued certificate.
    app.get('/v1/certificates', async () => {
      const all = store.list('certificates');
      return all.length > 0 ? all[all.length - 1] : {};
    });

    // --- DELETE /v1/certificates/{preEnrollmentCode} — revoke ---
    // `?doses=1,2` revokes those doses, `?allDoses=true` every dose.
    app.delete('/v1/certificates/:preEnrollmentCode', async (req, reply) => {
      const code = String((req.params as Record<string, any>).preEnrollmentCode);
      const { doses, allDoses } = req.query as Record<string, any>;
      const wanted =
        allDoses === 'true' || allDoses === true || doses === undefined
          ? undefined
          : new Set(
              String(doses)
                .split(',')
                .map((d) => Number(d.trim()))
            );
      const matches = store
        .list('certificates')
        .filter(
          (c) => c.preEnrollmentCode === code && (wanted === undefined || wanted.has(Number(c.vaccination?.dose)))
        );
      if (matches.length === 0) {
        reply.code(404);
        return { code: 'CERTIFICATE_NOT_FOUND', message: `No certificate for ${code} and the requested dose(s)` };
      }
      for (const c of matches) store.destroy('certificates', c.certificateId);
      reply.code(200);
      return { code: 'REVOKED', message: `Revoked ${matches.length} certificate(s) for ${code}` };
    });

    // --- Pre-enrollments: who the facility is expecting ---
    app.get('/v1/preEnrollments', async () => store.list('preEnrollments'));
    app.get('/v1/preEnrollments/:preEnrollmentCode', async (req, reply) => {
      const code = String((req.params as Record<string, any>).preEnrollmentCode);
      const found = store.get('preEnrollments', code);
      if (!found) {
        reply.code(404);
        return { code: 'PRE_ENROLLMENT_NOT_FOUND', message: `No pre-enrollment with code ${code}` };
      }
      return found;
    });

    // --- Facility configuration reads ---
    app.get('/v1/programs/current', async () => store.list('programs'));
    app.get('/v1/vaccinators', async () => store.list('vaccinators'));
    app.get('/v1/users/me', async () => ({
      firstName: 'Sandbox',
      lastName: 'Admin',
      mobile: '+250788000000',
      roles: ['facility-admin'],
    }));

    // --- GET /v1/ping — heartbeat, unauthenticated upstream ---
    app.get('/v1/ping', async () => ({ message: 'pong' }));
  },

  seed,
};

export default plugin;
