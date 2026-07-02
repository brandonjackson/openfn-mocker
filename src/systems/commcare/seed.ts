import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

export const DEFAULT_DOMAIN = 'test-project';
export const DEFAULT_APP_ID = 'app-001';
const PATIENT_XMLNS = 'http://openrosa.org/formdesigner/PATIENT-REG-FORM';

/** Build a CommCare case object (v0.5 Data API shape). */
export function makeCase(opts: {
  caseId?: string;
  caseType?: string;
  ownerId: string;
  userId: string;
  properties: Record<string, any>;
  dateOpened?: string;
  xformIds?: string[];
}): Record<string, any> {
  const caseId = opts.caseId ?? randomUUID();
  const opened = opts.dateOpened ?? new Date().toISOString();
  const modified = new Date().toISOString();
  const caseType = opts.caseType ?? 'patient';
  return {
    case_id: caseId,
    case_type: caseType,
    date_opened: opened,
    date_modified: modified,
    closed: false,
    owner_id: opts.ownerId,
    user_id: opts.userId,
    server_date_modified: modified,
    indices: {},
    xform_ids: opts.xformIds ?? [],
    properties: {
      case_name: `${opts.properties.first_name ?? ''} ${opts.properties.last_name ?? ''}`.trim(),
      case_type: caseType,
      owner_id: opts.ownerId,
      external_id: null,
      ...opts.properties,
    },
  };
}

/** Build a CommCare form submission object (v0.5 Data API shape). */
export function makeForm(opts: {
  id?: string;
  domain: string;
  appId: string;
  userId: string;
  fields: Record<string, any>;
  receivedOn?: string;
}): Record<string, any> {
  const id = opts.id ?? randomUUID();
  const received = opts.receivedOn ?? new Date().toISOString();
  return {
    id,
    domain: opts.domain,
    app_id: opts.appId,
    received_on: received,
    form: {
      '@xmlns': PATIENT_XMLNS,
      '@name': 'Patient Registration',
      ...opts.fields,
      meta: {
        instanceID: `uuid:${id}`,
        userID: opts.userId,
        deviceID: 'commcare-mock',
        timeStart: received,
        timeEnd: received,
        appVersion: 'CommCare Mock 2.53',
      },
    },
    metadata: {
      instanceID: `uuid:${id}`,
      userID: opts.userId,
      timeEnd: received,
      deviceID: 'commcare-mock',
    },
  };
}

/**
 * Seed 5 patient cases and 3 form submissions for the configured domain
 * (default 'test-project'). Cases keyed by case_id, forms keyed by id.
 */
export function seed(store: DataStore, config: SystemConfig): void {
  const domain = (config.domain as string) || DEFAULT_DOMAIN;
  const appId = (config.appId as string) || DEFAULT_APP_ID;
  const ownerA = 'owner-clinic-001';
  const ownerB = 'owner-clinic-002';
  const userId = 'user-fieldworker-01';

  const patients = [
    { case_id: 'case-0001', first_name: 'Jane', last_name: 'Doe', age: '28', village: 'Ngelehun', owner: ownerA },
    { case_id: 'case-0002', first_name: 'John', last_name: 'Smith', age: '45', village: 'Bombali', owner: ownerA },
    { case_id: 'case-0003', first_name: 'Amina', last_name: 'Kamara', age: '33', village: 'Ngelehun', owner: ownerB },
    { case_id: 'case-0004', first_name: 'Ibrahim', last_name: 'Sesay', age: '9', village: 'Makeni', owner: ownerB },
    { case_id: 'case-0005', first_name: 'Fatmata', last_name: 'Conteh', age: '52', village: 'Bombali', owner: ownerA },
  ];

  patients.forEach((p, i) => {
    const c = makeCase({
      caseId: p.case_id,
      caseType: 'patient',
      ownerId: p.owner,
      userId,
      dateOpened: new Date(Date.now() - (patients.length - i) * 86_400_000).toISOString(),
      properties: {
        first_name: p.first_name,
        last_name: p.last_name,
        age: p.age,
        village: p.village,
        dob: null,
        sex: i % 2 === 0 ? 'female' : 'male',
      },
    });
    store.create('cases', c.case_id, c);
  });

  const forms = [
    { id: 'form-0001', name: 'Jane Doe', patient_age: '28', village: 'Ngelehun' },
    { id: 'form-0002', name: 'John Smith', patient_age: '45', village: 'Bombali' },
    { id: 'form-0003', name: 'Amina Kamara', patient_age: '33', village: 'Ngelehun' },
  ];

  forms.forEach((f, i) => {
    const form = makeForm({
      id: f.id,
      domain,
      appId,
      userId,
      receivedOn: new Date(Date.now() - (forms.length - i) * 3_600_000).toISOString(),
      fields: {
        patient_name: f.name,
        patient_age: f.patient_age,
        village: f.village,
      },
    });
    store.create('forms', form.id, form);
  });

  // Mobile workers (GET /a/{domain}/api/v0.5/user/).
  const users = [
    { id: 'user-fieldworker-01', username: `fieldworker01@${domain}.commcarehq.org`, first_name: 'Field', last_name: 'Worker' },
    { id: 'user-clinic-02', username: `clinic02@${domain}.commcarehq.org`, first_name: 'Clinic', last_name: 'Nurse' },
  ];
  for (const u of users) {
    store.create('user', u.id, {
      id: u.id,
      username: u.username,
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.username,
      groups: [],
      phone_numbers: [],
      user_data: {},
      resource_uri: `/a/${domain}/api/v0.5/user/${u.id}/`,
    });
  }

  // Applications (GET /a/{domain}/api/v0.5/application/).
  store.create('application', appId, {
    id: appId,
    name: 'Patient Registration App',
    version: 12,
    modules: [{ case_type: 'patient', forms: [{ name: { en: 'Patient Registration' }, xmlns: PATIENT_XMLNS }] }],
    resource_uri: `/a/${domain}/api/v0.5/application/${appId}/`,
  });

  // Locations (GET /a/{domain}/api/v0.5/location/).
  const locations = [
    { location_id: 'loc-001', name: 'Ngelehun CHC', site_code: 'ngelehun', location_type: 'facility' },
    { location_id: 'loc-002', name: 'Bo District', site_code: 'bo', location_type: 'district' },
  ];
  for (const loc of locations) {
    store.create('location', loc.location_id, {
      ...loc,
      resource_uri: `/a/${domain}/api/v0.5/location/${loc.location_id}/`,
    });
  }
}
