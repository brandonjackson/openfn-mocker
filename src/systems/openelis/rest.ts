import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DataStore } from '../../store.js';

/**
 * OpenELIS Global webapp REST routes (`/api/OpenELIS-Global/rest/**`), next to
 * the FHIR surface. These are the endpoints jobs reach through the adaptor's
 * generic http.* helpers to enter orders, patients and results, as opposed to
 * reading the FHIR store. Shapes follow openfn-api-specs' openelis spec
 * (SamplePatientEntryForm, PatientManagementInfo, ResultsForm,
 * AccessionResultsRestResponse, PatientSearchResults) and, where the spec
 * leaves a body untyped, the vendor controller that builds it:
 *
 *   GET  /rest/order/search        OrderSearchRestController#searchOrder:
 *        400 without labNumber, 404 (empty body) when unknown, else a map of
 *        id/labNumber/receivedDate/collectionDate/status/patientProperties
 *   GET  /rest/patientByLabNumer   SampleEditRestController#getPatientByLabNumber:
 *        400 without accessionNumber, 404 (empty body) when unknown, else the
 *        Patient entity
 *   GET  /rest/TestCatalog         TestCatalogRestController#showTestCatalog:
 *        TestCatalogForm { testList, testSectionList, testCatalogList }
 *
 * Records live in three collections: oe_patients (keyed by patientPK),
 * oe_samples (keyed by accession number) and oe_tests (the catalog).
 */
export const REST_BASE = '/api/OpenELIS-Global/rest';

type Q = Record<string, string | undefined>;

export interface OePatient {
  patientPK: string;
  firstName: string;
  lastName: string;
  gender: string;
  birthDateForDisplay: string;
  nationalId?: string;
  primaryPhone?: string;
  city?: string;
}

export interface OeResult {
  analysisId: string;
  testId: string;
  testName: string;
  testSectionId: string;
  resultType: string;
  unitsOfMeasure?: string;
  normalRange?: string;
  resultValue?: string;
  resultId?: string;
  note?: string;
  /** awaiting-entry | awaiting-validation | finalized */
  stage: string;
}

export interface OeSample {
  id: string;
  labNo: string;
  patientPK: string;
  receivedDateForDisplay: string;
  collectionDateForDisplay?: string;
  requesterSampleID?: string;
  priority: string;
  status: string;
  results: OeResult[];
}

const today = (): string => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

function resultItem(s: OeSample, p: OePatient | undefined, r: OeResult): Record<string, unknown> {
  return {
    accessionNumber: s.labNo,
    testId: r.testId,
    testName: r.testName,
    resultValue: r.resultValue ?? '',
    resultType: r.resultType,
    unitsOfMeasure: r.unitsOfMeasure ?? '',
    normalRange: r.normalRange ?? '',
    testDate: s.receivedDateForDisplay,
    analysisId: r.analysisId,
    resultId: r.resultId ?? '',
    patientName: p ? `${p.lastName}, ${p.firstName}` : '',
    nationalId: p?.nationalId ?? '',
    note: r.note ?? '',
    reportable: true,
    valid: r.stage === 'finalized',
    normal: true,
  };
}

function searchResult(p: OePatient): Record<string, unknown> {
  return {
    id: p.patientPK,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    birthdate: p.birthDateForDisplay,
    nationalId: p.nationalId ?? '',
    contactPhone: p.primaryPhone ?? '',
  };
}

function nextId(store: DataStore, collection: string, start: number): string {
  const ids = store.list(collection).map((r: any) => Number(r.patientPK ?? r.id)).filter((n) => Number.isFinite(n));
  return String(Math.max(start - 1, ...ids) + 1);
}

function badRequest(reply: FastifyReply, req: FastifyRequest, message: string) {
  return reply.code(400).send({ timestamp: new Date().toISOString(), status: 400, error: 'Bad Request', message, path: req.url.split('?')[0] });
}

