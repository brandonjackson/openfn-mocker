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
    'Transactional email. Sending an email also synthesizes a delivered event so it shows up in the events feed.',
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
      path: '/v4/address/validate?address=jane.doe@gmial.com',
      label: 'Validate one address (a typo domain gets did_you_mean)',
    },
    {
      method: 'POST',
      path: '/v4/address/validate/bulk/new-signups',
      label: 'Start a bulk validation job from a CSV with an email column',
      contentType: 'multipart/form-data; boundary=mockerboundary',
      body:
        '--mockerboundary\r\n' +
        'Content-Disposition: form-data; name="file"; filename="emails.csv"\r\n' +
        'Content-Type: text/csv\r\n\r\n' +
        'email\r\njane.doe@example.org\r\ninfo@example.org\r\ntemp@mailinator.com\r\n' +
        '--mockerboundary--\r\n',
    },
    {
      method: 'GET',
      path: '/v4/address/validate/bulk/volunteer-emails-2026',
      label: 'Bulk validation job status, summary and result downloads',
    },
  ],
};
