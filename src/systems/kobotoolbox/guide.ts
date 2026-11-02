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
    'Survey platform. Assets (forms) and their submissions use DRF { count, next, previous, results } envelopes; submission counts are live. getForms, getSubmissions (?query=/?sort=), getDeploymentInfo and generic http.* asset/data operations are all covered. Collected data reaches KoboToolbox through KoboCAT/OpenRosa, so /api/v2 has no JSON submit endpoint: the write paths here are bulk-edit, duplicate and delete. aMarketPrice04 is a draft (never deployed) for the deploy examples.',
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
      path: '/api/v2/assets/aHousehold01Q1/data/12001/duplicate/',
      label: 'Duplicate a submission: a copy with a new _id, read-back-able',
    },
    {
      id: 'attachmentDownload',
      method: 'GET',
      path: '/api/v2/assets/aHousehold01Q1/data/12001/attachments/300001/',
      label: 'Download a submission attachment (bytes)',
    },
    {
      method: 'GET',
      path: '/api/v2/assets/aHousehold01Q1/data/12002/',
      label: 'Single submission by _id',
    },
    {
      id: 'bulkUpdate',
      method: 'PATCH',
      path: '/api/v2/assets/aHousehold01Q1/data/bulk/',
      label: 'Bulk-edit submissions: each comes back as a new instance (new _uuid)',
      body: JSON.stringify(
        { payload: { submission_ids: [12002, 12003], data: { water_source: 'piped' } } },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/api/v2/assets/',
      label: 'Create a draft survey asset (201)',
      body: JSON.stringify(
        {
          name: 'Nutrition Screening',
          asset_type: 'survey',
          settings: { description: 'MUAC screening', sector: 'Public Health', country: 'SLE' },
        },
        null,
        2
      ),
    },
    {
      method: 'PATCH',
      path: '/api/v2/assets/aMarketPrice04/',
      label: 'Rename a draft and replace its form content',
      body: JSON.stringify(
        {
          name: 'Market Price Survey',
          content: JSON.stringify({
            survey: [{ type: 'text', name: 'commodity', label: ['Commodity'] }],
          }),
        },
        null,
        2
      ),
    },
    {
      id: 'putAsset',
      method: 'PUT',
      path: '/api/v2/assets/aMarketPrice04/',
      label: 'Full update of an asset (PUT needs asset_type)',
      body: JSON.stringify({ name: 'Market Price Survey 2024', asset_type: 'survey' }, null, 2),
    },
    {
      method: 'POST',
      path: '/api/v2/assets/aMarketPrice04/deployment/',
      label: 'Deploy the draft (a second POST is 405: use PATCH)',
      body: JSON.stringify({ active: true }, null, 2),
    },
    {
      method: 'PATCH',
      path: '/api/v2/assets/aWaterPoint03/deployment/',
      label: 'Archive a deployment (active: false)',
      body: JSON.stringify({ active: false }, null, 2),
    },
    {
      method: 'DELETE',
      path: '/api/v2/assets/aHousehold01Q1/data/12005/',
      label: 'Delete a submission (204)',
    },
    {
      method: 'DELETE',
      path: '/api/v2/assets/aMarketPrice04/',
      label: 'Delete an asset (204)',
    },
  ],
};
