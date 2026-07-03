import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the http-generic system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'Generic HTTP',
  docs: 'https://docs.openfn.org/adaptors/packages/http-docs',
  blurb:
    'Spec-less catch-all: any path works. A POST turns its path into a collection and the response echoes your request under `_mock`.',
  auth: 'any',
  examples: [
    {
      method: 'POST',
      path: '/api/v1/referrals',
      label: 'POST anywhere: the path becomes a collection',
      body: JSON.stringify(
        { patient: 'Jane Doe', facility: 'Ngelehun CHC', urgency: 'high' },
        null,
        2
      ),
    },
    { method: 'GET', path: '/api/v1/referrals', label: 'List what you just posted' },
    { method: 'GET', path: '/anything/you/want', label: 'Any path returns a mock echo' },
  ],
};
