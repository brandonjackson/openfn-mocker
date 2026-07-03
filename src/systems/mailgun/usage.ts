import type { UsageExample } from '../types.js';

/**
 * Usage examples for the mailgun sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "send", signature: "send(params)", description: "Send an email through Mailgun, optionally attaching a file from a URL or base64.",
    code: "send({\n  from: 'admin@openfn.org', to: 'jane.doe@example.org', subject: 'Welcome', text: 'Hello there!'\n});", apiRef: "ex0" },
];
