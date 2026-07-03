import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the et-mfr system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'Ethiopia MFR',
  docs: 'https://docs.openfn.org/adaptors/packages/et-mfr-docs',
  blurb:
    "Ethiopia's national Master Facility Registry. A thin HTTP wrapper (get/post/request) with HTTP Basic auth; the adaptor joins each relative path onto an /api/ prefix, so get('Facility/All') hits GET /api/Facility/All. Regions live under /api/Location/Regions and facilities under /api/Facility*.",
  auth: 'Basic',
  examples: [
    { id: 'regions', method: 'GET', path: '/api/Location/Regions', label: 'List regions' },
    { id: 'facilities', method: 'GET', path: '/api/Facility/All', label: 'List all facilities (get)' },
    { id: 'paged', method: 'GET', path: '/api/Facility/GetFacilities?page=1&pageSize=2', label: 'Paginated facilities (request)' },
    { id: 'facility', method: 'GET', path: '/api/Facility?id=FAC-0001', label: 'One facility by id' },
    { id: 'export', method: 'GET', path: '/api/Facility/ExportCSV', label: 'Export facilities as CSV' },
    {
      id: 'create',
      method: 'POST',
      path: '/api/Facility',
      label: 'Create a facility (post)',
      body: JSON.stringify({ facilityName: 'Sandbox Health Center', region: 'Addis Ababa', facilityType: 'Health Center' }, null, 2),
    },
  ],
};
