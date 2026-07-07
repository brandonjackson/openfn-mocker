import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, makeSfId } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Salesforce, as reached by the jsforce-backed `@openfn/language-salesforce`
 * adaptor. The adaptor first performs a SOAP username/password login (deriving
 * the session id + instance URL from the XML response), then talks to the REST
 * Data API (`/services/data/vXX.X/...`). This mock models both:
 *  - the SOAP login handshake (returns XML)
 *  - the REST sObject CRUD routes (create/retrieve/update/delete/describe)
 *  - the SOQL `query` endpoint (parses the sObject name out of the `?q=` SOQL)
 * Auth is accept-all: the login handshake happens before a session id exists,
 * so gating it would just block the adaptor.
 */

const plugin: MockSystemPlugin = {
  name: 'salesforce',
  auth: { required: false },
  credential: {
    type: 'userpass',
    authHeader: { scheme: 'bearer', value: 'mock-session-id' },
    fields: [
      { name: 'loginUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'user@example.com' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
      { name: 'securityToken', role: 'secret', secret: { charset: 'alnum', length: 24 } },
      { name: 'apiVersion', role: 'static', value: '50.0' },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- SOAP login (jsforce) ---------------------------------------------
    // jsforce POSTs a SOAP login envelope here and reads sessionId + serverUrl
    // from the XML reply (it derives the instance URL from the serverUrl host,
    // ignoring the path, so the mount prefix is harmless).
    app.post('/services/Soap/u/:version', async (req, reply) => {
      const params = req.params as Record<string, any>;
      const version = String(params.version);
      const origin = `${req.protocol}://${req.headers.host}`;
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="urn:partner.soap.sforce.com">
  <soapenv:Body>
    <loginResponse>
      <result>
        <metadataServerUrl>${origin}/services/Soap/m/${version}</metadataServerUrl>
        <passwordExpired>false</passwordExpired>
        <sandbox>false</sandbox>
        <serverUrl>${origin}/services/Soap/u/${version}</serverUrl>
        <sessionId>mock-session-id</sessionId>
        <userId>005000000000001AAA</userId>
        <userInfo><organizationId>00D000000000001EAA</organizationId><userEmail>user@example.com</userEmail></userInfo>
      </result>
    </loginResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
      reply.header('content-type', 'text/xml');
      return xml;
    });

    // --- OAuth2 token exchange (alternative to the SOAP login) ------------
    app.post('/services/oauth2/token', async (req) => {
      const origin = `${req.protocol}://${req.headers.host}`;
      return {
        access_token: 'mock-session-id',
        instance_url: origin,
        token_type: 'Bearer',
        issued_at: String(Date.now()),
        id: `${origin}/id/00D000000000001EAA/005000000000001AAA`,
        signature: 'mock-signature',
      };
    });

    // --- REST Data API ----------------------------------------------------
    // describe MUST be registered before the /:id route so the literal
    // `describe` segment is not captured as a record id.
    app.get('/services/data/:ver/sobjects/:type/describe', async (req) => {
      const { type } = req.params as Record<string, any>;
      return {
        name: type,
        label: type,
        labelPlural: `${type}s`,
        keyPrefix: '001',
        createable: true,
        updateable: true,
        deletable: true,
        queryable: true,
        fields: [
          { name: 'Id', type: 'id', label: 'Record ID' },
          { name: 'Name', type: 'string', label: 'Name' },
        ],
      };
    });

    // Create an sObject record.
    app.post('/services/data/:ver/sobjects/:type', async (req, reply) => {
      const params = req.params as Record<string, any>;
      const type = String(params.type);
      const body = (req.body ?? {}) as Record<string, any>;
      const id = makeSfId();
      const record = { Id: id, ...body, attributes: { type } };
      store.create(type, id, record);
      reply.code(201);
      return { id, success: true, errors: [] };
    });

    // Retrieve a single record by Id.
    app.get('/services/data/:ver/sobjects/:type/:id', async (req, reply) => {
      const params = req.params as Record<string, any>;
      const ver = String(params.ver);
      const type = String(params.type);
      const id = String(params.id);
      const found = store.get(type, id);
      if (!found) {
        reply.code(404);
        return [{ errorCode: 'NOT_FOUND', message: 'The requested resource does not exist' }];
      }
      return {
        ...found,
        attributes: { type, url: `/services/data/${ver}/sobjects/${type}/${id}` },
      };
    });

    // Update a record (PATCH) — Salesforce returns 204 No Content.
    app.patch('/services/data/:ver/sobjects/:type/:id', async (req, reply) => {
      const params = req.params as Record<string, any>;
      const type = String(params.type);
      const id = String(params.id);
      const body = (req.body ?? {}) as Record<string, any>;
      store.update(type, id, body);
      reply.code(204);
      return null;
    });

    // Delete a record — 204 No Content.
    app.delete('/services/data/:ver/sobjects/:type/:id', async (req, reply) => {
      const params = req.params as Record<string, any>;
      store.destroy(String(params.type), String(params.id));
      reply.code(204);
      return null;
    });

    // --- Composite sObjects collection endpoints --------------------------
    // jsforce (and thus the adaptor's upsert/destroy) switches to these
    // collection endpoints whenever it is handed an array of records/ids — which
    // the adaptor always does. Both return an array of { id, success, errors }
    // save results (HTTP 200).

    // upsert(type, records, extIdField) -> PATCH .../composite/sobjects/:type/:extIdField
    // with { allOrNone, records: [{ <extIdField>, attributes:{type}, ...fields }] }.
    app.patch('/services/data/:ver/composite/sobjects/:type/:extIdField', async (req) => {
      const type = String((req.params as Record<string, any>).type);
      const body = (req.body ?? {}) as Record<string, any>;
      const records = Array.isArray(body.records) ? body.records : [];
      return records.map((rec: Record<string, any>) => {
        const id = makeSfId();
        const { attributes: _attributes, ...fields } = rec;
        store.create(type, id, { Id: id, ...fields, attributes: { type } });
        return { id, success: true, errors: [], created: true };
      });
    });

    // destroy(type, ids) -> DELETE .../composite/sobjects?ids=<csv>[&allOrNone=true]
    // (the sObject type is not in the URL, so delete best-effort across every
    // collection; each id yields one success result).
    app.delete('/services/data/:ver/composite/sobjects', async (req) => {
      const ids = String((req.query as Record<string, any>).ids ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return ids.map((id) => {
        for (const c of store.collections()) store.destroy(c, id);
        return { id, success: true, errors: [] };
      });
    });

    // SOQL query — parse the sObject name out of the `?q=` clause.
    app.get('/services/data/:ver/query', async (req) => {
      const params = req.params as Record<string, any>;
      const ver = String(params.ver);
      const q = String((req.query as Record<string, any>).q ?? '');
      const match = q.match(/from\s+(\w+)/i);
      if (!match) return { totalSize: 0, done: true, records: [] };
      const type = match[1];
      const records = store.list(type).map((r) => ({
        ...r,
        attributes: { type, url: `/services/data/${ver}/sobjects/${type}/${r.Id}` },
      }));
      return { totalSize: records.length, done: true, records };
    });
  },

  seed,
};

export default plugin;
