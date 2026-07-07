import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';
import { examplePdf } from '../shared/attachments.js';

/**
 * Sunbird RC (Registry & Credentialing). The sunbird-rc adaptor exposes generic
 * REST verbs (get / post / put / del) plus credentialing helpers
 * (issueCredential / getCredential / downloadCredential). Registry records live
 * under /api/v1/<entity> and carry an `osid`; verifiable credentials are issued
 * at /credentials/issue and identified by a `did:rcw:` id. Auth is optional in
 * the real schema, so the mock accepts unauthenticated requests.
 */

const plugin: MockSystemPlugin = {
  name: 'sunbird-rc',
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'token', role: 'secret', secret: { charset: 'hex', length: 40 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Registry: create a record under an entity collection ---
    app.post('/api/v1/:entity', async (req, reply) => {
      const entity = String((req.params as Record<string, any>).entity);
      const body = (req.body ?? {}) as Record<string, any>;
      const osid = randomUUID();
      const record = {
        id: randomUUID(),
        ...body,
        osid,
      };
      store.create(entity, osid, record);
      reply.code(200);
      return record;
    });

    // --- Registry: read a record by osid ---
    app.get('/api/v1/:entity/:id', async (req, reply) => {
      const params = req.params as Record<string, any>;
      const found = store.get(String(params.entity), String(params.id));
      if (!found) {
        reply.code(404);
        return { error: 'not_found' };
      }
      return found;
    });

    // --- Registry: replace a record ---
    app.put('/api/v1/:entity/:id', async (req, reply) => {
      const params = req.params as Record<string, any>;
      const entity = String(params.entity);
      const id = String(params.id);
      const existing = store.get(entity, id);
      if (!existing) {
        reply.code(404);
        return { error: 'not_found' };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const record = { ...body, id: existing.id, osid: id };
      store.replace(entity, id, record);
      return record;
    });

    // --- Registry: delete a record ---
    app.delete('/api/v1/:entity/:id', async (req, reply) => {
      const params = req.params as Record<string, any>;
      const id = String(params.id);
      const deleted = store.destroy(String(params.entity), id);
      if (!deleted) {
        reply.code(404);
        return { error: 'not_found' };
      }
      return { deleted: [id] };
    });

    // --- Credentialing: issue a verifiable credential ---
    app.post('/credentials/issue', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = 'did:rcw:' + randomUUID();
      const credential = {
        id,
        credential: body.credential ?? {},
        credentialSchemaId: body.credentialSchemaId ?? null,
        createdAt: nowIso(),
      };
      store.create('credentials', id, credential);
      return credential;
    });

    // --- Credentialing: read a credential by id ---
    // getCredential reads the JSON; downloadCredential requests the same path
    // with `Accept: application/pdf` (and parseAs base64) to get a rendered PDF —
    // so we content-negotiate and return the shared dummy PDF for that Accept.
    app.get('/credentials/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('credentials', id);
      if (!found) {
        reply.code(404);
        return { error: 'not_found' };
      }
      const accept = String((req.headers as Record<string, any>).accept ?? '');
      if (accept.includes('application/pdf')) {
        reply.type('application/pdf');
        return reply.send(examplePdf.bytes());
      }
      return found;
    });
  },

  seed,
};

export default plugin;
