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

  usage: [
    { fn: "fhir.get", signature: "fhir.get(path, query)", description: "Make a GET request to any FHIR endpoint in iHRIS.",
      code: "fhir.get('Practitioner', { name: 'Sesay' });", apiRef: "ex1" },
    { fn: "http.get", signature: "http.get(resource, options)", description: "Get a FHIR resource by id, or list all resources of a given type.",
      code: "http.get('/fhir/Practitioner');", apiRef: "ex0" },
    { fn: "http.post", signature: "http.post(resource, body, options)", description: "Create a new FHIR resource, e.g. add a Practitioner.",
      code: "http.post('/fhir/Practitioner', {\n  resourceType: 'Practitioner', name: [{ family: 'Sesay', given: ['Aminata'] }],\n});", apiRef: "ex3" },
    { fn: "http.put", signature: "http.put(resource, body, options)", description: "Update an existing FHIR resource at the given resource path.",
      code: "http.put('/fhir/Practitioner/6462', {\n  resourceType: 'Practitioner', id: '6462', active: true,\n});" },
    { fn: "http.request", signature: "http.request(method, path, body, options)", description: "Make a general HTTP request with any method to any iHRIS endpoint.",
      code: "http.request('GET', '/fhir/PractitionerRole/role-prac-0001', {}, {});", apiRef: "ex2" },
  ],

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
