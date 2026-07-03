import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openlmis system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'OpenLMIS',
  docs: 'https://docs.openfn.org/adaptors/packages/openlmis-docs',
  blurb:
    'Logistics management (v3). OAuth2 token via POST /api/oauth/token; reference-data + requisition lists use the Spring Data { content, totalElements, totalPages, … } page envelope. Facilities, orderables, programs and requisitions are served.',
  auth: 'OAuth2 (POST /api/oauth/token)',
  examples: [
    { method: 'POST', path: '/api/oauth/token?grant_type=client_credentials', label: 'Get an access token' },
    { method: 'GET', path: '/api/facilities', label: 'Facilities (Spring page envelope)' },
    { method: 'GET', path: '/api/orderables', label: 'Products / orderables' },
    { method: 'GET', path: '/api/requisitions', label: 'Requisitions' },
    {
      method: 'POST',
      path: '/api/requisitions/initiate?program=10845cb9-d365-4aaa-badd-b4fa39c6a26a&facility=a6799d64-d10d-4011-b8c2-0e4d4a3f0001',
      label: 'Initiate a requisition',
    },
  ],
};
