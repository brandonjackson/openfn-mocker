import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the maximo system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed data
 * and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the sandbox
 * and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'IBM Maximo',
  docs: 'https://docs.openfn.org/adaptors/packages/maximo-docs',
  blurb:
    'IBM Maximo asset management, over its OSLC / JSON REST API. Business objects are exposed as object structures (mxasset for assets, mxwo for work orders) under /oslc/os/<os>; GET returns a lean { member: [...] } collection, POST creates, and updates tunnel PATCH through POST with an x-methodoverride: PATCH header. Auth is a Base64 maxauth header (accept-all here). fetch reads a collection and re-posts it elsewhere; update (7.6) and update75 (7.5) patch a record.',
  auth: 'maxauth (Base64 user:pass)',
  examples: [
    {
      id: 'fetch-assets',
      method: 'GET',
      path: '/oslc/os/mxasset?oslc.select=assetnum,description,status&oslc.pageSize=5',
      label: 'Fetch assets as a lean member collection (fetch)',
    },
    { id: 'read-asset', method: 'GET', path: '/oslc/os/mxasset/11430', label: 'Read one asset by assetnum' },
    {
      id: 'create-wo',
      method: 'POST',
      path: '/oslc/os/mxwo',
      label: 'Create a work order',
      body: JSON.stringify({ wonum: '1050', description: 'Replace intake filter', siteid: 'BEDFORD', status: 'WAPPR', assetnum: '11430' }, null, 2),
    },
    {
      id: 'update-wo',
      method: 'POST',
      path: '/oslc/os/mxwo/1001',
      label: 'Update a work order (PATCH via x-methodoverride) — update / update75',
      body: JSON.stringify({ status: 'INPROG' }, null, 2),
    },
  ],
};
