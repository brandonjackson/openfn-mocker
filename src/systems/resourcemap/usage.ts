import type { UsageExample } from '../types.js';

/**
 * Usage examples for the resourcemap sandbox "Usage" tab: the OpenFn job code for
 * each adaptor function, authored next to this system's seed data so a snippet
 * and the records it reads stay together. Rendered by the sandbox and run end to
 * end by `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  {
    fn: 'submitSite',
    signature: 'submitSite(collection_id, submissionData, callback = s => s)',
    description: 'Submit (create) a site into a Resource Map collection.',
    code:
      'submitSite(1, {\n' +
      "  name: 'Kigali Health Post',\n" +
      '  lat: -1.9536,\n' +
      '  lng: 30.0606,\n' +
      "  properties: { type: 'health_post', ownership: 'public' },\n" +
      '});',
    apiRef: 'submit',
  },
];
