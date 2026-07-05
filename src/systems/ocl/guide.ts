import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the ocl system: its blurb and the runnable example requests
 * shown on the sandbox "API" tab. Co-located with this system's seed data and
 * imported onto the plugin (`MockSystemPlugin.guide`); rendered by the sandbox
 * and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'OpenConceptLab (OCL)',
  docs: 'https://docs.openfn.org/adaptors/packages/ocl-docs',
  blurb:
    'Open terminology management. The ocl adaptor reads the OCL REST API where concepts and mappings nest under an owner (org/user) and a repository (source/collection): get() fetches any path (e.g. orgs/<org>/sources/<src>/concepts) and getMappings() resolves orgs/<org>/collections/<coll>/HEAD/mappings. List endpoints return bare JSON arrays.',
  auth: 'Token',
  examples: [
    {
      method: 'GET',
      path: '/orgs/DemoOrg/collections/DemoCollection/HEAD/mappings',
      label: 'Mappings in a collection (getMappings)',
      id: 'mappings',
    },
    {
      method: 'GET',
      path: '/orgs/DemoOrg/sources/DemoSource/concepts',
      label: 'Concepts in a source (get)',
      id: 'concepts',
    },
    {
      method: 'GET',
      path: '/orgs/DemoOrg/sources/DemoSource',
      label: 'Source metadata',
      id: 'source',
    },
    { method: 'GET', path: '/orgs/DemoOrg/sources', label: 'List an org’s sources' },
    { method: 'GET', path: '/orgs/DemoOrg', label: 'Organization metadata' },
  ],
};
