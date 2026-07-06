import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the ibipimo system. Paths match the v1 lab-integration
 * endpoints the adaptor calls; requests are queued and results are polled via
 * POST, while sites and sample statuses are read with GET.
 */
export const guide: SystemGuide = {
  title: 'Ibipimo',
  docs: 'https://docs.openfn.org/adaptors/packages/ibipimo-docs',
  blurb:
    'Viral-load lab integration. The adaptor authenticates with a Bearer token and posts viral-load requests, polls for results, and reads the list of sites and sample statuses over a small v1 REST API.',
  auth: 'API key (Bearer token)',
  examples: [
    {
      id: 'postVl',
      method: 'POST',
      path: '/api/v1/post-viral-load-requests',
      label: 'Post a viral-load request',
      body: JSON.stringify({ sampleId: 'SMP-1001', patientId: 'PT-001', siteCode: 'ST-01' }, null, 2),
    },
    {
      id: 'getVl',
      method: 'POST',
      path: '/api/v1/ask-for-vl-results',
      label: 'Ask for viral-load results',
      body: JSON.stringify({ siteCode: 'ST-01' }, null, 2),
    },
    { id: 'sites', method: 'GET', path: '/api/v1/sites', label: 'List sites' },
    { id: 'samples', method: 'GET', path: '/api/v1/samples/status', label: 'List sample statuses' },
  ],
};
