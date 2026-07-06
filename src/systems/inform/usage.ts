import type { UsageExample } from '../types.js';

/**
 * Usage examples for the inform sandbox "Usage" tab: listing/reading forms and
 * submissions, plus attachment metadata. downloadAttachment shares the media
 * endpoint with getAttachmentMetadata.
 */
export const usage: UsageExample[] = [
  {
    fn: 'getForms',
    signature: 'getForms(options?, callback?)',
    description: 'List deployed forms.',
    code: 'getForms();',
    apiRef: 'getForms',
  },
  {
    fn: 'getForm',
    signature: 'getForm(formId, callback?)',
    description: 'Fetch a single form by id.',
    code: "getForm('6225');",
    apiRef: 'getForm',
  },
  {
    fn: 'getSubmissions',
    signature: 'getSubmissions(formId, options?, callback?)',
    description: 'List submissions for a form.',
    code: "getSubmissions('6225', { limit: 10 });",
    apiRef: 'getSubs',
  },
  {
    fn: 'getSubmission',
    signature: 'getSubmission(formId, submissionId, callback?)',
    description: 'Fetch a single submission by id.',
    code: "getSubmission('6225', '7783155');",
    apiRef: 'getSub',
  },
  {
    fn: 'getAttachmentMetadata',
    signature: 'getAttachmentMetadata(attachmentId, callback?)',
    description: 'Fetch metadata for a submission attachment.',
    code: "getAttachmentMetadata('621985');",
    apiRef: 'media',
  },
];
