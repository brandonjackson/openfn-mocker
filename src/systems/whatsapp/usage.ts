import type { UsageExample } from '../types.js';

/**
 * Usage examples for the whatsapp sandbox "Usage" tab. The adaptor's only
 * HTTP function is `request(method, path, body, options)`; it joins the
 * credential's apiVersion and phoneNumberId in front of `path`, so `path` is
 * relative to the business phone number ('messages', not '/v22.0/<id>/messages').
 */
export const usage: UsageExample[] = [
  {
    fn: 'request',
    signature: 'request(method, path, body, options?)',
    description: 'Send a text message to a WhatsApp user.',
    code: "request('POST', 'messages', {\n  messaging_product: 'whatsapp',\n  recipient_type: 'individual',\n  to: '254712345678',\n  type: 'text',\n  text: { body: 'Your appointment is tomorrow at 10:00.' },\n});",
    apiRef: 'send-text',
  },
  {
    fn: 'request',
    signature: 'request(method, path, body, options?)',
    description: 'Send an approved template message, which can start a conversation.',
    code: "request('POST', 'messages', {\n  messaging_product: 'whatsapp',\n  recipient_type: 'individual',\n  to: '254712345678',\n  type: 'template',\n  template: {\n    name: 'appointment_reminder',\n    language: { code: 'en_US', policy: 'deterministic' },\n    components: [{ type: 'body', parameters: [{ type: 'text', text: 'Amina' }] }],\n  },\n});",
    apiRef: 'send-template',
  },
  {
    fn: 'request',
    signature: 'request(method, path, body, options?)',
    description: "Read the business profile of the credential's phone number.",
    code: "request('GET', 'whatsapp_business_profile');",
    apiRef: 'get-profile',
  },
  {
    fn: 'request',
    signature: 'request(method, path, body, options?)',
    description: 'Block a user from messaging the business.',
    code: "request('POST', 'block_users', {\n  messaging_product: 'whatsapp',\n  block_users: [{ user: '254733000333' }],\n});",
    apiRef: 'block',
  },
];
