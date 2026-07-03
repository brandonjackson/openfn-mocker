import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { registerFhirRoutes } from '../shared/fhir.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * openIMIS (health-insurance Digital Public Good). The openimis adaptor logs in
 * against POST /api/api_fhir_r4/login/ (returns a bearer token) and then reads
 * FHIR R4 resources under /api/api_fhir_r4/{resource} via getFHIR. Insurees are
 * Patients, policies are Contracts, benefits are Coverages/Claims.
 */
const API_SEG = '/api/api_fhir_r4';

const plugin: MockSystemPlugin = {
  name: 'openimis',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'Admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    registerFhirRoutes(app, store, {
      apiSeg: API_SEG,
      resourceTypes: ['Patient', 'Contract', 'Coverage', 'Claim', 'Practitioner', 'Organization'],
      softwareName: 'openIMIS FHIR R4',
      port: config.port,
      loginPath: `${API_SEG}/login/`,
      loginResponse: () => ({ token: 'mock_openimis_token', exp: Date.now() + 3_600_000 }),
    });
  },

  seed,
};

export default plugin;
