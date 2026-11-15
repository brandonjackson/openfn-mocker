import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, buildCredential } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';
import { examplePdf } from '../shared/attachments.js';

/**
 * Sunbird RC (Registry & Credentialing). The sunbird-rc adaptor exposes generic
 * REST verbs (get / post / put / del) plus credentialing helpers
 * (issueCredential / getCredential / downloadCredential). Registry records live
 * under /api/v1/<entity> and carry an `osid` (writes answer with the registry's
 * { id, params, responseCode, result } envelope, reads with the record); verifiable credentials are issued
 * at /credentials/issue and identified by a `did:rcw:` id. Auth is optional in
 * the real schema, so the mock accepts unauthenticated requests.
 */

/**
 * The registry's standard response envelope (dev.sunbirdrc.pojos.Response), as
 * returned by create / update / delete and by every error: the payload sits in
 * `result`, and `params.status` says whether the call succeeded.
 */
function envelope(action: 'create' | 'update' | 'delete' | 'read', result: unknown, errmsg = '') {
  const failed = errmsg !== '';
  return {
    id: `sunbird-rc.registry.${action}`,
    ver: '1.0',
    ets: Date.now(),
    params: { resmsgid: '', msgid: randomUUID(), err: '', status: failed ? 'UNSUCCESSFUL' : 'SUCCESSFUL', errmsg },
    responseCode: failed ? 'ERROR' : 'OK',
    result,
  };
}

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
      return envelope('create', { [entity]: { osid } });
    });

    // --- Registry: read a record by osid ---
    app.get('/api/v1/:entity/:id', async (req, reply) => {
      const params = req.params as Record<string, any>;
      const found = store.get(String(params.entity), String(params.id));
      if (!found) {
        reply.code(404);
        return envelope('read', '', `${params.entity} ${params.id} not found`);
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
        return envelope('update', '', `${entity} ${id} not found`);
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const record = { ...body, id: existing.id, osid: id };
      store.replace(entity, id, record);
      return envelope('update', record);
    });

    // --- Registry: delete a record ---
    app.delete('/api/v1/:entity/:id', async (req, reply) => {
      const params = req.params as Record<string, any>;
      const id = String(params.id);
      const deleted = store.destroy(String(params.entity), id);
      if (!deleted) {
        reply.code(404);
        return envelope('delete', '', `${params.entity} ${id} not found`);
      }
      return envelope('delete', '');
    });

    // --- Credentialing: issue a verifiable credential ---
    // Returns 201 with the registry's `credentialResponse` envelope (the signed
    // VC plus its schema id, tags and audit fields), as the issuance API does.
    app.post('/credentials/issue', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = 'did:rcw:' + randomUUID();
      const input = (body.credential ?? {}) as Record<string, any>;
      const issued = buildCredential({
        id,
        credentialSubject: input.credentialSubject ?? {},
        credentialSchemaId: body.credentialSchemaId ?? null,
        tags: body.tags,
      });
      store.create('credentials', id, issued);
      reply.code(201);
      return issued;
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
      // The read returns the verifiable credential itself; the issuance
      // envelope around it (schema id, tags, audit fields) is not repeated.
      return found.credential;
    });
  },

  seed,
};

export default plugin;
