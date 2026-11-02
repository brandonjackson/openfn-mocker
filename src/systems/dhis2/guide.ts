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
    // Metadata reads: get('<resource>') / get('<resource>/<uid>').
    { method: 'GET', path: '/api/organisationUnits/DiszpKrYNg8', label: 'Single org unit (parent is an {id} reference)' },
    {
      method: 'GET',
      path: '/api/dataElements?fields=id,name,valueType,domainType,aggregationType',
      label: 'Data elements (pager + typed array)',
    },
    { method: 'GET', path: '/api/dataElements/fbfJHSPpUQD', label: 'Single data element' },
    { method: 'GET', path: '/api/programs', label: 'Programs list' },
    {
      method: 'GET',
      path: '/api/trackedEntityTypes?paging=false',
      label: 'Tracked entity types, unpaged (what the adaptor metadata helper reads)',
    },
    { method: 'GET', path: '/api/trackedEntityTypes/nEenWmSyUEp', label: 'Single tracked entity type (Person)' },
    // Metadata writes: create / update / http.patch / destroy on a data element.
    {
      method: 'POST',
      path: '/api/dataElements',
      label: 'Create a data element: 201 Created + ObjectReport',
      body: JSON.stringify(
        {
          id: 'rQLFnNXXIL0',
          name: 'ANC 3rd visit',
          shortName: 'ANC 3rd visit',
          valueType: 'NUMBER',
          domainType: 'AGGREGATE',
          aggregationType: 'SUM',
        },
        null,
        2
      ),
    },
    {
      method: 'PUT',
      path: '/api/dataElements/rQLFnNXXIL0',
      label: 'Replace a data element (update): ObjectReport',
      body: JSON.stringify(
        {
          name: 'ANC 3rd visit',
          shortName: 'ANC 3rd',
          valueType: 'NUMBER',
          domainType: 'AGGREGATE',
          aggregationType: 'SUM',
        },
        null,
        2
      ),
    },
    {
      method: 'PATCH',
      path: '/api/dataElements/rQLFnNXXIL0',
      label: 'Partially update a data element with a JSON Patch',
      contentType: 'application/json-patch+json',
      body: JSON.stringify([{ op: 'replace', path: '/name', value: 'ANC 3rd visit (updated)' }], null, 2),
    },
    { method: 'DELETE', path: '/api/dataElements/rQLFnNXXIL0', label: 'Delete a data element (destroy): ObjectReport' },
    {
      method: 'POST',
      path: '/api/organisationUnits',
      label: 'Create an org unit under Bo',
      body: JSON.stringify(
        {
          name: 'Gbo CHP',
          shortName: 'Gbo CHP',
          openingDate: '2024-01-01T00:00:00.000Z',
          parent: { id: 'O6uvpzGd5pu' },
        },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/api/metadata',
      label: 'Metadata import: a bundle of collections, answered with an ImportReport',
      body: JSON.stringify(
        {
          dataElements: [
            {
              name: 'ANC 4th visit',
              shortName: 'ANC 4th visit',
              valueType: 'NUMBER',
              domainType: 'AGGREGATE',
              aggregationType: 'SUM',
            },
          ],
        },
        null,
        2
      ),
    },
    // Aggregate data values.
    {
      method: 'POST',
      path: '/api/dataValueSets',
      label: 'Import aggregate data values: ImportSummary',
      body: JSON.stringify(
        {
          dataSet: 'pBOMPrpg1QX',
          period: '202401',
          orgUnit: 'DiszpKrYNg8',
          dataValues: [
            { dataElement: 'fbfJHSPpUQD', value: '12' },
            { dataElement: 'cYeuwXTCPkU', value: '9' },
          ],
        },
        null,
        2
      ),
    },
    {
      method: 'GET',
      path: '/api/dataValueSets?dataSet=pBOMPrpg1QX&period=202401&orgUnit=DiszpKrYNg8',
      label: 'Read those data values back',
    },
    // Deprecated tracker API (DHIS2 2.40 and earlier; removed in 2.41). The
    // adaptor still calls these for get('events') / create('trackedEntityInstances').
    {
      method: 'GET',
      path: '/api/trackedEntityInstances?ou=DiszpKrYNg8',
      label: 'Legacy (≤2.40): list tracked entity instances',
    },
    {
      method: 'POST',
      path: '/api/events',
      label: 'Legacy (≤2.40): create an event, answered with ImportSummaries',
      body: JSON.stringify(
        {
          program: 'IpHINAT79UW',
          programStage: 'A03MvHHogjR',
          orgUnit: 'DiszpKrYNg8',
          eventDate: '2024-02-01',
          status: 'COMPLETED',
          dataValues: [{ dataElement: 'qrur9Dvnyt5', value: '22' }],
        },
        null,
        2
      ),
    },
    { method: 'GET', path: '/api/events?orgUnit=DiszpKrYNg8', label: 'Legacy (≤2.40): list events' },
    {
      method: 'POST',
      path: '/api/enrollments',
      label: 'Legacy (≤2.40): enroll a tracked entity in a program (201 Created)',
      body: JSON.stringify(
        {
          trackedEntityInstance: 'LcRd6Nyaq7T',
          program: 'IpHINAT79UW',
          orgUnit: 'DiszpKrYNg8',
          enrollmentDate: '2024-02-01',
          incidentDate: '2024-02-01',
        },
        null,
        2
      ),
    },
    { method: 'GET', path: '/api/enrollments?ou=DiszpKrYNg8', label: 'Legacy (≤2.40): list enrollments' },
  ],
};
