import type { UsageExample } from '../types.js';

/**
 * Usage examples for the gmail sandbox "Usage" tab: one entry per adaptor
 * function. `getContentsFromMessages` takes a single options object (query +
 * desired contents; defaults to from/date/subject) and lists then reads matching
 * messages; `sendMessage` takes a message object (or array) with to/subject/body
 * and optional attachments.
 */
export const usage: UsageExample[] = [
  {
    fn: 'getContentsFromMessages',
    signature: 'getContentsFromMessages(options)',
    description:
      'Search the mailbox and download contents (from/date/subject by default) from each matching message.',
    code: "getContentsFromMessages({ query: 'subject:immunization' });",
    apiRef: 'listMessages',
  },
  {
    fn: 'sendMessage',
    signature: 'sendMessage(message)',
    description: 'Send a Gmail message with subject, body, and optional attachments.',
    code: "sendMessage({ to: 'recipient@example.org', subject: 'Test Message', body: 'Hello from OpenFn!' });",
    apiRef: 'sendMessage',
  },
];
