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
    signature: 'getDrive(driveId, options?)',
    description: 'Fetch a OneDrive/SharePoint drive by id.',
    code: "getDrive('b!driveSeed01');",
    apiRef: 'getDrive',
  },
  {
    fn: 'getFolder',
    signature: 'getFolder(driveId, folder, options?)',
    description: "List the children of a folder (use 'root' for the top level).",
    code: "getFolder('b!driveSeed01', 'root');",
    apiRef: 'folder',
  },
  {
    fn: 'getFile',
    signature: 'getFile(driveId, itemId, options?)',
    description: 'Fetch a single drive item (file) by id.',
    code: "getFile('b!driveSeed01', 'item01');",
    apiRef: 'getFile',
  },
  {
    fn: 'create',
    signature: 'create(resource, data, options?)',
    description: 'Create a resource under any Graph collection.',
    code: "create('sites/root/lists', { displayName: 'Tasks' });",
    apiRef: 'create',
  },
  {
    fn: 'uploadFile',
    signature: 'uploadFile(driveId, itemId, data, options?)',
    description: 'Upload content to a drive item.',
    code: "uploadFile('b!driveSeed01', 'item99', 'hello world');",
    apiRef: 'upload',
  },
];
