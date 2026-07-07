import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the surveycto system. Submissions come back as a bare
 * wide-JSON array; datasets use the /api/v2/datasets endpoints. Auth is HTTP
 * Basic. Referenced by the usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'SurveyCTO',
  docs: 'https://docs.openfn.org/adaptors/packages/surveycto-docs',
  blurb:
    'Offline-first form collection. The adaptor authenticates with HTTP Basic and fetches submissions as a wide-JSON array from /api/v2/forms/data/wide/json/:formId; server datasets are read and written under /api/v2/datasets.',
  auth: 'Basic (username/password)',
  examples: [
    {
      id: 'fetch',
      method: 'GET',
      path: '/api/v2/forms/data/wide/json/my_form',
      label: 'Fetch form submissions (wide JSON)',
    },
    { id: 'listDatasets', method: 'GET', path: '/api/v2/datasets', label: 'List server datasets' },
    {
      id: 'upsertDataset',
      method: 'POST',
      path: '/api/v2/datasets',
      label: 'Create or replace a dataset',
      body: JSON.stringify({ id: 'my_dataset', title: 'My Dataset', type: 'SERVER_DATASET' }, null, 2),
    },
    {
      id: 'upsertRecord',
      method: 'PATCH',
      path: '/api/v2/datasets/my_dataset/record',
      label: 'Upsert a dataset row',
      body: JSON.stringify({ id: 'r1', name: 'Ada' }, null, 2),
    },
  ],
};
