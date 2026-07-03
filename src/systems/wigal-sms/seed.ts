import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Wigal SMS seed. A small history of already-sent messages so the store isn't
 * empty on boot (the adaptor only sends, so there is nothing to seed for reads).
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  const now = new Date().toISOString();
  const messages = [
    { msgid: 'MSG0000000001', senderid: 'OpenFn', destination: '233201234567', message: 'Welcome to the clinic', smstype: 'text', status: 'ACCEPTED', sentAt: now },
    { msgid: 'MSG0000000002', senderid: 'OpenFn', destination: '233209876543', message: 'Your appointment is tomorrow', smstype: 'text', status: 'ACCEPTED', sentAt: now },
  ];
  for (const m of messages) store.create('messages', m.msgid, m);
}
