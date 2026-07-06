import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the dagu system. Paths match the Dagu v1 REST API (/api/v1).
 * Listings use the `{ DAGs, Errors, HasError }` envelope; getDag / startDag
 * target the seeded 'nightly' DAG.
 */
export const guide: SystemGuide = {
  title: 'Dagu',
  docs: 'https://docs.openfn.org/adaptors/packages/dagu-docs',
  blurb:
    'Dagu workflow engine. The adaptor exposes generic get / post / request verbs over the Dagu v1 REST API (under /api/v1), authenticated with HTTP Basic. Listings use the { DAGs, Errors, HasError } envelope.',
  auth: 'Basic',
  examples: [
    { id: 'listDags', method: 'GET', path: '/api/v1/dags', label: 'List DAGs' },
    { id: 'getDag', method: 'GET', path: '/api/v1/dags/nightly', label: 'Fetch a DAG by name' },
    {
      id: 'startDag',
      method: 'POST',
      path: '/api/v1/dags/nightly',
      label: 'Start a DAG',
      body: JSON.stringify({ action: 'start' }, null, 2),
    },
  ],
};
