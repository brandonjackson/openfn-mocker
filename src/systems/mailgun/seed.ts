import { randomBytes } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

export const DEFAULT_DOMAIN = 'sandbox-test.mailgun.org';

/** Lowercase hex string of length `len`. */
export function randomHex(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** URL-safe base64 token, the form Mailgun uses for an event `id`. */
export function eventId(): string {
  return randomBytes(16).toString('base64url');
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
  url?: string; // clicked link (clicked events)
}

const SENDING_IP = '209.61.151.66';

/** Delivery-status block for a delivered event (SMTP 250, one attempt). */
function deliveredStatus() {
  return {
    'attempt-no': 1,
    code: 250,
    message: 'OK',
    description: '',
    'session-seconds': 0.43,
    'mx-host': 'mxa.example.com',
    tls: true,
    'certificate-verified': true,
    utf8: true,
  };
}

/** Delivery-status block for a failed event (previously-bounced address). */
function failedStatus() {
  return {
    'attempt-no': 1,
    code: 605,
    message: '',
    description: 'Not delivering to previously bounced address',
    'session-seconds': 0,
  };
}

/** Sender/target envelope Mailgun records on accepted/delivered/failed. */
function envelope(sender: string, target: string) {
  return { transport: 'smtp', sender, 'sending-ip': SENDING_IP, targets: target };
}

/** Message-store pointer Mailgun records on accepted/delivered/failed/stored. */
function storage(domain: string, key: string) {
  return {
    key,
    url: `https://storage.api.mailgun.net/v3/domains/${domain}/messages/${key}`,
    region: 'us-east4',
    env: 'production',
  };
}

/** Browser/OS fingerprint Mailgun records on opened/clicked/unsubscribed. */
function clientInfo() {
  return {
    'client-type': 'browser',
    'client-os': 'Linux',
    'device-type': 'desktop',
    'client-name': 'Chrome',
    'user-agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  };
}

/** Approximate open/click location Mailgun records on engagement events. */
function geolocation() {
  return { country: 'SL', region: 'Southern', city: 'Bo' };
}

/** Log level Mailgun assigns to each event category. */
function logLevel(event: string): string {
  if (event === 'failed' || event === 'rejected') return 'error';
  if (event === 'complained' || event === 'unsubscribed') return 'warn';
  return 'info';
}

/**
 * Build a Mailgun events-API item (`EventResponse`), shaped per event type the
 * way the live API returns it: common envelope fields on every event, plus
 * delivery-status/envelope/storage on accepted/delivered/failed and
 * geolocation/client-info/ip on opened/clicked. Note Mailgun has no `bounced`
 * event — a bounce surfaces as `failed` with `severity: permanent`.
 */
export function makeEvent(opts: MakeEventOpts): Record<string, any> {
  const rawId = opts.messageId ?? makeMessageId(opts.domain);
  const messageId = rawId.replace(/^<|>$/g, '');
  const recipient = opts.recipient ?? 'recipient@example.org';
  const recipientDomain = recipient.split('@')[1] ?? 'example.org';
  const from = opts.from ?? `Mailgun Sandbox <postmaster@${opts.domain}>`;
  const subject = opts.subject ?? 'Hello';
  const size = 1024 + Math.floor(Math.random() * 4096);
  const storageKey = randomBytes(24).toString('base64url');

  const event: Record<string, any> = {
    id: eventId(),
    event: opts.event,
    timestamp: opts.timestamp ?? Date.now() / 1000,
    'log-level': logLevel(opts.event),
    recipient,
    'recipient-domain': recipientDomain,
    flags: { 'is-routed': false, 'is-authenticated': true, 'is-test-mode': false },
    tags: [],
    'user-variables': {},
    message: {
      headers: { 'message-id': messageId, from, to: recipient, subject },
      attachments: [],
      size,
    },
  };

  switch (opts.event) {
    case 'accepted':
      event.method = 'smtp';
      event.envelope = envelope(from, recipient);
      event.storage = storage(opts.domain, storageKey);
      break;
    case 'delivered':
      event['delivery-status'] = deliveredStatus();
      event.envelope = envelope(from, recipient);
      event.storage = storage(opts.domain, storageKey);
      event['recipient-provider'] = 'Gmail';
      break;
    case 'failed':
      event.severity = 'permanent';
      event.reason = 'suppress-bounce';
      event['delivery-status'] = failedStatus();
      event.envelope = envelope(from, recipient);
      event.storage = storage(opts.domain, storageKey);
      break;
    case 'stored':
      event.storage = storage(opts.domain, storageKey);
      break;
    case 'opened':
      event.ip = '41.223.60.10';
      event.geolocation = geolocation();
      event['client-info'] = clientInfo();
      break;
    case 'clicked':
      event.ip = '41.223.60.10';
      event.url = opts.url ?? 'https://openfn.org';
      event.geolocation = geolocation();
      event['client-info'] = clientInfo();
      break;
    default:
      break;
  }

  return event;
}

/** Baseline aggregate stats for the last 7 days. */
export function buildStats(): Record<string, any> {
  const now = new Date();
  const dayMs = 86_400_000;
  // Mailgun renders stats timestamps as RFC-2822 with a `UTC` suffix.
  const utc = (d: Date): string => d.toUTCString().replace('GMT', 'UTC');
  const stats: Array<Record<string, any>> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMs);
    stats.push({
      time: utc(d),
      accepted: { incoming: 0, outgoing: 12, total: 12 },
      delivered: { smtp: 11, http: 1, optimized: 0, total: 12 },
      failed: {
        temporary: { espblock: 0, total: 0 },
        permanent: {
          'suppress-bounce': 1,
          'suppress-unsubscribe': 0,
          'suppress-complaint': 0,
          bounce: 1,
          'delayed-bounce': 0,
          webhook: 0,
          optimized: 0,
          total: 1,
        },
      },
      opened: { total: 5, unique: 4 },
      clicked: { total: 2, unique: 2 },
    });
  }
  return {
    description: 'Aggregate stats',
    start: utc(new Date(now.getTime() - 7 * dayMs)),
    end: utc(now),
    resolution: 'day',
    stats,
  };
}

/**
 * Seed ~10 events (accepted/delivered/opened/clicked/failed/complained) plus
 * baseline stats. Uses config.domain (default 'sandbox-test.mailgun.org').
 */
export function seed(store: DataStore, config: SystemConfig): void {
  const domain = (config.domain as string) || DEFAULT_DOMAIN;
  const recipients = ['jane.doe@example.org', 'john.smith@example.org', 'clinic@example.org'];
  const sequence = [
    'accepted',
    'delivered',
    'opened',
    'delivered',
    'failed',
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
