import type { SystemGuide } from '../types.js';
import { PHONE_NUMBER_ID } from './seed.js';

const json = (v: unknown): string => JSON.stringify(v, null, 2);

/**
 * Sandbox guide for the whatsapp system. Every path is the one the adaptor's
 * `request(method, path, body)` builds: `<apiVersion>/<phoneNumberId>/<path>`.
 */
export const guide: SystemGuide = {
  title: 'WhatsApp Business Platform (Cloud API)',
  docs: 'https://docs.openfn.org/adaptors/packages/whatsapp-docs',
  blurb:
    "Meta's Graph API for WhatsApp. The adaptor has one function, request(method, path, body), which prefixes every path with the credential's apiVersion and phoneNumberId, so it reaches everything under the business phone number: messages, business profile, blocked users, QR-code deep links, registration and commerce settings. Responses follow Meta's own OpenAPI.",
  auth: 'Bearer (system user access token)',
  vars: { version: 'v22.0', phone_number_id: PHONE_NUMBER_ID },
  examples: [
    {
      id: 'send-text',
      method: 'POST',
      path: '/{{version}}/{{phone_number_id}}/messages',
      label: 'Send a text message (inside the 24-hour customer service window)',
      body: json({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '254712345678', type: 'text', text: { body: 'Your appointment is tomorrow at 10:00.' } }),
    },
    {
      id: 'send-template',
      method: 'POST',
      path: '/{{version}}/{{phone_number_id}}/messages',
      label: 'Send an approved template message (opens a conversation)',
      body: json({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '254712345678',
        type: 'template',
        template: {
          name: 'appointment_reminder',
          language: { code: 'en_US', policy: 'deterministic' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: 'Amina' }] }],
        },
      }),
    },
    {
      id: 'send-image',
      method: 'POST',
      path: '/{{version}}/{{phone_number_id}}/messages',
      label: 'Send an image by public link, with a caption',
      body: json({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '254712345678', type: 'image', image: { link: 'https://clinic.example.org/leaflets/malaria.png', caption: 'Malaria prevention tips' } }),
    },
    { id: 'phone-number', method: 'GET', path: '/{{version}}/{{phone_number_id}}', label: 'Get the business phone number (quality rating, verified name)' },
    { id: 'get-profile', method: 'GET', path: '/{{version}}/{{phone_number_id}}/whatsapp_business_profile', label: 'Get the business profile' },
    {
      id: 'update-profile',
      method: 'POST',
      path: '/{{version}}/{{phone_number_id}}/whatsapp_business_profile',
      label: 'Update the business profile',
      body: json({ messaging_product: 'whatsapp', about: 'Reminders and results from the OpenFn Clinic.', vertical: 'HEALTH' }),
    },
    { id: 'list-blocked', method: 'GET', path: '/{{version}}/{{phone_number_id}}/block_users', label: 'List blocked users' },
    {
      id: 'block',
      method: 'POST',
      path: '/{{version}}/{{phone_number_id}}/block_users',
      label: 'Block a user',
      body: json({ messaging_product: 'whatsapp', block_users: [{ user: '254733000333' }] }),
    },
    {
      id: 'unblock',
      method: 'DELETE',
      path: '/{{version}}/{{phone_number_id}}/block_users',
      label: 'Unblock a user',
      body: json({ messaging_product: 'whatsapp', block_users: [{ user: '254711000111' }] }),
    },
    { id: 'list-qr', method: 'GET', path: '/{{version}}/{{phone_number_id}}/message_qrdls', label: 'List QR-code deep links' },
    {
      id: 'create-qr',
      method: 'POST',
      path: '/{{version}}/{{phone_number_id}}/message_qrdls',
      label: 'Create a QR-code deep link with a prefilled message',
      body: json({ prefilled_message: 'Register for the vaccination drive', generate_qr_image: 'PNG' }),
    },
    { id: 'get-qr', method: 'GET', path: '/{{version}}/{{phone_number_id}}/message_qrdls/ANED2T5QRU7HGZ', label: 'Get one QR-code deep link' },
    { id: 'delete-qr', method: 'DELETE', path: '/{{version}}/{{phone_number_id}}/message_qrdls/WTPX3KQ7L2MN4B', label: 'Delete a QR-code deep link' },
    {
      id: 'request-code',
      method: 'POST',
      path: '/{{version}}/{{phone_number_id}}/request_code',
      label: 'Request a verification code by SMS',
      body: json({ code_method: 'SMS', language: 'en_US' }),
    },
    { id: 'verify-code', method: 'POST', path: '/{{version}}/{{phone_number_id}}/verify_code', label: 'Verify the phone number with the code', body: json({ code: '123456' }) },
    {
      id: 'register',
      method: 'POST',
      path: '/{{version}}/{{phone_number_id}}/register',
      label: 'Register the number for Cloud API messaging (two-step PIN)',
      body: json({ messaging_product: 'whatsapp', pin: '520311' }),
    },
    { id: 'deregister', method: 'POST', path: '/{{version}}/{{phone_number_id}}/deregister', label: 'Deregister the number' },
    { id: 'get-commerce', method: 'GET', path: '/{{version}}/{{phone_number_id}}/whatsapp_commerce_settings', label: 'Get commerce settings' },
    {
      id: 'set-commerce',
      method: 'POST',
      path: '/{{version}}/{{phone_number_id}}/whatsapp_commerce_settings?is_cart_enabled=true&is_catalog_visible=true',
      label: 'Turn on the cart and catalog',
    },
  ],
};
