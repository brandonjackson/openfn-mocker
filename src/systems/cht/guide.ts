import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the cht system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'CHT (Community Health Toolkit)',
  docs: 'https://docs.openfn.org/adaptors/packages/cht-docs',
  blurb:
    'Medic Community Health Toolkit on CouchDB. Create contacts via the Medic REST API (/api/v1/people, /api/v1/places), read/write raw docs and _bulk_docs on /medic, follow the _changes feed, and read/update app settings.',
  auth: 'Basic',
  examples: [
    {
      method: 'POST',
      path: '/api/v1/people',
      label: 'Create a person (returns { id, rev })',
      body: JSON.stringify({ name: 'Sandbox CHW', role: 'chw', phone: '+23276123456' }, null, 2),
    },
    { method: 'GET', path: '/medic/_changes', label: 'CouchDB changes feed' },
    { method: 'GET', path: '/medic/person-patient-0001', label: 'Read a doc by _id' },
    {
      method: 'POST',
      path: '/medic/_bulk_docs',
      label: 'Bulk write docs',
      body: JSON.stringify({ docs: [{ type: 'person', name: 'Bulk One' }] }, null, 2),
    },
    { method: 'GET', path: '/api/v2/export/contacts', label: 'Export contacts' },
  ],
};
