import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the godata system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'Go.Data',
  docs: 'https://docs.openfn.org/adaptors/packages/godata-docs',
  blurb:
    'WHO outbreak investigation platform. Token login via POST /users/login; list endpoints return bare arrays and a ?filter= JSON Loopback query looks records up. Outbreaks, cases, contacts, locations and reference-data are all served.',
  auth: 'Token via POST /users/login',
  examples: [
    {
      method: 'POST',
      path: '/users/login',
      label: 'Login: returns { id: <token> }',
      body: JSON.stringify({ email: 'api@who.int', password: 'mock' }, null, 2),
    },
    { method: 'GET', path: '/outbreaks', label: 'List outbreaks (bare array)' },
    { method: 'GET', path: '/outbreaks/ob-sl-covid19/cases', label: 'Cases for an outbreak' },
    {
      method: 'GET',
      path: '/outbreaks/ob-sl-covid19/cases?filter=%7B%22where%22%3A%7B%22firstName%22%3A%22Jane%22%7D%7D',
      label: 'Filter cases (?filter= Loopback where)',
    },
    { method: 'GET', path: '/locations', label: 'Location tree' },
    {
      method: 'POST',
      path: '/outbreaks/ob-sl-covid19/cases',
      label: 'Create a case (upsertCase)',
      body: JSON.stringify({ firstName: 'Sandbox', lastName: 'Case', gender: 'LNG_REFERENCE_DATA_CATEGORY_GENDER_FEMALE' }, null, 2),
    },
  ],
};
