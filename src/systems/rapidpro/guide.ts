import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the rapidpro system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'RapidPro / TextIt',
  docs: 'https://docs.openfn.org/adaptors/packages/rapidpro-docs',
  blurb:
    'Messaging & flow automation. Token auth over /api/v2 with .json suffixes and DRF { next, previous, results } envelopes. addContact/upsertContact, startFlow and sendBroadcast are covered; posting a contact whose urn already exists updates it.',
  auth: 'Token',
  examples: [
    { method: 'GET', path: '/api/v2/contacts.json', label: 'List contacts (DRF envelope)' },
    {
      method: 'POST',
      path: '/api/v2/contacts.json',
      label: 'Add / upsert a contact (dedup on urn)',
      body: JSON.stringify({ name: 'Sandbox Contact', urns: ['tel:+23276123456'], fields: { district: 'Bo' } }, null, 2),
    },
    {
      method: 'POST',
      path: '/api/v2/flow_starts.json',
      label: 'Start a flow (startFlow)',
      body: JSON.stringify({ flow: 'flow-0001-anc-reminder', groups: ['grp-0001-anc'] }, null, 2),
    },
    {
      method: 'POST',
      path: '/api/v2/broadcasts.json',
      label: 'Send a broadcast (sendBroadcast)',
      body: JSON.stringify({ urns: ['tel:+23276000001'], text: 'Your appointment is tomorrow' }, null, 2),
    },
    { method: 'GET', path: '/api/v2/flows.json', label: 'List flows' },
  ],
};
