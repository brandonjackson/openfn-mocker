import type { UsageExample } from '../types.js';

/**
 * Usage examples for the wigal-sms sandbox "Usage" tab. The API-KEY / USERNAME
 * credentials travel in headers, so they never appear in these snippets.
 */
export const usage: UsageExample[] = [
  { fn: 'sendSms', signature: 'sendSms(data, callback = s => s)', description: 'Send an SMS through the Wigal Frog gateway to one or more destinations.',
    code: "sendSms({\n  senderid: 'OpenFn',\n  destinations: [{ destination: '233201234567' }],\n  message: 'Your appointment is tomorrow',\n  smstype: 'text'\n});", apiRef: 'send' },
];
