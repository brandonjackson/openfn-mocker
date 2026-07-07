import type { UsageExample } from '../types.js';

/**
 * Usage examples for the msgraph sandbox "Usage" tab: one entry per adaptor
 * function (get, getDrive, getFolder, getFile, create, uploadFile).
 */
export const usage: UsageExample[] = [
  {
    fn: 'get',
    signature: 'get(path, options?)',
    description: 'GET any Microsoft Graph resource by path (here the signed-in user).',
    code: "get('me');",
    apiRef: 'me',
  },
  {
    fn: 'getDrive',
    signature: 'getDrive(specifier, name?, callback?)',
    description: 'Fetch a drive and cache it on state under `name` (default "default").',
    code: "getDrive({ id: 'b!driveSeed01' });",
    apiRef: 'getDrive',
  },
  {
    fn: 'getFolder',
    signature: 'getFolder(pathOrId, options?, callback?)',
    description:
      "List a folder's children (use 'root' for the top level). Needs a drive loaded first via getDrive.",
    code: "getDrive({ id: 'b!driveSeed01' });\ngetFolder('root');",
    apiRef: 'folder',
  },
  {
    fn: 'getFile',
    signature: 'getFile(pathOrId, options?, callback?)',
    description: 'Fetch a single drive item. Needs a drive loaded first via getDrive.',
    code: "getDrive({ id: 'b!driveSeed01' });\ngetFile('item01', { metadata: true });",
    apiRef: 'getFile',
  },
  {
    fn: 'create',
    signature: 'create(resource, data, callback?)',
    description: 'Create a resource under any Graph collection.',
    code: "create('sites/root/lists', { displayName: 'Tasks' });",
    apiRef: 'create',
  },
  {
    fn: 'uploadFile',
    signature: 'uploadFile(resource, data, callback?)',
    description: 'Upload a file to a drive folder via a resumable upload session.',
    code: "uploadFile({\n  driveId: 'b!driveSeed01',\n  folderId: 'folder01',\n  fileName: 'hello.txt'\n}, 'hello world');",
    apiRef: 'upload',
  },
];
