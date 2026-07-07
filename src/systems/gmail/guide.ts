import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the gmail system. Paths mirror the Gmail API v1
 * users.messages resource the adaptor calls (via the googleapis client). Listings
 * use `{ messages: [{ id, threadId }], resultSizeEstimate }`; a single message is
 * a full resource with `payload.headers` and `payload.parts`. Bearer access-token
 * auth.
 */
export const guide: SystemGuide = {
  title: 'Gmail',
  docs: 'https://docs.openfn.org/adaptors/packages/gmail-docs',
  blurb:
    'Gmail API v1. The adaptor authenticates with a Bearer access token and calls the users.messages resource: list message ids (optionally by search query), read a full message (headers + body + attachments), fetch an attachment, and send a message. Message bodies and attachment bytes are base64url-encoded, as the real API returns them.',
  auth: 'API key (Bearer access token)',
  examples: [
    {
      id: 'listMessages',
      method: 'GET',
      path: '/gmail/v1/users/me/messages?q=subject:immunization',
      label: 'List message ids (filtered by search query)',
    },
    {
      id: 'getMessage',
      method: 'GET',
      path: '/gmail/v1/users/me/messages/msg_seed01?format=full',
      label: 'Read a full message (headers, body, attachment parts)',
    },
    {
      id: 'getAttachment',
      method: 'GET',
      path: '/gmail/v1/users/me/messages/msg_seed01/attachments/att_seed01',
      label: 'Fetch an attachment’s base64url bytes',
    },
    {
      id: 'sendMessage',
      method: 'POST',
      path: '/gmail/v1/users/me/messages/send',
      label: 'Send a message (base64url-encoded raw MIME)',
      body: JSON.stringify(
        { raw: 'VG86IHJlY2lwaWVudEBleGFtcGxlLm9yZw0KU3ViamVjdDogVGVzdA0KDQpIZWxsbyE' },
        null,
        2
      ),
    },
  ],
};
