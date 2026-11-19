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
  { fn: "fn (state.client.validate.get)", signature: "fn(state => state.client.validate.get(address))",
    description: "Validate one email address with the mailgun.js client the adaptor sets up on state.client.",
    code: "fn(async state => {\n  const result = await state.client.validate.get('jane.doe@example.org');\n  return { ...state, data: result };\n});", apiRef: "validateAddress" },
  { fn: "fn (state.client.lists.members.createMember)", signature: "fn(state => state.client.lists.members.createMember(list, member))",
    description: "Add or update a mailing list member through the adaptor's mailgun.js client.",
    code: "fn(async state => {\n  const member = await state.client.lists.members.createMember('volunteers@mg.example.org', {\n    address: 'amina.yusuf@example.org', name: 'Amina Yusuf', subscribed: 'yes', upsert: 'yes',\n  });\n  return { ...state, data: member };\n});", apiRef: "addListMember" },
];
