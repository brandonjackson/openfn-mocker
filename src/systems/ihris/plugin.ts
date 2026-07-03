import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { registerFhirRoutes } from '../shared/fhir.js';
import { seed } from './seed.js';

/**
 * iHRIS (health-workforce Digital Public Good). iHRIS serves a FHIR R4 API under
 * a /fhir base; the ihris adaptor re-exports language-fhir-4 and reads/writes
 * the workforce resources (Practitioner, PractitionerRole, Organization,
 * Location, HealthcareService). Mounted as /ihris, so resources live at
 * /ihris/fhir/Practitioner.
 */
const API_SEG = '/fhir';

const plugin: MockSystemPlugin = {
  name: 'ihris',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    registerFhirRoutes(app, store, {
      apiSeg: API_SEG,
      resourceTypes: ['Practitioner', 'PractitionerRole', 'Organization', 'Location', 'HealthcareService'],
      softwareName: 'iHRIS FHIR R4',
      port: config.port,
    });
  },

  seed,
};

export default plugin;
