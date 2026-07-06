import type { UsageExample } from '../types.js';

/**
 * Usage examples for the azure-storage sandbox "Usage" tab: one entry per adaptor
 * function. `getBlobProperties` maps onto a HEAD request, which the sandbox's
 * runner cannot fire, so it cross-links to the download example instead.
 */
export const usage: UsageExample[] = [
  {
    fn: 'uploadBlob',
    signature: 'uploadBlob(blobName, content, options?)',
    description: 'Upload (create or overwrite) a block blob.',
    code: "uploadBlob('reports/summary.txt', 'file contents here');",
    apiRef: 'upload',
  },
  {
    fn: 'downloadBlob',
    signature: 'downloadBlob(blobName, options?)',
    description: 'Download the content of a blob.',
    code: "downloadBlob('reports/summary.txt');",
    apiRef: 'download',
  },
  {
    fn: 'getBlobProperties',
    signature: 'getBlobProperties(blobName, options?)',
    description: 'Fetch blob properties and metadata (size, last-modified, blob type).',
    code: "getBlobProperties('reports/summary.txt');",
    apiRef: 'download',
  },
];
