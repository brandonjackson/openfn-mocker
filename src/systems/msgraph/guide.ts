import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the msgraph system. Paths mirror Microsoft Graph v1.0
 * resources the adaptor calls; collections use the `{ value: [...] }` envelope
 * and single resources are bare objects. Bearer access token auth.
 */
export const guide: SystemGuide = {
  title: 'Microsoft Graph',
  docs: 'https://docs.openfn.org/adaptors/packages/msgraph-docs',
  blurb:
    'Microsoft Graph (v1.0). The adaptor authenticates with a Bearer access token and calls Graph REST resources — the signed-in user (/me), OneDrive/SharePoint drives, folders and files. Collections come back in a { value: [...] } envelope.',
  auth: 'API key (Bearer access token)',
  examples: [
    { id: 'me', method: 'GET', path: '/v1.0/me', label: 'Get the signed-in user' },
    { id: 'getDrive', method: 'GET', path: '/v1.0/drives/b!driveSeed01', label: 'Get a drive' },
    {
      id: 'folder',
      method: 'GET',
      path: '/v1.0/drives/b!driveSeed01/items/root/children',
      label: 'List folder (root) children',
    },
    {
      id: 'getFile',
      method: 'GET',
      path: '/v1.0/drives/b!driveSeed01/items/item01',
      label: 'Get a drive item (file)',
    },
    {
      id: 'create',
      method: 'POST',
      path: '/v1.0/sites/root/lists',
      label: 'Create a resource',
      body: JSON.stringify({ displayName: 'Tasks' }, null, 2),
    },
    {
      id: 'upload',
      method: 'PUT',
      path: '/v1.0/drives/b!driveSeed01/items/item99/content',
      label: 'Upload file content',
      body: 'hello world',
      contentType: 'text/plain',
    },
  ],
};
