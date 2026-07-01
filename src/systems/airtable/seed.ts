import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

export const DEFAULT_BASE_ID = 'appABC123';

const ALPHANUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Generate an Airtable record id: 'rec' + 14 alphanumeric chars. */
export function makeRecordId(): string {
  let out = 'rec';
  for (let i = 0; i < 14; i++) {
    out += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  }
  return out;
}

/** Wrap a fields object into a full Airtable record with id + createdTime. */
export function makeRecord(fields: Record<string, any>, createdTime?: string): Record<string, any> {
  return {
    id: makeRecordId(),
    createdTime: createdTime ?? new Date().toISOString(),
    fields: fields ?? {},
  };
}

const CONTACTS: Array<Record<string, any>> = [
  { Name: 'Jane Doe', Email: 'jane.doe@example.org', Phone: '+15555550101', Status: 'Active', Company: 'Ngelehun Clinic' },
  { Name: 'John Smith', Email: 'john.smith@example.org', Phone: '+15555550102', Status: 'Active', Company: 'Kailahun Health Post' },
  { Name: 'Amara Kamara', Email: 'amara.kamara@example.org', Phone: '+15555550103', Status: 'Lead', Company: 'District Office' },
  { Name: 'Fatmata Sesay', Email: 'fatmata.sesay@example.org', Phone: '+15555550104', Status: 'Active', Company: 'Bo Regional Hospital' },
  { Name: 'David Turay', Email: 'david.turay@example.org', Phone: '+15555550105', Status: 'Inactive', Company: 'Freetown CHC' },
  { Name: 'Mariama Bangura', Email: 'mariama.bangura@example.org', Phone: '+15555550106', Status: 'Active', Company: 'Makeni Clinic' },
  { Name: 'Ibrahim Conteh', Email: 'ibrahim.conteh@example.org', Phone: '+15555550107', Status: 'Lead', Company: 'District Office' },
  { Name: 'Grace Williams', Email: 'grace.williams@example.org', Phone: '+15555550108', Status: 'Active', Company: 'Kenema CHC' },
  { Name: 'Samuel Koroma', Email: 'samuel.koroma@example.org', Phone: '+15555550109', Status: 'Active', Company: 'Port Loko Health Post' },
  { Name: 'Aminata Jalloh', Email: 'aminata.jalloh@example.org', Phone: '+15555550110', Status: 'Inactive', Company: 'Ngelehun Clinic' },
];

const TASKS: Array<Record<string, any>> = [
  { Name: 'Follow up with Jane Doe', Status: 'Todo', Priority: 'High', DueDate: '2024-02-01', Assignee: 'fieldteam' },
  { Name: 'Schedule vaccination drive', Status: 'In Progress', Priority: 'High', DueDate: '2024-02-05', Assignee: 'caseworker1' },
  { Name: 'Restock clinic supplies', Status: 'Todo', Priority: 'Medium', DueDate: '2024-02-10', Assignee: 'logistics' },
  { Name: 'Review monthly report', Status: 'Done', Priority: 'Low', DueDate: '2024-01-28', Assignee: 'supervisor' },
  { Name: 'Train new field worker', Status: 'In Progress', Priority: 'Medium', DueDate: '2024-02-12', Assignee: 'fieldteam' },
  { Name: 'Update contact records', Status: 'Todo', Priority: 'Low', DueDate: '2024-02-15', Assignee: 'dataentry' },
  { Name: 'Verify GPS coordinates', Status: 'Todo', Priority: 'Medium', DueDate: '2024-02-18', Assignee: 'fieldteam' },
  { Name: 'Submit quarterly budget', Status: 'Done', Priority: 'High', DueDate: '2024-01-15', Assignee: 'finance' },
  { Name: 'Repair borehole pump', Status: 'In Progress', Priority: 'High', DueDate: '2024-02-08', Assignee: 'logistics' },
  { Name: 'Community outreach meeting', Status: 'Todo', Priority: 'Medium', DueDate: '2024-02-20', Assignee: 'caseworker1' },
];

/**
 * Seed two tables ("Contacts" and "Tasks"), 10 records each. Each collection is
 * keyed by its table name; records are stored as full Airtable records
 * ({ id, createdTime, fields }).
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  const base = Date.parse('2024-01-15T10:00:00.000Z');
  const dayMs = 86_400_000;

  CONTACTS.forEach((fields, i) => {
    const rec = makeRecord(fields, new Date(base + i * dayMs).toISOString());
    store.create('Contacts', rec.id, rec);
  });

  TASKS.forEach((fields, i) => {
    const rec = makeRecord(fields, new Date(base + i * 3_600_000).toISOString());
    store.create('Tasks', rec.id, rec);
  });
}
