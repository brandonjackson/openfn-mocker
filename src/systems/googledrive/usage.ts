import type { UsageExample } from '../types.js';

/**
 * Usage examples for the googledrive sandbox "Usage" tab: one entry per adaptor
 * function (list, create, get, update). Each takes a resource path relative to
 * the Drive API.
 */
export const usage: UsageExample[] = [
  {
    fn: 'list',
    signature: 'list(path, options?)',
    description: 'List Drive files.',
    code: "list('files');",
    apiRef: 'listFiles',
  },
  {
    fn: 'create',
    signature: 'create(path, params, options?)',
    description: 'Create a file or folder in Drive.',
    code: "create('files', {\n  resource: {\n    name: 'New Folder',\n    mimeType: 'application/vnd.google-apps.folder'\n  }\n});",
    apiRef: 'createFile',
  },
  {
    fn: 'get',
    signature: 'get(path, options?)',
    description: 'Fetch a single Drive file by id.',
    code: "get('files/file_seed01');",
    apiRef: 'getFile',
  },
  {
    fn: 'update',
    signature: 'update(path, params, options?)',
    description: 'Update the metadata of a Drive file.',
    code: "update('files/file_seed01', {\n  resource: { name: 'Renamed.pdf' }\n});",
    apiRef: 'updateFile',
  },
];
