import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the opencrvs system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'OpenCRVS',
  docs: 'https://docs.openfn.org/adaptors/packages/opencrvs-docs',
  blurb:
    'Civil registration & vital statistics. A GraphQL search API (queryEvents → { data: { searchEvents } }) sits alongside the events REST API: POST /api/events/events creates an event, …/notify advances it, and /api/events/locations lists places.',
  auth: 'Bearer JWT',
  examples: [
    {
      method: 'POST',
      path: '/graphql',
      label: 'searchEvents (queryEvents)',
      body: JSON.stringify({ query: 'query { searchEvents { totalItems results { id type } } }' }, null, 2),
    },
    { method: 'GET', path: '/api/events/events', label: 'List registration events' },
    {
      method: 'POST',
      path: '/api/events/events',
      label: 'Create an event (createEvent)',
      body: JSON.stringify({ type: 'v2.birth', transactionId: 'sandbox-txn-1' }, null, 2),
    },
    { method: 'GET', path: '/api/events/locations', label: 'Location list' },
  ],
};
