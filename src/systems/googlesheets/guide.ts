import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the googlesheets system. Paths mirror the Google Sheets v4
 * spreadsheets.values resource, including the colon-suffixed `:append` and
 * `:batchUpdate` verbs. Bearer access token auth.
 */
export const guide: SystemGuide = {
  title: 'Google Sheets',
  docs: 'https://docs.openfn.org/adaptors/packages/googlesheets-docs',
  blurb:
    'Google Sheets (v4). The adaptor authenticates with a Bearer access token and calls the spreadsheets.values resource: read a range, append rows and batch-update values. Append/batch-update URLs carry a colon-suffixed verb (values/{range}:append, values:batchUpdate).',
  auth: 'API key (Bearer access token)',
  examples: [
    {
      id: 'getValues',
      method: 'GET',
      path: '/v4/spreadsheets/sheet_seed01/values/Sheet1!A1:C2',
      label: 'Get values for a range',
    },
    {
      id: 'append',
      method: 'POST',
      path: '/v4/spreadsheets/sheet_seed01/values/Sheet1!A1:append',
      label: 'Append rows to a range',
      body: JSON.stringify({ values: [['Grace', '32', 'NYC']] }, null, 2),
    },
    {
      id: 'batch',
      method: 'POST',
      path: '/v4/spreadsheets/sheet_seed01/values:batchUpdate',
      label: 'Batch-update values',
      body: JSON.stringify(
        {
          valueInputOption: 'RAW',
          data: [{ range: 'Sheet1!A1', values: [['x', 'y']] }],
        },
        null,
        2
      ),
    },
  ],
};
