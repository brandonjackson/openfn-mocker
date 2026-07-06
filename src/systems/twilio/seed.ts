import { randomBytes } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

export const DEFAULT_ACCOUNT_SID = 'ACtest123456';

/** Resolve the account SID from config (supports account_sid or accountSid). */
export function accountSidFrom(config: SystemConfig): string {
  return (config.account_sid as string) || (config.accountSid as string) || DEFAULT_ACCOUNT_SID;
}

/** Lowercase hex string of length `len`. */
export function randomHex(len: number): string {
  return randomBytes(Math.ceil(len / 2))
    .toString('hex')
    .slice(0, len);
}

/** Twilio resource SID: a 2-letter prefix + 32 hex chars (e.g. SM..., CA...). */
export function makeSid(prefix: string): string {
  return `${prefix}${randomHex(32)}`;
}

/** RFC 2822 date string in Twilio's `+0000` form (not "GMT"). */
export function rfc2822(date: Date): string {
  return date.toUTCString().replace('GMT', '+0000');
}

/**
 * Twilio's national-format display of a phone number. For a US +1 number it
 * returns `(305) 141-6799`; anything else is echoed unchanged. Real responses
 * carry both the E.164 `from`/`to` and these `*_formatted` variants.
 */
export function formatNumber(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export interface BuildMessageOpts {
  accountSid: string;
  from: string;
  to: string;
  body: string;
  status?: string;
  createdAt?: Date;
  sentAt?: Date | null;
  numSegments?: string;
  /** Twilio error code (integer) for a failed/undelivered message, e.g. 30003. */
  errorCode?: number;
  errorMessage?: string;
}

/** Build a Twilio Message resource (snake_case, as the API returns it). */
export function buildMessage(opts: BuildMessageOpts): Record<string, any> {
  const sid = makeSid('SM');
  const created = opts.createdAt ?? new Date();
  const status = opts.status ?? 'queued';
  const sent = opts.sentAt ?? (status === 'sent' || status === 'delivered' ? created : null);
  const priced = status === 'delivered' || status === 'undelivered';
  const base = `/2010-04-01/Accounts/${opts.accountSid}/Messages/${sid}`;
  return {
    sid,
    account_sid: opts.accountSid,
    from: opts.from,
    to: opts.to,
    body: opts.body,
    status,
    direction: 'outbound-api',
    num_segments: opts.numSegments ?? '1',
    num_media: '0',
    price: priced ? '-0.00750' : null,
    price_unit: 'USD',
    error_code: opts.errorCode ?? null,
    error_message: opts.errorMessage ?? null,
    date_created: rfc2822(created),
    date_updated: rfc2822(created),
    date_sent: sent ? rfc2822(sent) : null,
    messaging_service_sid: null,
    uri: `${base}.json`,
    api_version: '2010-04-01',
    // Every real Message carries a subresource_uris map to its Media/Feedback.
    subresource_uris: {
      media: `${base}/Media.json`,
      feedback: `${base}/Feedback.json`,
    },
  };
}

export interface BuildCallOpts {
  accountSid: string;
  from: string;
  to: string;
  duration: string;
  status?: string;
  createdAt?: Date;
}

/** Nine-key subresource_uris map a real Twilio Call resource always returns. */
function callSubresourceUris(base: string): Record<string, string> {
  return {
    notifications: `${base}/Notifications.json`,
    recordings: `${base}/Recordings.json`,
    payments: `${base}/Payments.json`,
    events: `${base}/Events.json`,
    siprec: `${base}/Siprec.json`,
    streams: `${base}/Streams.json`,
    transcriptions: `${base}/Transcriptions.json`,
    user_defined_message_subscriptions: `${base}/UserDefinedMessageSubscriptions.json`,
    user_defined_messages: `${base}/UserDefinedMessages.json`,
  };
}

/** Build a Twilio Call resource. */
export function buildCall(opts: BuildCallOpts): Record<string, any> {
  const sid = makeSid('CA');
  const created = opts.createdAt ?? new Date();
  const end = new Date(created.getTime() + Number(opts.duration) * 1000);
  const base = `/2010-04-01/Accounts/${opts.accountSid}/Calls/${sid}`;
  return {
    sid,
    account_sid: opts.accountSid,
    parent_call_sid: null,
    from: opts.from,
    from_formatted: formatNumber(opts.from),
    to: opts.to,
    to_formatted: formatNumber(opts.to),
    phone_number_sid: makeSid('PN'),
    status: opts.status ?? 'completed',
    start_time: rfc2822(created),
    end_time: rfc2822(end),
    duration: opts.duration,
    price: '-0.01300',
    price_unit: 'USD',
    direction: 'outbound-api',
    answered_by: null,
    forwarded_from: null,
    caller_name: null,
    group_sid: null,
    queue_time: '0',
    trunk_sid: null,
    date_created: rfc2822(created),
    date_updated: rfc2822(end),
    uri: `${base}.json`,
    api_version: '2010-04-01',
    subresource_uris: callSubresourceUris(base),
  };
}

/** Seed 5 messages (varied status/timestamps) and 2 calls. */
export function seed(store: DataStore, config: SystemConfig): void {
  const accountSid = accountSidFrom(config);
  const from = '+15005550006';
  const now = Date.now();
  const hour = 3_600_000;

  // A realistic mix of outcomes a real account sees, including one delivery
  // failure (error 30003 = unreachable destination handset).
  const messages: Array<{
    to: string;
    body: string;
    status: string;
    ageHours: number;
    errorCode?: number;
    errorMessage?: string;
  }> = [
    { to: '+15558675310', body: 'Your appointment is confirmed for tomorrow.', status: 'delivered', ageHours: 48 },
    { to: '+15558675311', body: 'Reminder: clinic visit at 10am.', status: 'delivered', ageHours: 24 },
    { to: '+15558675312', body: 'Your verification code is 483920.', status: 'sent', ageHours: 6 },
    {
      to: '+15558675313',
      body: 'Thank you for registering.',
      status: 'undelivered',
      ageHours: 2,
      errorCode: 30003,
      errorMessage: 'Unreachable destination handset',
    },
    { to: '+15558675314', body: 'Welcome to OpenFn SMS alerts.', status: 'queued', ageHours: 0 },
  ];

  for (const m of messages) {
    const createdAt = new Date(now - m.ageHours * hour);
    const rec = buildMessage({
      accountSid,
      from,
      to: m.to,
      body: m.body,
      status: m.status,
      createdAt,
      errorCode: m.errorCode,
      errorMessage: m.errorMessage,
    });
    store.create('messages', rec.sid, rec);
  }

  const calls: Array<{ to: string; duration: string; ageHours: number }> = [
    { to: '+15558675320', duration: '45', ageHours: 12 },
    { to: '+15558675321', duration: '128', ageHours: 3 },
  ];

  for (const c of calls) {
    const createdAt = new Date(now - c.ageHours * hour);
    const rec = buildCall({ accountSid, from, to: c.to, duration: c.duration, createdAt });
    store.create('calls', rec.sid, rec);
  }
}
