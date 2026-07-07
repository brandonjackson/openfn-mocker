import type { UsageExample } from '../types.js';

/**
 * Usage examples for the googledrive sandbox "Usage" tab: one entry per adaptor
 * function (list, create, get, update). `list` takes a folder id; `get` a file
 * id or name; `create`/`update` stream base64-encoded file content.
 */
export const usage: UsageExample[] = [
  {
    fn: 'list',
    signature: 'list(folderId, options?)',
    description: 'List the files in a Drive folder.',
    code: "list('folder_seed01');",
    apiRef: 'listFiles',
  },
  {
    fn: 'create',
    signature: 'create(content, fileName, options?)',
    description: 'Create a Drive file from base64-encoded content.',
    code: "create('SGVsbG8sIHdvcmxkIQ==', 'New File.txt');",
    apiRef: 'createFile',
  },
  {
    fn: 'get',
    signature: 'get(fileIdOrName)',
    description: 'Fetch a single Drive file by id (or name).',
    code: "get('file_seed01');",
    apiRef: 'getFile',
  },
  {
    fn: 'update',
    signature: 'update(fileId, content)',
    description: 'Replace a Drive file’s content with base64-encoded bytes.',
    code: "update('file_seed01', 'SGVsbG8sIHdvcmxkIQ==');",
    apiRef: 'updateFile',
  },
];
