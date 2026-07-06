import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Salesforce seed. Seeds a couple of Account records and a Contact so that
 * `query`, `retrieve` and `describe` all work on first boot; `create`/`insert`
 * add to the same per-sObject collections. Ids are 18-char Salesforce Ids
 * (Accounts start with the `001` key prefix, Contacts with `003`).
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const accounts = [
    {
      Id: '001000000000001AAA',
      Name: 'Acme Inc',
      Industry: 'Technology',
      attributes: { type: 'Account' },
    },
    {
      Id: '001000000000002AAA',
      Name: 'Globex Corp',
      Industry: 'Manufacturing',
      attributes: { type: 'Account' },
    },
  ];
  for (const a of accounts) store.create('Account', a.Id, a);

  const contacts = [
    {
      Id: '003000000000001AAA',
      FirstName: 'Ada',
      LastName: 'Lovelace',
      Email: 'ada@example.com',
      attributes: { type: 'Contact' },
    },
  ];
  for (const c of contacts) store.create('Contact', c.Id, c);
}

/**
 * Generate an 18-character Salesforce Id: a 3-char key prefix (default `001`
 * for Account) followed by 15 alphanumeric characters. Real Ids are
 * case-safe base62 with a 3-char checksum suffix; the mock only needs the shape.
 */
export function makeSfId(prefix = '001'): string {
  const body = randomUUID().replace(/-/g, '').slice(0, 15);
  return prefix + body;
}
