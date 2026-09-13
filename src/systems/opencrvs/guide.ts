import type { SystemGuide } from '../types.js';
import { EVENTS } from './seed.js';

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
    'Civil registration & vital statistics. A v1 GraphQL search API (queryEvents → { data: { searchEvents } }) sits alongside the v2 events REST API: POST /api/events/events creates an event, …/notify advances it, POST /api/events/events/search lists them (there is no GET collection route), and /api/events/locations lists places.',
  auth: 'Bearer JWT',
  examples: [
    {
      method: 'POST',
      path: '/graphql',
      label: 'searchEvents (queryEvents)',
      body: JSON.stringify({ query: 'query { searchEvents { totalItems results { id type } } }' }, null, 2),
    },
    {
      method: 'POST',
      path: '/api/events/events/search',
      label: 'Search registration events',
      body: JSON.stringify(
        {
          query: {
            type: 'and',
            clauses: [{ eventType: 'v2.birth', status: { type: 'anyOf', terms: ['REGISTERED'] } }],
          },
          limit: 10,
          offset: 0,
        },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/api/events/events',
      label: 'Create an event (createEvent)',
      body: JSON.stringify({ type: 'v2.birth', transactionId: 'sandbox-txn-1' }, null, 2),
    },
    { method: 'GET', path: '/api/events/locations', label: 'Location list' },
    {
      method: 'GET',
      path: `/api/events/events/${EVENTS.birth}`,
      label: 'Fetch one event document',
    },
    {
      method: 'POST',
      path: `/api/events/events/${EVENTS.death}/notify`,
      label: 'Notify an event (notifyEvent)',
      body: JSON.stringify(
        {
          transactionId: 'sandbox-txn-2',
          declaration: { 'deceased.dod': '2024-02-08' },
        },
        null,
        2
      ),
    },
  ],
};
