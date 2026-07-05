import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the wigal-sms system: its blurb and the runnable example
 * request shown on the sandbox "API" tab. Referenced by the usage example's
 * `apiRef` cross-link.
 */
export const guide: SystemGuide = {
  title: 'Wigal SMS (Frog API)',
  docs: 'https://docs.openfn.org/adaptors/packages/wigal-sms-docs',
  blurb:
    'Bulk & personalized SMS for Ghana. sendSms → POST /api/v3/sms/send with API-KEY and USERNAME headers, returning { status: "ACCEPTED", message: "Message Accepted For Processing" }. A destination can carry its own message and msgid for personalized sends.',
  auth: 'API key (API-KEY + USERNAME headers)',
  examples: [
    {
      id: 'send',
      method: 'POST',
      path: '/api/v3/sms/send',
      label: 'Send an SMS (sendSms)',
      body: JSON.stringify(
        { senderid: 'OpenFn', destinations: [{ destination: '233201234567' }], message: 'Your appointment is tomorrow', smstype: 'text' },
        null,
        2
      ),
    },
  ],
};
