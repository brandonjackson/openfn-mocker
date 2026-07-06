import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * ODK Central seed (Open Data Kit — a data-collection Digital Public Good). One
 * project with two forms and a few OData-style submissions, matching what the
 * OpenFn odk adaptor reads (getForms, getSubmissions). Submissions carry the
 * ODK `__id`, `meta.instanceID` and `__system` metadata alongside the survey
 * fields, so a response looks like real ODK Central OData output.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/** ODK form/submission hashes are 32-char lowercase-hex MD5 digests. */
export function md5Hex(seed: string): string {
  // Deterministic pseudo-MD5 so reseeds are stable and the value looks real; it
  // is not a real digest (the mock never hashes the XForm), just a 32-hex id.
  let h = 0;
  let out = '';
  for (let i = 0; out.length < 32; i++) {
    h = (h * 31 + seed.charCodeAt(i % seed.length) + i) >>> 0;
    out += (h % 16).toString(16);
  }
  return out.slice(0, 32);
}

/**
 * Build the `__system` metadata block ODK Central attaches to every OData
 * submission row. `submitterId`/`submissionDate`/`updatedAt`/`reviewState` are
 * spec-confirmed (the OData `$filter` field table); `submitterName`, `deviceId`,
 * `attachmentsPresent`, `attachmentsExpected`, `edits`, `status` and
 * `formVersion` are the further fields live Central emits.
 */
export function odkSystem(opts: {
  submissionDate: string;
  submitterId?: string;
  submitterName?: string;
  deviceId?: string | null;
  formVersion?: string;
}): Record<string, any> {
  return {
    submissionDate: opts.submissionDate,
    updatedAt: null,
    submitterId: opts.submitterId ?? '5',
    submitterName: opts.submitterName ?? 'fieldworker',
    attachmentsPresent: 0,
    attachmentsExpected: 0,
    status: null,
    reviewState: null,
    deviceId: opts.deviceId ?? 'collect:mock',
    edits: 0,
    formVersion: opts.formVersion ?? '1',
  };
}

export function seed(store: DataStore, _config: SystemConfig): void {
  store.create('projects', '1', {
    id: 1,
    name: 'Sierra Leone Health Survey',
    description: 'Household and clinic data collection across Bo and Kenema districts.',
    archived: false,
    keyId: null,
    // Extended metadata Central returns for a project (counts + last activity).
    appUsers: 4,
    forms: 2,
    lastSubmission: '2023-02-01T08:45:00.000Z',
    datasets: 0,
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
      keyId: null,
      // `hash` is a required MD5 string in ODK; a published form always has one.
      hash: md5Hex(`${f.xmlFormId}@${f.version}`),
      enketoId: md5Hex(`enketo-${f.xmlFormId}`).slice(0, 12),
      // ExtendedForm fields Central returns with the form (submission rollups).
      submissions: f.submissions,
      reviewStates: { received: f.submissions, hasIssues: 0, edited: 0 },
      lastSubmission: f.submissions > 0 ? '2023-02-01T08:45:00.000Z' : null,
      excelContentType: null,
      entityRelated: false,
      publicLinks: 0,
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
      // Every OData row carries meta.instanceID (== the row id).
      meta: { instanceID: __id },
      __system: odkSystem({
        submissionDate: '2023-02-01T08:30:00.000Z',
        formVersion: form === 'clinic-visit' ? '2' : '1',
      }),
      _formId: form,
      ...fields,
    });
  }
}
