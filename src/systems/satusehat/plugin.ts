import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { registerFhirRoutes, makeMeta } from '../shared/fhir.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * SATUSEHAT — Indonesia's national health-data platform (FHIR R4). The satusehat
 * adaptor first exchanges its OAuth2 client credentials for a bearer token at
 * POST /oauth2/v1/accesstoken?grant_type=client_credentials (client_id/secret
 * sent as form-urlencoded, reads response.access_token), then makes FHIR calls
 * under /fhir-r4/v1/<Resource>. get/post/put reuse the shared FHIR registrar;
 * patch applies a JSON-Patch body sent as application/json-patch+json.
 */
const API_SEG = '/fhir-r4/v1';

/**
 * Apply a minimal RFC-6902 JSON-Patch (add / replace / remove). Paths are
 * resolved as slash-separated object keys ("/active", "/name/0/text"); enough
 * for the shallow partial updates the adaptor's patch() sends.
 */
function applyJsonPatch(resource: Record<string, any>, ops: any[]): Record<string, any> {
  const out = JSON.parse(JSON.stringify(resource ?? {}));
  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op || typeof op.path !== 'string') continue;
    const keys = op.path.split('/').filter(Boolean);
    if (keys.length === 0) continue;
    let target: any = out;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (typeof target[k] !== 'object' || target[k] === null) target[k] = {};
      target = target[k];
    }
    const leaf = keys[keys.length - 1];
    if (op.op === 'remove') delete target[leaf];
    else target[leaf] = op.value; // add / replace
  }
  return out;
}

const plugin: MockSystemPlugin = {
  name: 'satusehat',
  credential: {
    type: 'oauth',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'clientId', role: 'secret', secret: { charset: 'alnum', length: 24 } },
      { name: 'clientSecret', role: 'secret', secret: { charset: 'alnum', length: 32 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    // FHIR R4 CRUD + search under /fhir-r4/v1 (covers get / post / put).
    registerFhirRoutes(app, store, {
      apiSeg: API_SEG,
      resourceTypes: ['Patient', 'Organization', 'Practitioner', 'Encounter', 'Observation', 'Location'],
      softwareName: 'SATUSEHAT FHIR R4',
      port: config.port,
    });

    // OAuth2 client-credentials handshake. The adaptor POSTs client_id/client_secret
    // as form-urlencoded with ?grant_type=client_credentials and reads access_token.
    app.post('/oauth2/v1/accesstoken', async (_req, reply) => {
      reply.code(200);
      return {
        access_token: 'mock-satusehat-token',
        token_type: 'BearerToken',
        expires_in: '3599',
        scope: 'read write',
        issued_at: String(Date.now()),
      };
    });

    // patch() sends a JSON-Patch body as application/json-patch+json, which
    // Fastify does not parse by default — register a parser, then the route.
    try {
      app.addContentTypeParser(
        'application/json-patch+json',
        { parseAs: 'string' },
        (_req: unknown, body: string, done: (err: Error | null, body?: any) => void) => {
          try {
            done(null, body && body.length ? JSON.parse(body) : []);
          } catch (e) {
            done(e as Error);
          }
        }
      );
    } catch {
      /* already registered on this instance; ignore */
    }

    app.patch(`${API_SEG}/:resourceType/:id`, async (req, reply) => {
      const { resourceType, id } = req.params as Record<string, any>;
      const existing = store.get(resourceType, id);
      if (existing === undefined) {
        reply.code(404);
        return {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'not-found', diagnostics: `Resource ${resourceType}/${id} not found` }],
        };
      }
      const version = String((parseInt(existing?.meta?.versionId ?? '1', 10) || 1) + 1);
      const updated = {
        ...applyJsonPatch(existing, req.body as any[]),
        resourceType,
        id,
        meta: makeMeta(version),
      };
      store.replace(resourceType, id, updated);
      reply.code(200);
      return updated;
    });
  },

  seed,
};

export default plugin;
