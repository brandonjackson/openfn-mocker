import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * SENAITE LIMS seed (Plone-based open-source laboratory information system).
 * SENAITE's JSON API returns catalog objects keyed by a 32-char hex UID and
 * tagged with a `portal_type` (Client, Contact, AnalysisRequest/sample,
 * AnalysisService, ...). A few realistic objects are seeded into one `objects`
 * collection so the senaite adaptor's search/get requests return data on boot.
 */

/** SENAITE UIDs are 32-char lowercase hex (a UUID with the dashes stripped). */
export function uid(): string {
  return randomUUID().replace(/-/g, '');
}

export function nowIso(): string {
  return new Date().toISOString();
}

interface SenaiteObject {
  uid: string;
  id: string;
  portal_type: string;
  title: string;
  [key: string]: any;
}

/** Seeded objects use stable UIDs so guide/usage examples can link to them. */
const CLIENT_BO = 'c1000000000000000000000000000001';
const CLIENT_KENEMA = 'c1000000000000000000000000000002';
const SAMPLE_WATER = 'a5000000000000000000000000000001';
const SERVICE_PH = '5e000000000000000000000000000001';

/** A registered portal type, as senaite.jsonapi's /types and /schema describe it. */
export interface PortalType {
  portal_type: string;
  title: string;
  description: string;
  meta_type: string | null;
  global_allow: boolean;
  add_permission: string | null;
  catalogs: string[];
  fields: { name: string; type: string; required: boolean; readonly: boolean; allowed_types?: string[]; multi_valued?: boolean }[];
}

const f = (name: string, type: string, required = false, extra: Record<string, any> = {}) => ({
  name,
  type,
  required,
  readonly: false,
  ...extra,
});

/** The handful of portal types the seeded objects use. */
export const PORTAL_TYPES: PortalType[] = [
  {
    portal_type: 'Client',
    title: 'Client',
    description: 'A customer of the laboratory that submits samples.',
    meta_type: 'Client',
    global_allow: false,
    add_permission: 'senaite.core: Add Client',
    catalogs: ['senaite_catalog_client'],
    fields: [
      f('title', 'string', true),
      f('ClientID', 'string', true),
      f('Phone', 'string'),
      f('EmailAddress', 'string'),
      f('MemberDiscountApplies', 'boolean'),
    ],
  },
  {
    portal_type: 'Contact',
    title: 'Contact',
    description: 'A person at a client who receives results.',
    meta_type: 'Contact',
    global_allow: false,
    add_permission: 'senaite.core: Add Contact',
    catalogs: ['portal_catalog'],
    fields: [f('Firstname', 'string', true), f('Surname', 'string', true), f('EmailAddress', 'string')],
  },
  {
    portal_type: 'AnalysisRequest',
    title: 'Sample',
    description: 'A sample registered for analysis.',
    meta_type: 'AnalysisRequest',
    global_allow: false,
    add_permission: 'senaite.core: Add AnalysisRequest',
    catalogs: ['senaite_catalog_sample'],
    fields: [
      f('Client', 'reference', true, { allowed_types: ['Client'], multi_valued: false }),
      f('Contact', 'reference', true, { allowed_types: ['Contact'], multi_valued: false }),
      f('SampleType', 'reference', true, { allowed_types: ['SampleType'], multi_valued: false }),
      f('DateSampled', 'datetime', true),
      f('Analyses', 'analyses', true, { multi_valued: true }),
      f('ParentAnalysisRequest', 'reference', false, { allowed_types: ['AnalysisRequest'], multi_valued: false }),
    ],
  },
  {
    portal_type: 'AnalysisService',
    title: 'Analysis Service',
    description: 'A test the laboratory offers.',
    meta_type: 'AnalysisService',
    global_allow: false,
    add_permission: 'senaite.core: Add AnalysisService',
    catalogs: ['senaite_catalog_setup'],
    fields: [f('title', 'string', true), f('Keyword', 'string', true), f('Unit', 'string')],
  },
];

/** Which types each container allows (`/types?parent_uid=`). */
export const ALLOWED_IN: Record<string, string[]> = {
  Client: ['AnalysisRequest', 'Contact'],
};

/** Transitions available per review_state (`/workflow/<uid>`). */
export const TRANSITIONS: Record<string, { id: string; title: string }[]> = {
  active: [{ id: 'deactivate', title: 'Deactivate' }],
  inactive: [{ id: 'activate', title: 'Activate' }],
  sample_received: [
    { id: 'create_partitions', title: 'Create partitions' },
    { id: 'invalidate', title: 'Invalidate' },
  ],
};

export function typeInfo(t: PortalType) {
  return {
    portal_type: t.portal_type,
    title: t.title,
    description: t.description,
    meta_type: t.meta_type,
    global_allow: t.global_allow,
  };
}

export function seed(store: DataStore, config: SystemConfig): void {
  const origin = `http://localhost:${config.port}`;
  const api = (path: string) => `${origin}/@@API/senaite/v1/${path}`;

  const objects: SenaiteObject[] = [
    {
      uid: CLIENT_BO,
      id: 'client-1',
      portal_type: 'Client',
      title: 'Bo Government Hospital',
      ClientID: 'C-0001',
      review_state: 'active',
      url: `${origin}/clients/client-1`,
      api_url: api(`get/${CLIENT_BO}`),
      created: nowIso(),
    },
    {
      uid: CLIENT_KENEMA,
      id: 'client-2',
      portal_type: 'Client',
      title: 'Kenema District Laboratory',
      ClientID: 'C-0002',
      review_state: 'active',
      url: `${origin}/clients/client-2`,
      api_url: api(`get/${CLIENT_KENEMA}`),
      created: nowIso(),
    },
    {
      uid: SERVICE_PH,
      id: 'ph',
      portal_type: 'AnalysisService',
      title: 'pH',
      Keyword: 'pH',
      Unit: '',
      review_state: 'active',
      url: `${origin}/bika_setup/bika_analysisservices/ph`,
      api_url: api(`get/${SERVICE_PH}`),
      created: nowIso(),
    },
    {
      uid: SAMPLE_WATER,
      id: 'WATER-0001',
      portal_type: 'AnalysisRequest',
      title: 'WATER-0001',
      getClientTitle: 'Bo Government Hospital',
      Client: { uid: CLIENT_BO, title: 'Bo Government Hospital' },
      SampleType: 'Water',
      review_state: 'sample_received',
      DateSampled: '2024-03-01',
      url: `${origin}/clients/client-1/WATER-0001`,
      api_url: api(`get/${SAMPLE_WATER}`),
      created: nowIso(),
    },
  ];

  for (const obj of objects) store.create('objects', obj.uid, obj);
}
