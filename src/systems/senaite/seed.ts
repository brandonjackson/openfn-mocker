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
const CLIENT_BO = 'clt000000000000000000000000000001';
const CLIENT_KENEMA = 'clt000000000000000000000000000002';
const SAMPLE_WATER = 'ar0000000000000000000000000000001';
const SERVICE_PH = 'svc000000000000000000000000000001';

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
