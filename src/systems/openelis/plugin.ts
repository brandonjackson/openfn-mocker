import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { registerFhirRoutes } from '../shared/fhir.js';
import { seed } from './seed.js';

/**
 * OpenELIS Global (laboratory-information Digital Public Good). OpenELIS Global
 * 2.x speaks FHIR R4 under a /fhir base; the openelis adaptor reads/writes lab
 * orders and results as ServiceRequest / Specimen / Observation /
 * DiagnosticReport tied to a Patient. Mounted as /openelis, so resources live at
 * /openelis/fhir/ServiceRequest.
 */
const API_SEG = '/fhir';

const plugin: MockSystemPlugin = {
  name: 'openelis',
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
      resourceTypes: ['Patient', 'ServiceRequest', 'Specimen', 'Observation', 'DiagnosticReport', 'Task'],
      softwareName: 'OpenELIS Global FHIR R4',
      port: config.port,
    });
  },

  seed,
};

export default plugin;
