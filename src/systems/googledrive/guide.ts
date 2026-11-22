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
      label: 'Upload a file with content (what create() sends)',
      contentType: 'multipart/related; boundary=openfn',
      body: [
        '--openfn',
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify({ name: 'stock-report.csv', mimeType: 'text/csv' }),
        '--openfn',
        'Content-Type: text/csv',
        '',
        'facility,item,qty',
        'F001,ORS,120',
        '--openfn--',
      ].join('\r\n'),
    },
    {
      id: 'replaceFileContent',
      method: 'PATCH',
      path: '/upload/drive/v3/files/file_seed01?uploadType=media',
      label: "Replace a file's content (what update() sends)",
      contentType: 'text/csv',
      body: 'facility,item,qty\nF001,ORS,95',
    },
  ],
};