/** Apply a PatientManagementInfo body: ADD creates, UPDATE patches by patientPK. */
function upsertPatient(store: DataStore, body: any): OePatient | { error: string } {
  const status = String(body?.patientUpdateStatus ?? 'ADD');
  if (status === 'NO_ACTION') {
    const existing = body?.patientPK ? (store.get('oe_patients', String(body.patientPK)) as OePatient | undefined) : undefined;
    return existing ?? { error: 'patientPK does not match a patient' };
  }
  const fields: Partial<OePatient> = {};
  for (const k of ['firstName', 'lastName', 'gender', 'birthDateForDisplay', 'nationalId', 'primaryPhone', 'city'] as const) {
    if (body?.[k] !== undefined) fields[k] = String(body[k]);
  }
  if (status === 'UPDATE') {
    const pk = String(body?.patientPK ?? '');
    if (!store.get('oe_patients', pk)) return { error: 'patientPK does not match a patient' };
    return store.update('oe_patients', pk, fields) as OePatient;
  }
  if (!fields.lastName && !fields.firstName) return { error: 'a new patient needs a first or last name' };
  const patientPK = nextId(store, 'oe_patients', 1001);
  return store.create('oe_patients', patientPK, {
    patientPK,
    firstName: '',
    lastName: '',
    gender: '',
    birthDateForDisplay: '',
    ...fields,
  }) as OePatient;
}

