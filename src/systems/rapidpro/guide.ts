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
    'Messaging & flow automation. Token auth over /api/v2 with .json suffixes and DRF { next, previous, results } envelopes. addContact/upsertContact, startFlow and sendBroadcast are covered; posting a contact whose urn already exists updates it. Groups, fields, messages, labels, runs, campaigns, globals, the workspace and bulk contact actions are there for workflows that call the rest of the API over HTTP.',
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
    { method: 'GET', path: '/api/v2/flow_starts.json', label: 'List flow starts' },
    { method: 'GET', path: '/api/v2/broadcasts.json', label: 'List broadcasts' },
    { method: 'GET', path: '/api/v2/groups.json', label: 'List contact groups' },
    {
      method: 'POST',
      path: '/api/v2/groups.json',
      label: 'Create a contact group',
      body: JSON.stringify({ name: 'Postnatal Mothers' }, null, 2),
    },
    {
      method: 'POST',
      path: '/api/v2/contact_actions.json',
      label: 'Add contacts to a group in bulk',
      body: JSON.stringify({ contacts: ['tel:+23276000003'], action: 'add', group: 'ANC Mothers' }, null, 2),
    },
    { method: 'GET', path: '/api/v2/fields.json', label: 'List contact fields' },
    { method: 'GET', path: '/api/v2/messages.json?folder=inbox', label: 'List inbox messages' },
    {
      method: 'POST',
      path: '/api/v2/messages.json',
      label: 'Send a message to one contact',
      body: JSON.stringify({ contact: 'a052b00c-15b3-48e6-9771-edbaa277a353', text: 'Thanks, see you at the clinic.' }, null, 2),
    },
    { method: 'GET', path: '/api/v2/labels.json', label: 'List message labels' },
    { method: 'GET', path: '/api/v2/runs.json?flow=flow-0001-anc-reminder', label: 'List runs of a flow (with results)' },
    { method: 'GET', path: '/api/v2/campaigns.json', label: 'List campaigns' },
    { method: 'GET', path: '/api/v2/globals.json', label: 'List globals' },
    { method: 'GET', path: '/api/v2/workspace.json', label: 'View the workspace' },
  ],
};
