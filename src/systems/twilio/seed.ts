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

export interface BuildMessageOpts {
  accountSid: string;
  from: string;
  to: string;
  body: string;
  status?: string;
  createdAt?: Date;
  sentAt?: Date | null;
  numSegments?: string;
}

/** Build a Twilio Message resource (snake_case, as the API returns it). */
export function buildMessage(opts: BuildMessageOpts): Record<string, any> {
  const sid = makeSid('SM');
  const created = opts.createdAt ?? new Date();
  const status = opts.status ?? 'queued';
  const sent = opts.sentAt ?? (status === 'sent' || status === 'delivered' ? created : null);
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
    price: status === 'delivered' ? '-0.00750' : null,
    price_unit: 'USD',
    error_code: null,
    error_message: null,
    date_created: rfc2822(created),
    date_updated: rfc2822(created),
    date_sent: sent ? rfc2822(sent) : null,
    messaging_service_sid: null,
    uri: `/2010-04-01/Accounts/${opts.accountSid}/Messages/${sid}.json`,
    api_version: '2010-04-01',
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

/** Build a Twilio Call resource. */
export function buildCall(opts: BuildCallOpts): Record<string, any> {
  const sid = makeSid('CA');
  const created = opts.createdAt ?? new Date();
  const end = new Date(created.getTime() + Number(opts.duration) * 1000);
  return {
    sid,
    account_sid: opts.accountSid,
    from: opts.from,
    to: opts.to,
    status: opts.status ?? 'completed',
    start_time: rfc2822(created),
    end_time: rfc2822(end),
    duration: opts.duration,
    price: '-0.01300',
    price_unit: 'USD',
    direction: 'outbound-api',
    date_created: rfc2822(created),
    date_updated: rfc2822(end),
    uri: `/2010-04-01/Accounts/${opts.accountSid}/Calls/${sid}.json`,
    api_version: '2010-04-01',
  };
}

/** Seed 5 messages (varied status/timestamps) and 2 calls. */
export function seed(store: DataStore, config: SystemConfig): void {
  const accountSid = accountSidFrom(config);
  const from = '+15005550006';
  const now = Date.now();
  const hour = 3_600_000;

  const messages: Array<{ to: string; body: string; status: string; ageHours: number }> = [
    { to: '+15558675310', body: 'Your appointment is confirmed for tomorrow.', status: 'delivered', ageHours: 48 },
    { to: '+15558675311', body: 'Reminder: clinic visit at 10am.', status: 'delivered', ageHours: 24 },
    { to: '+15558675312', body: 'Your verification code is 483920.', status: 'sent', ageHours: 6 },
    { to: '+15558675313', body: 'Thank you for registering.', status: 'sent', ageHours: 2 },
    { to: '+15558675314', body: 'Welcome to OpenFn SMS alerts.', status: 'queued', ageHours: 0 },
  ];

  for (const m of messages) {
    const createdAt = new Date(now - m.ageHours * hour);
    const rec = buildMessage({ accountSid, from, to: m.to, body: m.body, status: m.status, createdAt });
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
