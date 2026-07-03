import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the primero system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'Primero',
  docs: 'https://docs.openfn.org/adaptors/packages/primero-docs',
  blurb:
    'Child-protection case management. Business fields nest under `data`; lists use { data, metadata }. POST /api/v2/tokens exchanges a bearer token. Cases, case referrals, and the forms/lookups/locations reference data are all served.',
  auth: 'Token via POST /api/v2/tokens',
  examples: [
    {
      method: 'POST',
      path: '/api/v2/tokens',
      label: 'Token exchange: returns a bearer token',
      body: JSON.stringify({ user: { user_name: 'primero', password: 'mock' } }, null, 2),
    },
    { method: 'GET', path: '/api/v2/cases', label: 'Case list ({ data, metadata })' },
    { method: 'GET', path: '/api/v2/cases?query=Jane', label: 'Free-text search over case data' },
    { method: 'GET', path: '/api/v2/forms', label: 'Form definitions (getForms)' },
    { method: 'GET', path: '/api/v2/lookups', label: 'Lookup values (getLookups)' },
    { method: 'GET', path: '/api/v2/locations', label: 'Location hierarchy (getLocations)' },
    {
      method: 'POST',
      path: '/api/v2/cases',
      label: 'Create a case: server assigns a CP-YYYY-NNN display id',
      body: JSON.stringify(
        {
          data: {
            name_first: 'Sandbox',
            name_last: 'Child',
            age: 10,
            sex: 'female',
            protection_concerns: ['neglect'],
            risk_level: 'medium',
          },
        },
        null,
        2
      ),
    },
  ],
};
