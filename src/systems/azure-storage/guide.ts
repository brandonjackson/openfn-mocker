import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the azure-storage system. Paths follow the Blob Storage REST
 * surface `<container>/<blob>`. Only upload (PUT) and download (GET) are runnable
 * examples — the sandbox's example runner supports GET/POST/PUT/PATCH/DELETE but
 * not HEAD, so `getBlobProperties` links to the download example instead.
 */
export const guide: SystemGuide = {
  title: 'Azure Blob Storage',
  docs: 'https://docs.openfn.org/adaptors/packages/azure-storage-docs',
  blurb:
    'Azure Blob Storage. The adaptor PUTs/GETs blobs at <container>/<blob> (blob names may contain slashes) using a SharedKey signature. This mock keeps blob content in memory: PUT uploads (201, empty body), GET downloads the content, and HEAD returns the blob properties as headers. The SharedKey signature is not modeled, so any request is accepted.',
  auth: 'Shared Key (account name + key)',
  examples: [
    {
      id: 'upload',
      method: 'PUT',
      path: '/mock-container/hello.txt',
      label: 'Upload a block blob',
      body: 'Hello world',
      contentType: 'text/plain',
    },
    {
      id: 'download',
      method: 'GET',
      path: '/mock-container/hello.txt',
      label: 'Download a blob',
    },
  ],
};
