import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the collections system. Paths are relative to the system
 * mount (`/collections`), which the adaptor's `collections_endpoint` already
 * includes — so a value lives at `<mount>/:name/:key` and a listing at
 * `<mount>/:name`; a listing returns { items, cursor }. Each value is a JSON
 * string. Auth is a Bearer token. Referenced by the usage examples' `apiRef`
 * cross-links.
 */
export const guide: SystemGuide = {
  title: 'OpenFn Collections',
  docs: 'https://docs.openfn.org/adaptors/packages/collections-docs',
  blurb:
    'A hosted key/value store scoped by collection name. The adaptor authenticates with a Bearer token and reads/writes values via the collections namespace (get / set / each / remove); listings return { items, cursor } and a single value returns { key, value }.',
  auth: 'Bearer',
  examples: [
    {
      id: 'getKey',
      method: 'GET',
      path: '/patients/patient-001',
      label: 'Fetch a value by key',
    },
    { id: 'listKeys', method: 'GET', path: '/patients', label: 'List values in a collection' },
    {
      id: 'setKey',
      method: 'POST',
      path: '/patients',
      label: 'Upsert key/value pairs',
      body: JSON.stringify(
        { items: [{ key: 'patient-003', value: JSON.stringify({ name: 'Grace' }) }] },
        null,
        2
      ),
    },
    {
      id: 'removeKey',
      method: 'DELETE',
      path: '/patients/patient-001',
      label: 'Remove a value by key',
    },
  ],
};
