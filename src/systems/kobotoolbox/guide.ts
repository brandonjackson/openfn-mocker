import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the kobotoolbox system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'KoboToolbox',
  docs: 'https://docs.openfn.org/adaptors/packages/kobotoolbox-docs',
  blurb:
    'Survey platform. Assets (forms) and their submissions use DRF { count, next, previous, results } envelopes; submission counts are live. getForms, getSubmissions (?query=/?sort=), getDeploymentInfo and generic http.* asset/data operations are all covered.',
  auth: 'Token',
  examples: [
    { method: 'GET', path: '/api/v2/assets/?asset_type=survey', label: 'Survey assets (getForms)' },
    {
      method: 'GET',
      path: '/api/v2/assets/aHousehold01Q1/',
      label: 'Single asset with live submission count',
    },
    {
      method: 'GET',
      path: '/api/v2/assets/aHousehold01Q1/deployment/',
      label: 'Deployment info (getDeploymentInfo)',
    },
    {
      method: 'GET',
      path: '/api/v2/assets/aHousehold01Q1/data/',
      label: 'Submissions for an asset',
    },
    {
      method: 'GET',
      path: '/api/v2/assets/aHousehold01Q1/data/?query={"water_source":"borehole"}',
      label: 'Filter submissions (getSubmissions ?query=)',
    },
    {
      method: 'POST',
      path: '/api/v2/assets/aHousehold01Q1/submissions/',
      label: 'Submit survey data: assigned a new _id, read-back-able',
      body: JSON.stringify(
        {
          household_head_name: 'Sandbox Household',
          household_size: 4,
          water_source: 'borehole',
          district: 'Bo',
        },
        null,
        2
      ),
    },
    {
      id: 'attachmentDownload',
      method: 'GET',
      path: '/api/v2/assets/aHousehold01Q1/data/12001/attachments/300001/',
      label: 'Download a submission attachment (bytes)',
    },
  ],
};
