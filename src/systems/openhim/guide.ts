import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openhim system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'OpenHIM',
  docs: 'https://docs.openfn.org/adaptors/packages/openhim-docs',
  blurb:
    'Health information mediator (OpenHIE). Manages the OpenHIM Core API — channels, clients, tasks and (read-only) transactions as Mongo docs keyed by a 24-hex _id — plus a sample /chw/encounter mediator route. List endpoints return bare arrays.',
  auth: 'OpenHIM header auth',
  examples: [
    { method: 'GET', path: '/channels', label: 'List channels' },
    { method: 'GET', path: '/clients', label: 'List clients' },
    { method: 'GET', path: '/transactions', label: 'List transactions (read-only)' },
    {
      method: 'POST',
      path: '/clients',
      label: 'Register a client',
      body: JSON.stringify({ clientID: 'sandbox', name: 'Sandbox Client', roles: ['chw'] }, null, 2),
    },
    {
      method: 'POST',
      path: '/chw/encounter',
      label: 'Post a CHW encounter (createEncounter)',
      body: JSON.stringify({ patient: 'Jane Doe', observations: [{ code: 'temp', value: 37.2 }] }, null, 2),
    },
  ],
};
