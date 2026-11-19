import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the googledrive system. Paths mirror the Google Drive v3
 * Files resource the adaptor calls; listings use `{ files: [...] }` and single
 * files are bare objects. Bearer access token auth.
 */
export const guide: SystemGuide = {
  title: 'Google Drive',
  docs: 'https://docs.openfn.org/adaptors/packages/googledrive-docs',
  blurb:
    'Google Drive (v3). The adaptor authenticates with a Bearer access token and calls the Drive Files resource: list, get, create and update files and folders. Folders are files with the application/vnd.google-apps.folder mimeType.',
  auth: 'API key (Bearer access token)',
  examples: [
    { id: 'listFiles', method: 'GET', path: '/drive/v3/files', label: 'List files' },
    {
      id: 'createFile',
      method: 'POST',
      path: '/drive/v3/files',
      label: 'Create a file/folder',
      body: JSON.stringify(
        { name: 'New Folder', mimeType: 'application/vnd.google-apps.folder' },
        null,
        2
      ),
    },
    {
      id: 'getFile',
      method: 'GET',
      path: '/drive/v3/files/file_seed01',
      label: 'Get a file',
    },
    {
      id: 'updateFile',
      method: 'PATCH',
      path: '/drive/v3/files/file_seed01',
      label: 'Update file metadata',
      body: JSON.stringify({ name: 'Renamed.pdf' }, null, 2),
    },
    {
      id: 'uploadFile',
      method: 'POST',
      path: '/upload/drive/v3/files?uploadType=multipart',
      label: 'Upload a file (metadata + content, multipart/related)',
      contentType: 'multipart/related; boundary=openfn',
      body: [
        '--openfn',
        'Content-Type: application/json; charset=UTF-8',
        '',
        '{"name":"monthly-report.txt","parents":["folder_seed01"]}',
        '--openfn',
        'Content-Type: text/plain',
        '',
        'Hello, world!',
        '--openfn--',
        '',
      ].join('\r\n'),
    },
    {
      id: 'replaceContent',
      method: 'PATCH',
      path: '/upload/drive/v3/files/file_seed01?uploadType=multipart',
      label: "Replace a file's content",
      contentType: 'multipart/related; boundary=openfn',
      body: [
        '--openfn',
        'Content-Type: application/json; charset=UTF-8',
        '',
        '{}',
        '--openfn',
        'Content-Type: text/plain',
        '',
        'Hello again!',
        '--openfn--',
        '',
      ].join('\r\n'),
    },
  ],
};
