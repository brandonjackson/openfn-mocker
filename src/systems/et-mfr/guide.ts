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
    "Ethiopia's national Master Facility Registry. A thin HTTP wrapper (get/post/request) with HTTP Basic auth; the adaptor joins each relative path onto an /api/ prefix, so get('Facility/All') hits GET /api/Facility/All. Every operation answers 200 with the envelope { result, message, model } — the adaptor unwraps `model`. Regions/zones/woredas live under /api/Location/*, reference data under /api/Lookup, facilities under /api/Facility*; the two searches (GetFacilities, ExportCSV) are POSTs taking a filter document.",
  auth: 'Basic',
  examples: [
    { id: 'health', method: 'GET', path: '/api/Health', label: 'Readiness probe' },
    { id: 'regions', method: 'GET', path: '/api/Location/Regions', label: 'List regions' },
    { id: 'zones', method: 'GET', path: '/api/Location/Zones', label: 'List zones' },
    { id: 'woredas', method: 'GET', path: '/api/Location/Woredas', label: 'List woredas' },
    { id: 'lookup', method: 'GET', path: '/api/Lookup?name=FacilityType', label: 'Reference data by lookup name' },
    { id: 'facilities', method: 'GET', path: '/api/Facility/All?name=Hospital', label: 'List facilities in full detail (get)' },
    { id: 'facility', method: 'GET', path: '/api/Facility?id=1071644', label: 'One facility by MFR id' },
    { id: 'dhis2', method: 'GET', path: '/api/Facility/wprKoIJqBaI', label: 'One facility by DHIS2 id' },
    {
      id: 'paged',
      method: 'POST',
      path: '/api/Facility/GetFacilities',
      label: 'Paginated facility summaries (request)',
      body: JSON.stringify({ pageNumber: 1, showPerPage: 2, name: 'Hospital' }, null, 2),
    },
    {
      id: 'export',
      method: 'POST',
      path: '/api/Facility/ExportCSV',
      label: 'Export matching facilities as CSV',
      body: JSON.stringify({ name: 'Hospital' }, null, 2),
    },
    {
      id: 'lookup-create',
      method: 'POST',
      path: '/api/Lookup',
      label: 'Add a reference-data row',
      body: JSON.stringify({ lookupType: 'FacilityType', name: 'Primary Hospital', code: 'PRH' }, null, 2),
    },
    {
      id: 'create',
      method: 'POST',
      path: '/api/Facility',
      label: 'Create a facility (post)',
      body: JSON.stringify(
        { name: 'Sandbox Health Center', regionId: 1, zoneId: 11, woredaId: 101, facilityTypeId: 204, ownershipId: 301 },
        null,
        2
      ),
    },
    {
      id: 'update',
      method: 'PUT',
      path: '/api/Facility',
      label: 'Update a facility (the body carries its id)',
      body: JSON.stringify({ id: 1071645, phoneNumber: '+251221110099', catchmentPopulation: 1250000 }, null, 2),
    },
    { id: 'delete', method: 'DELETE', path: '/api/Facility/yRsMqKLsDcK', label: 'Delete a facility by DHIS2 id' },
  ],
};
