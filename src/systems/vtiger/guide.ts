import type { SystemGuide } from '../types.js';

const FORM = 'application/x-www-form-urlencoded';

/** URL-encode a flat object into an application/x-www-form-urlencoded body. */
function form(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Sandbox guide for the vtiger system: its blurb and the runnable example requests
 * shown on the sandbox "API" tab. Co-located with this system's seed data and
 * imported onto the plugin (`MockSystemPlugin.guide`); rendered by the sandbox and
 * referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'Vtiger CRM',
  docs: 'https://docs.openfn.org/adaptors/packages/vtiger-docs',
  blurb:
    'Open-source CRM with a single REST entry point at /webservice.php. Every job first calls getchallenge (GET) then login (POST, an md5 of the challenge token + access key) to obtain a sessionName, then runs operations like listTypes and create/update/delete via postElement. Records carry a "<moduleId>x<n>" webservice id and responses use the { success, result } envelope. Auth is accept-all here.',
  auth: 'Challenge + session (getchallenge/login)',
  examples: [
    {
      id: 'getchallenge',
      method: 'GET',
      path: '/webservice.php?operation=getchallenge&username=admin',
      label: 'Request a login challenge token (getchallenge)',
    },
    {
      id: 'login',
      method: 'POST',
      path: '/webservice.php',
      label: 'Log in with the md5 access key → sessionName (login)',
      contentType: FORM,
      body: form({ operation: 'login', username: 'admin', accessKey: 'd41d8cd98f00b204e9800998ecf8427e' }),
    },
    {
      id: 'list-types',
      method: 'POST',
      path: '/webservice.php',
      label: 'List the available modules (listTypes)',
      contentType: FORM,
      body: form({ operation: 'listTypes', sessionName: 'mock-session' }),
    },
    {
      id: 'create',
      method: 'POST',
      path: '/webservice.php',
      label: 'Create a Contacts record (postElement, operation=create)',
      contentType: FORM,
      body: form({
        sessionName: 'mock-session',
        operation: 'create',
        elementType: 'Contacts',
        element: JSON.stringify({ firstname: 'Grace', lastname: 'Mensah', email: 'grace@example.org', assigned_user_id: '19x1' }),
      }),
    },
    {
      id: 'retrieve',
      method: 'GET',
      path: '/webservice.php?operation=retrieve&id=12x1',
      label: 'Retrieve one Contacts record by id (retrieve)',
    },
    {
      id: 'query',
      method: 'GET',
      path: '/webservice.php?operation=query&query=select%20*%20from%20Contacts;',
      label: 'Query records with Vtiger SQL (query)',
    },
  ],
};
