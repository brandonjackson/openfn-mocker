import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the inform system. InForm is KoboToolbox/KPI-based: forms
 * and submissions come back in a { count, results } envelope, and the adaptor
 * calls bare resource paths under Token auth. Referenced by the usage examples'
 * `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'UNICEF InForm',
  docs: 'https://docs.openfn.org/adaptors/packages/inform-docs',
  blurb:
    'A KoboToolbox/KPI-based form deployment. The adaptor authenticates with a Token header and reads forms and submissions from bare resource paths (forms, data/:id), which return a { count, results } envelope.',
  auth: 'Token',
  examples: [
    { id: 'getForms', method: 'GET', path: '/api/v2/forms', label: 'List deployed forms' },
    { id: 'getForm', method: 'GET', path: '/api/v2/forms/6225', label: 'Fetch a form by id' },
    { id: 'getSubs', method: 'GET', path: '/api/v2/data/6225', label: 'List submissions for a form' },
    { id: 'getSub', method: 'GET', path: '/api/v2/data/6225/7783155', label: 'Fetch a submission by id' },
    { id: 'media', method: 'GET', path: '/api/v2/media/621985', label: 'Fetch attachment metadata' },
  ],
};
