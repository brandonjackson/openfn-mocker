import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the resourcemap system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'Resource Map',
  docs: 'https://docs.openfn.org/adaptors/packages/resourcemap-docs',
  blurb:
    'Facility & resource mapping organised into collections of sites. HTTP Basic auth. submitSite POSTs a site (name, lat/lng, properties) into a collection at /api/collections/:id/sites.json; the collection and site lists are read from the same /api/collections* surface.',
  auth: 'Basic',
  examples: [
    { id: 'collections', method: 'GET', path: '/api/collections.json', label: 'List collections' },
    { id: 'sites', method: 'GET', path: '/api/collections/1/sites.json', label: 'Sites in a collection' },
    {
      id: 'submit',
      method: 'POST',
      path: '/api/collections/1/sites.json',
      label: 'Submit a site (submitSite)',
      body: JSON.stringify({ name: 'Sandbox Health Post', lat: -1.9536, lng: 30.0606, properties: { type: 'health_post' } }, null, 2),
    },
  ],
};
