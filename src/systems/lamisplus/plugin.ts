import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, makePatient, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * LAMISPlus (an open-source HIV EMR used across Nigeria). The lamisplus adaptor
 * first logs in with { email, password } at POST /core/api/v1/auth/login and
 * reads `accessToken` from the response, then sends it as `Authorization:
 * Bearer <accessToken>`. getPatients reads GET /plugin/ehr/api/v1/patient and
 * returns `body.data.patients`; the generic get/post/request functions hit any
 * relative path. Auth is accept-all here (the token value is never validated).
 */

/** Mint an opaque token (value is never validated). */
function mintToken(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
}

const plugin: MockSystemPlugin = {
  name: 'lamisplus',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'email', role: 'email', value: 'admin@lamisplus.org' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Login (email + password -> accessToken) ---
    app.post('/core/api/v1/auth/login', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      reply.code(200);
      return {
        accessToken: mintToken(),
        tokenType: 'Bearer',
        expiresIn: 86400,
        email: body.email ?? 'admin@lamisplus.org',
      };
    });

    // --- getPatients -> GET /plugin/ehr/api/v1/patient ---
    // The adaptor reads `body.data.patients`; supports optional filtering by a
    // ?searchValue= (name / hospital number) query param.
    app.get('/plugin/ehr/api/v1/patient', async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let patients = store.list('patients');
      const search = typeof q.searchValue === 'string' ? q.searchValue.toLowerCase() : undefined;
      if (search) {
        patients = patients.filter((p) =>
          [p.firstName, p.surname, p.hospitalNumber].some(
            (v) => typeof v === 'string' && v.toLowerCase().includes(search)
          )
        );
      }
      return { data: { patients, totalRecords: patients.length } };
    });

    // Single patient by id (generic get()).
    app.get('/plugin/ehr/api/v1/patient/:id', async (req, reply) => {
      const id = String((req.params as Record<string, any>).id);
      const found = store.get('patients', id);
      if (!found) {
        reply.code(404);
        return { error: 'Patient not found' };
      }
      return { data: found };
    });

    // Create a patient (generic post()).
    app.post('/plugin/ehr/api/v1/patient', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const patient = makePatient({ ...body, dateRegistered: nowIso() });
      store.create('patients', String(patient.id), patient);
      reply.code(201);
      return { data: patient };
    });
  },

  seed,
};

export default plugin;
