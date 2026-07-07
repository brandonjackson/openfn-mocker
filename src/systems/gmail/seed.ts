import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Gmail API v1 seed. Seeds a couple of received messages in the `me` mailbox so
 * `getContentsFromMessages` returns data on first boot, plus one attachment so
 * the `file` content type resolves. Each record is a full `format=full` message
 * resource: `payload.headers` (From/To/Subject/Date) and `payload.parts` (a
 * `multipart/alternative` text body plus an attachment part). `sendMessage`
 * appends further records to the same collection at request time.
 *
 * Bodies and attachment bytes are stored base64url-encoded, exactly as the real
 * Gmail API returns them, so the adaptor's `Buffer.from(data, 'base64')` decode
 * yields the original text.
 */

/** Encode text as Gmail's URL-safe base64 (what the API returns for body/attachment data). */
function b64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url');
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const messages = [
    {
      id: 'msg_seed01',
      threadId: 'thread_seed01',
      labelIds: ['INBOX', 'UNREAD'],
      snippet: 'Please find attached the December immunization coverage figures.',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'Aminata Kamara <a.kamara@moh.gov.sl>' },
          { name: 'To', value: 'reports@openfn.org' },
          { name: 'Subject', value: 'Monthly immunization coverage report' },
          { name: 'Date', value: 'Mon, 06 Jan 2025 09:15:00 +0000' },
        ],
        parts: [
          {
            partId: '0',
            mimeType: 'multipart/alternative',
            parts: [
              {
                partId: '0.0',
                mimeType: 'text/plain',
                body: {
                  size: 63,
                  data: b64('Please find attached the December immunization coverage figures.'),
                },
              },
            ],
          },
          {
            partId: '1',
            mimeType: 'text/csv',
            filename: 'coverage.csv',
            body: { attachmentId: 'att_seed01', size: 48 },
          },
        ],
      },
    },
    {
      id: 'msg_seed02',
      threadId: 'thread_seed02',
      labelIds: ['INBOX'],
      snippet: 'Cold-chain equipment maintenance is scheduled for next week.',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'Ibrahim Sesay <i.sesay@moh.gov.sl>' },
          { name: 'To', value: 'reports@openfn.org' },
          { name: 'Subject', value: 'Cold chain maintenance schedule' },
          { name: 'Date', value: 'Wed, 08 Jan 2025 14:42:00 +0000' },
        ],
        parts: [
          {
            partId: '0',
            mimeType: 'multipart/alternative',
            parts: [
              {
                partId: '0.0',
                mimeType: 'text/plain',
                body: {
                  size: 60,
                  data: b64('Cold-chain equipment maintenance is scheduled for next week.'),
                },
              },
            ],
          },
        ],
      },
    },
  ];
  for (const m of messages) store.create('messages', m.id, m);

  // Attachment bodies are fetched separately (messages.attachments.get), keyed
  // by the attachmentId referenced in the message part above.
  store.create('attachments', 'att_seed01', {
    attachmentId: 'att_seed01',
    size: 48,
    data: b64('district,coverage\nWestern Area,0.91\nBo,0.87\n'),
  });
}
