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
  seedValidations(store);
}

const ROLE_LOCALS = new Set(['admin', 'info', 'support', 'sales', 'noreply', 'no-reply', 'postmaster', 'office', 'contact']);
const DISPOSABLE_DOMAINS = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'trashmail.com']);
const TYPO_DOMAINS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
};

/**
 * A Validations API v4 single-address result (`ValidationResponse`). Mailgun
 * scores mailbox existence with SMTP probes; the mock is deterministic instead:
 * a malformed address or `.invalid` domain is undeliverable, a disposable or
 * role address is risky, a known typo domain carries `did_you_mean`.
 */
export function validateAddress(address: string) {
  const at = address.lastIndexOf('@');
  const local = at > 0 ? address.slice(0, at).toLowerCase() : '';
  const domain = at > 0 ? address.slice(at + 1).toLowerCase() : '';
  const wellFormed = at > 0 && /^[^\s@]+$/.test(local) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain);
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  const isRole = ROLE_LOCALS.has(local);
  const reason: string[] = [];
  let result = 'deliverable';
  let risk = 'low';
  if (!wellFormed) {
    reason.push('malformed address; failed parse');
    result = 'do_not_send';
    risk = 'high';
  } else if (domain.endsWith('.invalid')) {
    reason.push('no_mx');
    result = 'undeliverable';
    risk = 'high';
  } else if (isDisposable) {
    reason.push('disposable_address');
    result = 'do_not_send';
    risk = 'high';
  } else if (isRole) {
    reason.push('role_address');
    risk = 'medium';
  }
  const suggestion = TYPO_DOMAINS[domain];
  return {
    address,
    ...(suggestion ? { did_you_mean: `${local}@${suggestion}` } : {}),
    is_disposable_address: isDisposable,
    is_role_address: isRole,
    reason,
    result,
    risk,
    ...(wellFormed ? { root_address: `${local.split('+')[0]}@${domain}` } : {}),
  };
}

/** A bulk validation job (`GetResponse` of GET /v4/address/validate/bulk/{list_id}). */
export function makeBulkJob(id: string, emails: string[], baseUrl: string, createdAt = Math.floor(Date.now() / 1000)) {
  const result = { deliverable: 0, undeliverable: 0, do_not_send: 0, catch_all: 0, unknown: 0, accept_all: 0 };
  const risk = { low: 0, medium: 0, high: 0, unknown: 0 };
  for (const e of emails) {
    const r = validateAddress(e);
    result[r.result as keyof typeof result]++;
    risk[r.risk as keyof typeof risk]++;
  }
  return {
    id,
    created_at: createdAt,
    quantity: emails.length,
    records_processed: emails.length,
    status: 'uploaded',
    is_preview: false,
    download_url: {
      csv: `${baseUrl}/v4/address/validate/bulk/${encodeURIComponent(id)}/results.csv`,
      json: `${baseUrl}/v4/address/validate/bulk/${encodeURIComponent(id)}/results.json`,
    },
    summary: {
      result,
      risk,
      engagement: { highly_engaged: 0, engaged: 0, disengaged: 0, bot: 0, complainer: 0, no_data: emails.length },
    },
  };
}

/** The email column of an uploaded bulk-validation CSV (header row required). */
export function emailsFromCsv(body: string): string[] {
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  const header = lines.findIndex((l) => /(^|,)"?email"?(,|$)/i.test(l));
  if (header < 0) return [];
  const col = lines[header].split(',').findIndex((c) => /^"?email"?$/i.test(c));
  const out: string[] = [];
  for (const line of lines.slice(header + 1)) {
    if (!line || line.startsWith('--')) break; // end of the multipart part
    const v = line.split(',')[col]?.replace(/^"|"$/g, '');
    if (v) out.push(v);
  }
  return out;
}

/** Seed one finished bulk validation job so GET /v4/address/validate/bulk/{list_id} has something to show. */
export function seedValidations(store: DataStore): void {
  const job = makeBulkJob(
    'volunteer-emails-2026',
    ['jane.doe@example.org', 'john.smith@example.org', 'info@example.org', 'temp@mailinator.com', 'ghost@nowhere.invalid'],
    'https://api.mailgun.net',
    1_767_225_600
  );
  store.create('validations', job.id, job);
}
