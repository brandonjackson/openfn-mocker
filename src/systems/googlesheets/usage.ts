import type { UsageExample } from '../types.js';

/**
 * Usage examples for the googlesheets sandbox "Usage" tab: one entry per adaptor
 * function (getValues, appendValues, batchUpdateValues).
 */
export const usage: UsageExample[] = [
  {
    fn: 'getValues',
    signature: 'getValues(spreadsheetId, range, callback?)',
    description: 'Read the values of a range from a spreadsheet.',
    code: "getValues('sheet_seed01', 'Sheet1!A1:C2');",
    apiRef: 'getValues',
  },
  {
    fn: 'appendValues',
    signature: 'appendValues(params, options?)',
    description: 'Append rows to a range in a spreadsheet.',
    code: "appendValues({\n  spreadsheetId: 'sheet_seed01',\n  range: 'Sheet1!A1',\n  values: [['Grace', '32', 'NYC']]\n});",
    apiRef: 'append',
  },
  {
    fn: 'batchUpdateValues',
    signature: 'batchUpdateValues(params, options?)',
    description: 'Batch-update the values of a range in a spreadsheet.',
    code: "batchUpdateValues({\n  spreadsheetId: 'sheet_seed01',\n  range: 'Sheet1!A1',\n  valueInputOption: 'RAW',\n  values: [['x', 'y']]\n});",
    apiRef: 'batch',
  },
];
