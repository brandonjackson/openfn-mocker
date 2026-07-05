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
    'Open-source laboratory information system (Plone). The senaite adaptor authenticates with a GET /login (username/password as query params → session cookie), then drives the JSON API under /@@API/senaite/v1: search, get/<uid>, create/<portal_type>, update/<uid>, delete/<uid>. List responses use the { count, pagesize, page, items } envelope.',
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
      path: '/@@API/senaite/v1/get/clt000000000000000000000000000001',
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
      path: '/@@API/senaite/v1/update/clt000000000000000000000000000001',
      label: 'Update an object by UID',
      id: 'update',
      body: JSON.stringify({ title: 'Bo Government Hospital (renamed)' }, null, 2),
    },
  ],
};
