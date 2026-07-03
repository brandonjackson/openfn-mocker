import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * DIVOC — Digital Infrastructure for Vaccination & Open Certification (a Digital
 * Public Good for issuing digital vaccination certificates).
 *
 * The divoc adaptor authenticates with a Bearer `access_token` that must already
 * be present in the credential — its `configureAuth` throws "Invalid authorization
 * credentials. Include an access token" when it is missing, and it never performs
 * a login itself. So the credential is `baseUrl` + `access_token`. Its only
 * business call is certifyVaccination -> POST /v1/certify (path joined onto
 * `baseUrl`). DIVOC issues that token via its bundled Keycloak, so we also expose
 * the standard Keycloak OIDC token endpoint as a realistic convenience (the
 * adaptor does not call it). Auth is accept-all here (token value is not validated).
 */

/** Mint a realistic-looking opaque token (value is never validated). */
function mintToken(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
}

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
    // --- Keycloak OIDC token endpoint (username/password -> access_token) ---
    // DIVOC ships with Keycloak (realm "divoc"); the adaptor then sends the
    // returned token as `Authorization: Bearer <access_token>`. Accepts either a
    // form-urlencoded password grant or a JSON body.
    app.post('/auth/realms/divoc/protocol/openid-connect/token', async (_req, reply) => {
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
    // DIVOC accepts one certification request or an array of them and processes
    // them asynchronously, so it answers 200 (not 201) with no body of note. We
    // store each certificate with a generated certificateId so the sandbox reads
    // below can echo them back.
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

    // --- Convenience reads (not adaptor functions; power the sandbox) ---
    app.get('/v1/certificates', async () => store.list('certificates'));
    app.get('/v1/certificate/:certificateId', async (req, reply) => {
      const id = String((req.params as Record<string, any>).certificateId);
      const found = store.get('certificates', id);
      if (!found) {
        reply.code(404);
        return { error: 'Certificate not found' };
      }
      return found;
    });
  },

  seed,
};

export default plugin;
