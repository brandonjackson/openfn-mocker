import type { UsageExample } from '../types.js';

/**
 * Usage examples for the surveycto sandbox "Usage" tab: fetching submissions
 * from a form and managing server datasets. `cursor` and `jsonToCSVBuffer` are
 * pure helpers with no API call, so they are not listed here.
 *
 * The credential's `apiVersion` defaults to 'v1' (matching the adaptor's own
 * default), which is where fetchSubmissions' plain GET is actually documented.
 * Every dataset endpoint only exists under v2, so those examples override
 * `apiVersion` mid-job with `fn()` first -- a real, supported pattern for a
 * job that needs both endpoint families from one credential.
 */
const useApiV2 = "fn(state => ({ ...state, configuration: { ...state.configuration, apiVersion: 'v2' } }));\n";

export const usage: UsageExample[] = [
  {
    fn: 'fetchSubmissions',
    signature: 'fetchSubmissions(formId, options?, callback?)',
    description: 'Fetch form submissions as a wide-JSON array, optionally after a date.',
    code: "fetchSubmissions('my_form', { date: 'Jan 01, 2024 12:00:00 AM' });",
    apiRef: 'fetch',
  },
  {
    fn: 'list',
    signature: 'list(resourceType, callback?)',
    description: 'List server resources such as datasets (a v2-only endpoint).',
    code: useApiV2 + "list('datasets');",
    apiRef: 'listDatasets',
  },
  {
    fn: 'upsertDataset',
    signature: 'upsertDataset(data, callback?)',
    description: 'Create or replace a server dataset (a v2-only endpoint; id is read from the data).',
    code: useApiV2 + "upsertDataset({ id: 'my_dataset', title: 'My Dataset', discriminator: 'DATA' });",
    apiRef: 'upsertDataset',
  },
  {
    fn: 'upsertRecord',
    signature: 'upsertRecord(datasetId, record, callback?)',
    description: 'Insert or update a single row in a server dataset (a v2-only endpoint).',
    code: useApiV2 + "upsertRecord('my_dataset', { id: 'r1', name: 'Ada' });",
    apiRef: 'upsertRecord',
  },
];