export function registerRestRoutes(app: FastifyInstance, store: DataStore): void {
  const B = REST_BASE;

  app.get(`${B}/TestCatalog`, async () => {
    const tests = store.list('oe_tests') as any[];
    return {
      testList: tests.map((t) => ({ id: t.testId, name: t.testName, localizedName: t.testName, isActive: 'Y', unitOfMeasure: t.unitsOfMeasure ?? null })),
      testSectionList: [...new Set(tests.map((t) => t.testSectionName))],
      testCatalogList: tests.map((t) => ({
        id: t.testId,
        englishName: t.testName,
        testSection: t.testSectionName,
        sampleType: t.sampleType,
        resultType: t.resultType,
        uom: t.unitsOfMeasure ?? '',
        active: true,
        orderable: true,
      })),
    };
  });

  app.get(`${B}/patient-search-results`, async (req) => {
    const q = req.query as Q;
    const has = (v?: string) => v !== undefined && v !== '';
    let patients = store.list('oe_patients') as OePatient[];
    const eq = (a?: string, b?: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
    if (has(q.nationalID)) patients = patients.filter((p) => eq(p.nationalId, q.nationalID));
    if (has(q.firstName)) patients = patients.filter((p) => p.firstName.toLowerCase().startsWith(q.firstName!.toLowerCase()));
    if (has(q.lastName)) patients = patients.filter((p) => p.lastName.toLowerCase().startsWith(q.lastName!.toLowerCase()));
    if (has(q.gender)) patients = patients.filter((p) => eq(p.gender, q.gender));
    if (has(q.dateOfBirth)) patients = patients.filter((p) => p.birthDateForDisplay === q.dateOfBirth);
    if (has(q.labNumber)) {
      const s = store.get('oe_samples', q.labNumber!) as OeSample | undefined;
      patients = patients.filter((p) => s?.patientPK === p.patientPK);
    }
    return { patientSearchResults: patients.map(searchResult) };
  });

  app.post(`${B}/PatientManagement`, async (req, reply) => {
    const out = upsertPatient(store, req.body);
    if ('error' in out) return badRequest(reply, req, out.error);
    return { patientUpdateStatus: 'NO_ACTION', ...out };
  });

  app.post(`${B}/SamplePatientEntry`, async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const items = body.sampleOrderItems ?? {};
    const patientBody = { patientUpdateStatus: body.patientUpdateStatus, ...(body.patientProperties ?? {}) };
    const patient = upsertPatient(store, patientBody);
    if ('error' in patient) return badRequest(reply, req, patient.error);
    let labNo = items.labNo ? String(items.labNo) : '';
    if (labNo && store.get('oe_samples', labNo)) return badRequest(reply, req, `lab number ${labNo} is already in use`);
    if (!labNo) labNo = String(Number(nextId(store, 'oe_samples', 124))).padStart(10, '0');
    // sampleXML names the ordered tests: <test>ID</test> (or testId="ID") entries.
    const xml = String(body.sampleXML ?? '');
    const ids = [...xml.matchAll(/(?:<test>\s*(\d+)\s*<\/test>|tests?=["']([\d,]+)["']|testId=["'](\d+)["'])/g)].flatMap((m) => (m[1] ?? m[2] ?? m[3]).split(','));
    const catalog = store.list('oe_tests') as any[];
    const ordered = ids.map((id) => catalog.find((t) => t.testId === id)).filter(Boolean);
    let analysis = 5000 + store.list('oe_samples').length * 10;
    const sample: OeSample = {
      id: String(store.list('oe_samples').length + 1),
      labNo,
      patientPK: patient.patientPK,
      receivedDateForDisplay: items.receivedDateForDisplay ?? today(),
      collectionDateForDisplay: items.collectionDateForDisplay,
      requesterSampleID: items.requesterSampleID,
      priority: items.priority ?? 'ROUTINE',
      status: 'Entered',
      results: ordered.map((t) => ({
        analysisId: String(++analysis),
        testId: t.testId,
        testName: t.testName,
        testSectionId: t.testSectionId,
        resultType: t.resultType,
        unitsOfMeasure: t.unitsOfMeasure,
        normalRange: t.normalRange,
        stage: 'awaiting-entry',
      })),
    };
    store.create('oe_samples', labNo, sample);
    return { labNo, accessionNumber: labNo };
  });

  app.get(`${B}/order/search`, async (req, reply) => {
    const { labNumber } = req.query as Q;
    if (!labNumber) return reply.code(400).send();
    const s = store.get('oe_samples', labNumber) as OeSample | undefined;
    if (!s) return reply.code(404).send();
    const p = store.get('oe_patients', s.patientPK) as OePatient | undefined;
    const patientProperties = p ? { ...p, patientUpdateStatus: 'UPDATE' } : undefined;
    return {
      id: s.id,
      labNumber: s.labNo,
      receivedDate: s.receivedDateForDisplay,
      collectionDate: s.collectionDateForDisplay ?? '',
      status: s.status,
      ...(patientProperties ? { patientProperties, orderData: { patientProperties, patientUpdateStatus: 'UPDATE' } } : {}),
    };
  });

  app.get(`${B}/patientByLabNumer`, async (req, reply) => {
    const { accessionNumber } = req.query as Q;
    if (!accessionNumber) return reply.code(400).send();
    const s = store.get('oe_samples', accessionNumber) as OeSample | undefined;
    const p = s && (store.get('oe_patients', s.patientPK) as OePatient | undefined);
    if (!p) return reply.code(404).send();
    return {
      id: p.patientPK,
      nationalId: p.nationalId ?? null,
      gender: p.gender,
      birthDateForDisplay: p.birthDateForDisplay,
      person: { id: p.patientPK, firstName: p.firstName, lastName: p.lastName, primaryPhone: p.primaryPhone ?? null, city: p.city ?? null },
    };
  });

  app.get(`${B}/accession-results`, async (req, reply) => {
    const { accessionNumber } = req.query as Q;
    if (!accessionNumber) return badRequest(reply, req, 'accessionNumber is required');
    const s = store.get('oe_samples', accessionNumber) as OeSample | undefined;
    if (!s) return { accessionNumber, searchFinished: true, error: true, testResult: [] };
    const p = store.get('oe_patients', s.patientPK) as OePatient | undefined;
    return {
      accessionNumber,
      searchFinished: true,
      error: false,
      firstName: p?.firstName ?? '',
      lastName: p?.lastName ?? '',
      dob: p?.birthDateForDisplay ?? '',
      gender: p?.gender ?? '',
      nationalId: p?.nationalId ?? '',
      testResult: s.results.filter((r) => r.stage !== 'awaiting-entry').map((r) => resultItem(s, p, r)),
    };
  });

  app.get(`${B}/AccessionValidation`, async (req) => {
    const { testSectionId } = req.query as Q;
    const resultList: Record<string, unknown>[] = [];
    for (const s of store.list('oe_samples') as OeSample[]) {
      const p = store.get('oe_patients', s.patientPK) as OePatient | undefined;
      for (const r of s.results)
        if (r.stage === 'awaiting-validation' && (!testSectionId || r.testSectionId === testSectionId)) resultList.push(resultItem(s, p, r));
    }
    return { currentDate: today(), testSectionId: testSectionId ?? '', resultList };
  });

  app.get(`${B}/LogbookResults`, async (req) => {
    const { testSectionId, labNumber } = req.query as Q;
    const testResult: Record<string, unknown>[] = [];
    for (const s of store.list('oe_samples') as OeSample[]) {
      if (labNumber && s.labNo !== labNumber) continue;
      const p = store.get('oe_patients', s.patientPK) as OePatient | undefined;
      for (const r of s.results)
        if (r.stage === 'awaiting-entry' && (!testSectionId || r.testSectionId === testSectionId)) testResult.push(resultItem(s, p, r));
    }
    return { currentDate: today(), testSectionId: testSectionId ?? '', testResult };
  });

  app.post(`${B}/LogbookResults`, async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const items: any[] = Array.isArray(body.testResult) ? body.testResult : [];
    if (!items.length) return badRequest(reply, req, 'testResult is empty');
    const saved: Record<string, unknown>[] = [];
    for (const item of items) {
      const labNo = String(item.accessionNumber ?? body.accessionNumber ?? '');
      const s = store.get('oe_samples', labNo) as OeSample | undefined;
      const r = s?.results.find((x) => x.analysisId === String(item.analysisId ?? '') || (!item.analysisId && x.testId === String(item.testId ?? '')));
      if (!s || !r) return badRequest(reply, req, `no analysis ${item.analysisId ?? item.testId} on accession ${labNo}`);
      r.resultValue = String(item.resultValue ?? '');
      if (item.unitsOfMeasure) r.unitsOfMeasure = String(item.unitsOfMeasure);
      if (item.note) r.note = String(item.note);
      r.resultId ??= String(9000 + Number(r.analysisId) - 5000);
      r.stage = 'awaiting-validation';
      store.update('oe_samples', labNo, { results: s.results, status: 'Testing Started' });
      saved.push(resultItem(s, store.get('oe_patients', s.patientPK) as OePatient | undefined, r));
    }
    return { accessionNumber: body.accessionNumber ?? '', currentDate: today(), testSectionId: body.testSectionId ?? '', testResult: saved };
  });
}

/** Seed the webapp side: the catalog, one patient and one order mid-workflow. */
export function seedRest(store: DataStore): void {
  const tests = [
    { testId: '201', testName: 'Hemoglobin', testSectionId: '36', testSectionName: 'Hematology', sampleType: 'Whole Blood', resultType: 'N', unitsOfMeasure: 'g/dL', normalRange: '12.0-16.0' },
    { testId: '202', testName: 'White Blood Cell Count', testSectionId: '36', testSectionName: 'Hematology', sampleType: 'Whole Blood', resultType: 'N', unitsOfMeasure: '10^3/uL', normalRange: '4.0-11.0' },
    { testId: '310', testName: 'Malaria Smear', testSectionId: '56', testSectionName: 'Parasitology', sampleType: 'Whole Blood', resultType: 'D' },
    { testId: '420', testName: 'HIV Viral Load', testSectionId: '72', testSectionName: 'Molecular Biology', sampleType: 'Plasma', resultType: 'N', unitsOfMeasure: 'copies/mL' },
  ];
  for (const t of tests) store.create('oe_tests', t.testId, t);

  store.create('oe_patients', '1001', {
    patientPK: '1001',
    firstName: 'Jane',
    lastName: 'Doe',
    gender: 'F',
    birthDateForDisplay: '12/04/1990',
    nationalId: 'NID12345',
    primaryPhone: '+000000000',
    city: 'District 1',
  } satisfies OePatient);

  store.create('oe_samples', '0000000123', {
    id: '1',
    labNo: '0000000123',
    patientPK: '1001',
    receivedDateForDisplay: '15/03/2024',
    collectionDateForDisplay: '15/03/2024',
    requesterSampleID: 'EMR-ORD-0001',
    priority: 'ROUTINE',
    status: 'Testing Started',
    results: [
      { analysisId: '5001', testId: '201', testName: 'Hemoglobin', testSectionId: '36', resultType: 'N', unitsOfMeasure: 'g/dL', normalRange: '12.0-16.0', resultValue: '13.5', resultId: '9001', stage: 'awaiting-validation' },
      { analysisId: '5002', testId: '202', testName: 'White Blood Cell Count', testSectionId: '36', resultType: 'N', unitsOfMeasure: '10^3/uL', normalRange: '4.0-11.0', stage: 'awaiting-entry' },
      { analysisId: '5003', testId: '310', testName: 'Malaria Smear', testSectionId: '56', resultType: 'D', resultValue: 'Negative', resultId: '9003', stage: 'finalized' },
    ],
  } satisfies OeSample);
}
