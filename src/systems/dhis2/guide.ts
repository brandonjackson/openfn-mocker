import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the dhis2 system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'DHIS2',
  docs: 'https://docs.openfn.org/adaptors/packages/dhis2-docs',
  blurb:
    'Aggregate + tracker health data. List responses carry a pager and a resource-typed array; writes return an ImportSummary envelope. The generic adaptor is fully covered: the new /api/tracker API, /api/analytics, /api/schemas, and CRUD for any resource (with an optional /api/{version}/ segment).',
  auth: 'Basic',
  examples: [
    { method: 'GET', path: '/api/system/info', label: 'Server version and context path' },
    {
      method: 'GET',
      path: '/api/organisationUnits',
      label: 'Org-unit hierarchy (pager + typed array)',
    },
    {
      method: 'GET',
      path: '/api/organisationUnits?filter=name:eq:Bo',
      label: 'Server-side filter (field:op:value)',
    },
    {
      method: 'GET',
      path: '/api/programs/IpHINAT79UW',
      label: 'Single program (Child Programme) with two stages',
    },
    {
      method: 'POST',
      path: '/api/trackedEntityInstances',
      label: 'Create a tracked entity: returns an ImportSummary, then read it back above',
      body: JSON.stringify(
        {
          trackedEntityType: 'nEenWmSyUEp',
          orgUnit: 'DiszpKrYNg8',
          attributes: [{ attribute: 'w75KJ2mc4zz', value: 'Jane' }],
        },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/api/tracker?importStrategy=CREATE_AND_UPDATE&async=false',
      label: 'New Tracker API: import events/trackedEntities (bundleReport)',
      body: JSON.stringify(
        {
          events: [
            { program: 'IpHINAT79UW', programStage: 'A03MvHHogjR', orgUnit: 'DiszpKrYNg8', status: 'COMPLETED' },
          ],
        },
        null,
        2
      ),
    },
    {
      method: 'GET',
      path: '/api/tracker/events',
      label: 'Tracker export ({ instances, page, total })',
    },
    {
      method: 'GET',
      path: '/api/analytics?dimension=dx:fbfJHSPpUQD&dimension=pe:202401&dimension=ou:ImspTQPwCqd',
      label: 'Analytics grid (headers + rows + metaData)',
    },
    { method: 'GET', path: '/api/schemas/dataElement', label: 'Metadata schema for a resource type' },
    {
      method: 'GET',
      path: '/api/40/organisationUnits',
      label: 'Optional API version segment (/api/{version}/…)',
    },
  ],
};
