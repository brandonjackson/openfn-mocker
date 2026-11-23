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
      path: '/v4/address/validate?address=jane.doe@example.org',
      label: 'Validate one email address (Validate API)',
    },
    {
      method: 'POST',
      path: '/v4/address/validate/bulk/new-signups',
      label: 'Start a bulk validation job (CSV upload)',
      contentType: 'multipart/form-data; boundary=openfn',
      body: [
        '--openfn',
        'Content-Disposition: form-data; name="file"; filename="emails.csv"',
        'Content-Type: text/csv',
        '',
        'email',
        'jane.doe@example.org',
        'info@example.org',
        'someone@mailinator.com',
        '--openfn--',
      ].join('\r\n'),
    },
    {
      method: 'GET',
      path: '/v4/address/validate/bulk/volunteers-2026',
      label: 'Bulk validation job status and summary',
    },
    { id: 'listLists', method: 'GET', path: '/v3/lists/pages?limit=100', label: 'List mailing lists' },
    {
      id: 'addListMember',
      method: 'POST',
      path: '/v3/lists/volunteers@mg.example.org/members',
      label: 'Add (or update) a mailing list member',
      contentType: FORM,
      body: 'address=amina.yusuf@example.org&name=Amina+Yusuf&subscribed=yes&upsert=yes',
    },
  ],
};
