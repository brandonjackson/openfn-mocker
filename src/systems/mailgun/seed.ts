import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

export const DEFAULT_DOMAIN = 'sandbox-test.mailgun.org';

/** Lowercase hex string of length `len`. */
export function randomHex(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** Mailgun-style Message-Id with angle brackets: `<timestamp.rand.rand@domain>`. */
export function makeMessageId(domain: string): string {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  return `<${stamp}.${randomHex(6)}.${randomHex(8)}@${domain}>`;
}

export interface MakeEventOpts {
  event: string;
  domain: string;
  recipient?: string;
  from?: string;
  subject?: string;
  messageId?: string; // may include angle brackets; stored header strips them
  timestamp?: number; // unix seconds
}

/** Build a Mailgun events-API item (matches the real API's field shape). */
export function makeEvent(opts: MakeEventOpts): Record<string, any> {
  const rawId = opts.messageId ?? makeMessageId(opts.domain);
  const messageId = rawId.replace(/^<|>$/g, '');
  const recipient = opts.recipient ?? 'recipient@example.org';
  const failed = opts.event === 'bounced' || opts.event === 'failed';
  return {
    id: randomUUID().replace(/-/g, ''),
    event: opts.event,
    timestamp: opts.timestamp ?? Date.now() / 1000,
    recipient,
    message: {
      headers: {
        'message-id': messageId,
        from: opts.from ?? `Mailgun Sandbox <postmaster@${opts.domain}>`,
        to: recipient,
        subject: opts.subject ?? 'Hello',
      },
    },
    'delivery-status': {
      code: failed ? 550 : 250,
      message: failed ? 'Mailbox does not exist' : '',
      description: failed ? 'The email account that you tried to reach does not exist.' : '',
    },
  };
}

/** Baseline aggregate stats for the last 7 days. */
export function buildStats(): Record<string, any> {
  const now = new Date();
  const dayMs = 86_400_000;
  const stats: Array<Record<string, any>> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMs);
    stats.push({
      time: d.toUTCString(),
      accepted: { outgoing: 12, incoming: 0, total: 12 },
      delivered: { smtp: 11, http: 1, total: 12 },
      failed: { permanent: { total: 1 }, temporary: { espblock: 0 } },
      opened: { total: 5 },
    });
  }
  return {
    start: new Date(now.getTime() - 7 * dayMs).toUTCString(),
    end: now.toUTCString(),
    resolution: 'day',
    stats,
  };
}

/**
 * Seed ~10 events (delivered/opened/bounced/clicked/complained) plus baseline
 * stats. Uses config.domain (default 'sandbox-test.mailgun.org').
 */
export function seed(store: DataStore, config: SystemConfig): void {
  const domain = (config.domain as string) || DEFAULT_DOMAIN;
  const recipients = ['jane.doe@example.org', 'john.smith@example.org', 'clinic@example.org'];
  const sequence = [
    'accepted',
    'delivered',
    'opened',
    'delivered',
    'bounced',
    'delivered',
    'opened',
    'clicked',
    'delivered',
    'complained',
  ];
  const now = Date.now();

  sequence.forEach((event, i) => {
    const ev = makeEvent({
      event,
      domain,
      recipient: recipients[i % recipients.length],
      timestamp: (now - i * 3_600_000) / 1000,
      subject: `Notification #${i + 1}`,
    });
    store.create('events', ev.id, ev);
  });

  store.create('stats', 'total', buildStats());
}
