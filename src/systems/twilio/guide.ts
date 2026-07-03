import type { SystemGuide } from '../types.js';

const FORM = 'application/x-www-form-urlencoded';

/**
 * Sandbox guide for the twilio system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'Twilio',
  docs: 'https://docs.openfn.org/adaptors/packages/twilio-docs',
  blurb:
    'SMS + voice. Form-encoded PascalCase input, snake_case JSON output. Reading a single message auto-advances its status queued to sent to delivered.',
  auth: 'Basic (sid:token)',
  vars: { account_sid: 'ACtest123456' },
  examples: [
    {
      method: 'POST',
      path: '/2010-04-01/Accounts/{{account_sid}}/Messages.json',
      label: 'Send an SMS (form-encoded PascalCase): starts as queued',
      contentType: FORM,
      body: 'To=%2B15558675399&From=%2B15005550006&Body=Hello+from+openfn-mocker',
    },
    {
      method: 'GET',
      path: '/2010-04-01/Accounts/{{account_sid}}/Messages.json',
      label: 'List messages for the account',
    },
    {
      method: 'GET',
      path: '/2010-04-01/Accounts/{{account_sid}}/Calls.json',
      label: 'List calls for the account',
    },
  ],
};
