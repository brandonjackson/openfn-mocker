import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * ODK Central seed (Open Data Kit — a data-collection Digital Public Good). One
 * project with two forms and a few OData-style submissions, matching what the
 * OpenFn odk adaptor reads (getForms, getSubmissions). Submissions carry the
 * ODK `__id` / `__system` metadata alongside the survey fields.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  store.create('projects', '1', {
    id: 1,
    name: 'Sierra Leone Health Survey',
    archived: false,
    keyId: null,
    createdAt: '2023-01-10T09:00:00.000Z',
    updatedAt: null,
  });

  const forms = [
    { xmlFormId: 'household-survey', name: 'Household Survey', version: '1', state: 'open', submissions: 2 },
    { xmlFormId: 'clinic-visit', name: 'Clinic Visit', version: '2', state: 'open', submissions: 1 },
  ];
  for (const f of forms) {
    store.create('forms', `1/${f.xmlFormId}`, {
      projectId: 1,
      xmlFormId: f.xmlFormId,
      name: f.name,
      version: f.version,
      state: f.state,
      submissions: f.submissions,
      hash: null,
      enketoId: null,
      createdAt: '2023-01-11T10:00:00.000Z',
      updatedAt: null,
      publishedAt: '2023-01-11T10:05:00.000Z',
    });
  }

  const submissions = [
    { form: 'household-survey', __id: 'uuid:sub-0001', head_name: 'Jane Doe', household_size: 4, district: 'Bo', water_source: 'borehole' },
    { form: 'household-survey', __id: 'uuid:sub-0002', head_name: 'Amina Kamara', household_size: 6, district: 'Kenema', water_source: 'well' },
    { form: 'clinic-visit', __id: 'uuid:sub-0003', patient_name: 'John Smith', visit_reason: 'antenatal', facility: 'Ngelehun CHC' },
  ];
  for (const s of submissions) {
    const { form, __id, ...fields } = s;
    store.create('submissions', __id, {
      __id,
      __system: {
        submissionDate: '2023-02-01T08:30:00.000Z',
        submitterId: '5',
        submitterName: 'fieldworker',
        reviewState: null,
        deviceId: 'collect:mock',
      },
      _formId: form,
      ...fields,
    });
  }
}
