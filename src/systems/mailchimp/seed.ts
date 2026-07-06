import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Mailchimp Marketing seed. Seeds one audience (list) and one member so reads
 * work on first boot; addMember / upsertMembers add to the same 'members'
 * collection. Member ids are the MD5 hash of the lowercased email (Mailchimp's
 * subscriber_hash) — the mock just uses a 32-char hex string.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/** 32-char hex subscriber hash (Mailchimp uses MD5 of the lowercased email). */
export function makeHash(): string {
  return randomUUID().replace(/-/g, '');
}

export function seed(store: DataStore, _config: SystemConfig): void {
  store.create('lists', 'list_seed01', {
    id: 'list_seed01',
    web_id: 100001,
    name: 'Newsletter',
    permission_reminder: 'You are receiving this email because you opted in.',
    date_created: nowIso(),
    stats: { member_count: 1, unsubscribe_count: 0, cleaned_count: 0 },
  });

  store.create('members', 'hashseed01', {
    id: 'hashseed01',
    email_address: 'ada@example.com',
    unique_email_id: 'uid00000001',
    status: 'subscribed',
    merge_fields: { FNAME: 'Ada', LNAME: 'Lovelace' },
    list_id: 'list_seed01',
    tags: [],
    timestamp_signup: nowIso(),
  });
}
