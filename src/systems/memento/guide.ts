import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the memento system. Paths match the Memento Database v1
 * resources the adaptor calls; the API token travels as a `?token=` query
 * parameter. The example ids are the cross-link targets for the usage examples'
 * `apiRef`.
 */
export const guide: SystemGuide = {
  title: 'Memento Database',
  docs: 'https://docs.openfn.org/adaptors/packages/memento-docs',
  blurb:
    'Personal database. The adaptor targets https://api.mementodatabase.com/v1 and passes the API token as a ?token= query parameter (no auth header). It reads libraries (with their field schema) and their entries, and can create or update entries.',
  auth: 'API token (query parameter)',
  examples: [
    { id: 'listLibs', method: 'GET', path: '/v1/libraries', label: 'List libraries' },
    { id: 'getLib', method: 'GET', path: '/v1/libraries/lib_seed01', label: 'Library info + field schema' },
    {
      id: 'listEntries',
      method: 'GET',
      path: '/v1/libraries/lib_seed01/entries',
      label: 'List entries of a library',
    },
    {
      id: 'getEntry',
      method: 'GET',
      path: '/v1/libraries/lib_seed01/entries/entry_seed01',
      label: 'Fetch an entry by id',
    },
    {
      id: 'createEntry',
      method: 'POST',
      path: '/v1/libraries/lib_seed01/entries',
      label: 'Create an entry',
      body: JSON.stringify({ fields: [{ id: 1, value: 'Grace' }] }, null, 2),
    },
    {
      id: 'updateEntry',
      method: 'PUT',
      path: '/v1/libraries/lib_seed01/entries/entry_seed01',
      label: 'Update an entry',
      body: JSON.stringify({ fields: [{ id: 1, value: 'Ada Lovelace' }] }, null, 2),
    },
  ],
};
