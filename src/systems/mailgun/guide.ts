import type { SystemGuide } from '../types.js';

const FORM = 'application/x-www-form-urlencoded';

/**
 * Sandbox guide for the mailgun system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'Mailgun',
  docs: 'https://docs.openfn.org/adaptors/packages/mailgun-docs',
  blurb:
    'Transactional email. Sending an email also synthesizes a delivered event so it shows up in the events feed. Email validation (single and bulk) is served too, as the mailgun.js client on state.client calls it.',
  auth: 'Basic (api:key)',
  vars: { domain: 'sandbox-test.mailgun.org' },
  examples: [
    {
      method: 'POST',
      path: '/v3/{{domain}}/messages',
      label: 'Send an email (form-encoded): also creates a delivered event',
      contentType: FORM,
      body:
        'from=Mailgun+Sandbox+<postmaster@{{domain}}>' +
        '&to=jane.doe@example.org&subject=Sandbox+test&text=Hello+from+openfn-mocker',
    },
    { method: 'GET', path: '/v3/{{domain}}/events', label: 'Events feed (delivered/opened/bounced)' },
    { method: 'GET', path: '/v3/{{domain}}/stats/total', label: 'Aggregate stats (last 7 days)' },
    {
      method: 'GET',
      path: '/v4/address/validate?address=jane.doe@example.org',
      label: 'Validate an email address (Validations API)',
    },
    {
      method: 'POST',
      path: '/v4/address/validate/bulk/new-signups',
      label: 'Start a bulk validation job from a CSV (email column)',
      contentType: 'text/csv',
      body: 'email\njane.doe@example.org\ninfo@example.org\nnot-an-address',
    },
    {
      method: 'GET',
      path: '/v4/address/validate/bulk/volunteer-emails-2026',
      label: 'Bulk validation job status and summary',
    },
  ],
};
