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

  usage: [
    { fn: "http.get", signature: "http.get(path, options)", description: "Send a GET request to fetch lab orders, results, or reports from OpenELIS.",
      code: "http.get('fhir/ServiceRequest');", apiRef: "ex0" },
    { fn: "http.post", signature: "http.post(path, body, options)", description: "Send a POST request to create or submit data, e.g. a new lab order.",
      code: "http.post('fhir/ServiceRequest', {\n  resourceType: 'ServiceRequest', status: 'active', intent: 'order', subject: { reference: 'Patient/pat-0001' },\n});", apiRef: "ex3" },
    { fn: "http.request", signature: "http.request(method, path, body, options)", description: "Make a general HTTP request with any method to an OpenELIS endpoint.",
      code: "http.request('GET', 'fhir/DiagnosticReport/report-0001');", apiRef: "ex1" },
  ],

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
