import type { UsageExample } from '../types.js';

/**
 * Usage examples for the twilio sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "sendSMS", signature: "sendSMS(params)", description: "Sends an SMS message from a Twilio number to another phone number.",
    code: "sendSMS({\n  body: 'Hello from OpenFn',\n  from: '+15005550006',\n  to: '+23276000000',\n});", apiRef: "ex0" },
];
