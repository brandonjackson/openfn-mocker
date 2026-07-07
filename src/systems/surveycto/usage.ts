import type { UsageExample } from '../types.js';

/**
 * Usage examples for the surveycto sandbox "Usage" tab: fetching submissions
 * from a form and managing server datasets. `cursor` and `jsonToCSVBuffer` are
 * pure helpers with no API call, so they are not listed here.
 */
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
    description: 'List server resources such as datasets.',
    code: "list('datasets');",
    apiRef: 'listDatasets',
  },
  {
    fn: 'upsertDataset',
    signature: 'upsertDataset(data, callback?)',
    description: 'Create or replace a server dataset (id is read from the data).',
    code: "upsertDataset({ id: 'my_dataset', title: 'My Dataset', type: 'SERVER_DATASET' });",
    apiRef: 'upsertDataset',
  },
  {
    fn: 'upsertRecord',
    signature: 'upsertRecord(datasetId, record, callback?)',
    description: 'Insert or update a single row in a server dataset.',
    code: "upsertRecord('my_dataset', { id: 'r1', name: 'Ada' });",
    apiRef: 'upsertRecord',
  },
];
