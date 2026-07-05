import type { UsageExample } from '../types.js';

/**
 * Usage examples for the ocl sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and
 * the records it reads stay together. Paths are adaptor-relative (combined with
 * the credential hostUrl) so no absolute URL appears. Rendered by the sandbox
 * and run end to end by `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  {
    fn: 'getMappings',
    signature: 'getMappings(ownerId, repositoryId, options, callback = false)',
    description: 'Fetch the mappings of an OCL repository (defaults to an org collection at HEAD).',
    code: "getMappings('DemoOrg', 'DemoCollection', {\n  ownerType: 'orgs',\n  repository: 'collections',\n  version: 'HEAD',\n});",
    apiRef: 'mappings',
  },
  {
    fn: 'get',
    signature: 'get(path, query, callback = false)',
    description: 'GET any OCL resource by path, e.g. the concepts of a source.',
    code: "get('orgs/DemoOrg/sources/DemoSource/concepts');",
    apiRef: 'concepts',
  },
];
