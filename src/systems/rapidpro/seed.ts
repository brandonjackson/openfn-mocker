import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * RapidPro / TextIt seed (a messaging Digital Public Good). Seeds a couple of
 * flows, groups and custom fields plus a few contacts, matching the resources
 * the OpenFn rapidpro adaptor reads and writes (contacts, flow_starts,
 * broadcasts) over the /api/v2 DRF API.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const groups = [
    { uuid: 'grp-0001-anc', name: 'ANC Mothers', query: null, status: 'ready', system: false, count: 2 },
    { uuid: 'grp-0002-chw', name: 'Community Health Workers', query: null, status: 'ready', system: false, count: 1 },
  ];
  for (const g of groups) store.create('groups', g.uuid, g);

  const fields = [
    { key: 'district', name: 'District', type: 'text', featured: true, priority: 0, usages: { flows: 2, groups: 0, campaign_events: 0 }, agent_access: 'view', label: 'District', value_type: 'text' },
    { key: 'edd', name: 'Expected Delivery Date', type: 'datetime', featured: false, priority: 0, usages: { flows: 1, groups: 0, campaign_events: 1 }, agent_access: 'view', label: 'Expected Delivery Date', value_type: 'datetime' },
  ];
  for (const f of fields) store.create('fields', f.key, f);

  const flows = [
    { uuid: 'flow-0001-anc-reminder', name: 'ANC Appointment Reminder', type: 'message', archived: false, expires: 10080 },
    { uuid: 'flow-0002-registration', name: 'Patient Registration', type: 'message', archived: false, expires: 10080 },
    // UUID-keyed flows, for the usage snippets (the first is RapidPro's own docs example).
    { uuid: 'f5901b62-ba76-4003-9c62-72fdacc1b7b7', name: 'ANC Visit Reminders', type: 'message', archived: false, expires: 10080 },
    { uuid: '3c3f2b1a-9a43-4c8e-8e0c-5b1f0a6d2e71', name: 'Payment Confirmation Survey', type: 'survey', archived: false, expires: 4320 },
    { uuid: '7d2e9c4b-1f6a-4b3d-a8e5-2c9f0b7e6d14', name: 'CHW Monthly Check-in', type: 'message', archived: false, expires: 10080 },
  ];
  for (const f of flows) store.create('flows', f.uuid, f);

  const contacts = [
    { uuid: 'a052b00c-15b3-48e6-9771-edbaa277a353', name: 'Jane Doe', urns: ['tel:+23276000001'], groups: [{ uuid: 'grp-0001-anc', name: 'ANC Mothers' }], fields: { district: 'Bo' } },
    { name: 'Amina Kamara', urns: ['tel:+23276000002'], groups: [{ uuid: 'grp-0001-anc', name: 'ANC Mothers' }], fields: { district: 'Kenema' } },
    { name: 'Mohamed Sesay', urns: ['tel:+23276000003'], groups: [{ uuid: 'grp-0002-chw', name: 'Community Health Workers' }], fields: { district: 'Makeni' } },
  ];
  const contactRefs: Array<{ uuid: string; name: string }> = [];
  for (const c of contacts as Array<{ uuid?: string; name: string; urns: string[]; groups: any[]; fields: any }>) {
    // The first contact has a fixed uuid so usage snippets and guide examples can address it.
    const uuid = c.uuid ?? randomUUID();
    contactRefs.push({ uuid, name: c.name });
    store.create('contacts', uuid, {
      uuid,
      name: c.name,
      language: 'eng',
      urns: c.urns,
      groups: c.groups,
      fields: c.fields,
      blocked: false,
      stopped: false,
      created_on: nowIso(),
      modified_on: nowIso(),
    });
  }

  const labels = [
    { uuid: 'lbl-0001-followup', name: 'Follow up', count: 1 },
    { uuid: 'lbl-0002-reported', name: 'Reported', count: 0 },
  ];
  for (const l of labels) store.create('labels', l.uuid, l);

  store.create('campaigns', 'cmp-0001-anc', {
    uuid: 'cmp-0001-anc', name: 'ANC Reminders', archived: false,
    group: { uuid: 'grp-0001-anc', name: 'ANC Mothers' }, created_on: nowIso(),
  });

  const globals = [
    { key: 'org_name', name: 'Org Name', value: 'District Health Office', modified_on: nowIso() },
    { key: 'hotline', name: 'Hotline', value: '117', modified_on: nowIso() },
  ];
  for (const g of globals) store.create('globals', g.key, g);

  const channel = { uuid: 'chn-0001-sms', name: 'SMS Shortcode' };
  const [jane, amina] = contactRefs;
  const messages = [
    { id: 4001, contact: jane, urn: 'tel:+23276000001', direction: 'in', text: 'YES', labels: [{ uuid: 'lbl-0001-followup', name: 'Follow up' }], status: 'handled', flow: { uuid: 'flow-0001-anc-reminder', name: 'ANC Appointment Reminder' }, sent_on: null },
    { id: 4002, contact: jane, urn: 'tel:+23276000001', direction: 'out', text: 'Your ANC appointment is tomorrow at 9am.', labels: [], status: 'delivered', flow: { uuid: 'flow-0001-anc-reminder', name: 'ANC Appointment Reminder' }, sent_on: nowIso() },
    { id: 4003, contact: amina, urn: 'tel:+23276000002', direction: 'in', text: 'When is the clinic open?', labels: [], status: 'handled', flow: null, sent_on: null },
  ];
  for (const m of messages) {
    const uuid = randomUUID();
    store.create('messages', uuid, {
      uuid, ...m, channel, type: 'text', visibility: 'visible', archived: false,
      attachments: [], quick_replies: [], broadcast: null,
      created_on: nowIso(), modified_on: nowIso(),
    });
  }

  const runUuid = randomUUID();
  store.create('runs', runUuid, {
    uuid: runUuid, id: 9001,
    flow: { uuid: 'flow-0001-anc-reminder', name: 'ANC Appointment Reminder' },
    contact: jane, start: null, responded: true,
    path: [{ node: 'node-0001-ask', time: nowIso() }, { node: 'node-0002-confirm', time: nowIso() }],
    values: { confirmed: { name: 'Confirmed', value: 'yes', category: 'Yes', node: 'node-0001-ask', time: nowIso() } },
    created_on: nowIso(), modified_on: nowIso(), exited_on: nowIso(), exit_type: 'completed',
  });
}
