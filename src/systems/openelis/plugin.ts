import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { registerFhirRoutes } from '../shared/fhir.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * OpenELIS Global (laboratory-information Digital Public Good). OpenELIS Global
 * 2.x speaks FHIR R4 under a /fhir base; the openelis adaptor reads/writes lab
 * orders and results as ServiceRequest / Specimen / Observation /
 * DiagnosticReport tied to a Patient. Mounted as /openelis, so resources live at
 * /openelis/fhir/ServiceRequest.
 *
 * The openelis adaptor prefixes every request path with
 * `/api/OpenELIS-Global/rest/` (see language-openelis http.request), so a job
 * calling `http.get('fhir/ServiceRequest')` actually hits
 * `/api/OpenELIS-Global/rest/fhir/ServiceRequest`. We register the FHIR surface
 * under that real base as well as the plain `/fhir` base used by the sandbox
 * guide and unit tests.
 */
const API_SEG = '/fhir';
const ADAPTOR_API_SEG = '/api/OpenELIS-Global/rest/fhir';

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

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const resourceTypes = ['Patient', 'ServiceRequest', 'Specimen', 'Observation', 'DiagnosticReport', 'Task'];
    const softwareName = 'OpenELIS Global FHIR R4';
    registerFhirRoutes(app, store, { apiSeg: API_SEG, resourceTypes, softwareName, port: config.port });
    registerFhirRoutes(app, store, { apiSeg: ADAPTOR_API_SEG, resourceTypes, softwareName, port: config.port });
  },

  seed,
};

export default plugin;
