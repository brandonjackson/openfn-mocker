import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the senaite system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'SENAITE LIMS',
  docs: 'https://docs.openfn.org/adaptors/packages/senaite-docs',
  blurb:
    'Open-source laboratory information system (Plone). The senaite adaptor authenticates with a GET /login (username/password as query params → session cookie), then drives the JSON API under /@@API/senaite/v1: search, get/<uid>, create/<portal_type>, update/<uid>, delete/<uid>, plus (senaite.jsonapi 2.7.0) types/schema/workflow introspection, partition, and PUT/PATCH/DELETE on <portal_type>/<uid>. List responses use the { count, pagesize, page, items } envelope.',
  auth: 'Session cookie (login with username/password)',
  examples: [
    {
      method: 'GET',
      path: '/login?__ac_name=admin&__ac_password=secret',
      label: 'Authenticate → sets the __ac session cookie',
      id: 'login',
    },
    { method: 'GET', path: '/@@API/senaite/v1/version', label: 'JSON API version', id: 'version' },
    {
      method: 'GET',
      path: '/@@API/senaite/v1/search?portal_type=Client',
      label: 'Search catalog objects by portal_type',
      id: 'search',
    },
    {
      method: 'GET',
      path: '/@@API/senaite/v1/get/c1000000000000000000000000000001',
      label: 'Get one object by UID',
      id: 'get',
    },
    {
      method: 'POST',
      path: '/@@API/senaite/v1/create/Client',
      label: 'Create a Client',
      id: 'create',
      body: JSON.stringify({ title: 'Freetown Clinic', ClientID: 'C-0003' }, null, 2),
    },
    {
      method: 'POST',
      path: '/@@API/senaite/v1/update/c1000000000000000000000000000001',
      label: 'Update an object by UID',
      id: 'update',
      body: JSON.stringify({ title: 'Bo Government Hospital (renamed)' }, null, 2),
    },
    {
      method: 'PATCH',
      path: '/@@API/senaite/v1/Client/c1000000000000000000000000000002',
      label: 'Update an object with the REST verb (2.7.0+)',
      id: 'patch',
      body: JSON.stringify({ Phone: '+232 76 000 000' }, null, 2),
    },
    {
      method: 'GET',
      path: '/@@API/senaite/v1/types?parent_uid=c1000000000000000000000000000001',
      label: 'Portal types that can be added inside a Client',
      id: 'types',
    },
    {
      method: 'GET',
      path: '/@@API/senaite/v1/types/AnalysisRequest',
      label: 'Describe a portal type (add permission, catalogs)',
      id: 'type',
    },
    {
      method: 'GET',
      path: '/@@API/senaite/v1/schema/AnalysisRequest',
      label: "A portal type's schema fields (required, references)",
      id: 'schema',
    },
    {
      method: 'GET',
      path: '/@@API/senaite/v1/workflow/a5000000000000000000000000000001',
      label: "A sample's review state and available transitions",
      id: 'workflow',
    },
    {
      method: 'POST',
      path: '/@@API/senaite/v1/partition',
      label: 'Split a received sample into a partition',
      id: 'partition',
      body: JSON.stringify(
        { uid: 'a5000000000000000000000000000001', partitions: [{ analyses: [], internal_use: false }] },
        null,
        2,
      ),
    },
    {
      method: 'DELETE',
      path: '/@@API/senaite/v1/Client/c1000000000000000000000000000002',
      label: 'Deactivate an object with the REST verb (SENAITE keeps it for audit)',
      id: 'deactivate',
    },
  ],
};
