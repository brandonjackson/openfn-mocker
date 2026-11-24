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
      label: 'Post viral-load requests for a site',
      body: JSON.stringify(
        {
          siteid: '77889900',
          samples: [
            {
              sidainfo_uid: '147461',
              p_code: '000011',
              p_name: 'Example',
              p_prename: 'Patient',
              p_sex: 'F',
              p_dob: '1985-03-12',
              reason_vl: 'suspicion_echec',
              on_arv: '1',
              sample_type: 'DBS',
              date_blood_taken: '2024-04-15 11:49:00',
              dateprelevement: '2024-04-15',
              site: '77889900',
              sidainfo_siteid: '77889900',
            },
          ],
        },
        null,
        2
      ),
    },
    {
      id: 'getVl',
      method: 'POST',
      path: '/api/v1/ask-for-vl-results',
      label: 'Ask for viral-load results by sample UID',
      body: JSON.stringify({ siteid: '77889900', sample_uids: ['IBI-2024-000001'] }, null, 2),
    },
    { id: 'sites', method: 'GET', path: '/api/v1/sites', label: 'List sites' },
    { id: 'samples', method: 'GET', path: '/api/v1/samples/status', label: 'List sample statuses' },
  ],
};
