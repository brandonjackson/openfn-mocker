import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openelis from '../src/systems/openelis/plugin.js';

const config = { port: 0 };
const BASE = '/fhir';

describe('openelis (FHIR R4 lab)', () => {
  it('searches ServiceRequests (lab orders) as a Bundle', async () => {
    const { app } = await createSystemServer(openelis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/ServiceRequest` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resourceType).toBe('Bundle');
    expect(body.total).toBe(1);
    await app.close();
  });

  it('reads a DiagnosticReport with linked results', async () => {
    const { app } = await createSystemServer(openelis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/DiagnosticReport/report-0001` });
    expect(res.statusCode).toBe(200);
    expect(res.json().result[0].reference).toBe('Observation/obs-0001');
    await app.close();
  });

  it('creates an Observation (result)', async () => {
    const { app } = await createSystemServer(openelis, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/Observation`,
      payload: { resourceType: 'Observation', status: 'final' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeTruthy();
    await app.close();
  });

  it('serves a CapabilityStatement at /metadata', async () => {
    const { app } = await createSystemServer(openelis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/metadata` });
    expect(res.statusCode).toBe(200);
    expect(res.json().resourceType).toBe('CapabilityStatement');
    await app.close();
  });
});

describe('openelis (webapp REST API)', () => {
  const REST = '/api/OpenELIS-Global/rest';
  const boot = () => createSystemServer(openelis, config, { logLevel: 'silent' }).then((s) => s.app);

  it('serves the test catalog', async () => {
    const app = await boot();
    const body = (await app.inject({ method: 'GET', url: `${REST}/TestCatalog` })).json();
    expect(body.testCatalogList.map((t: any) => t.englishName)).toContain('Hemoglobin');
    expect(body.testSectionList).toContain('Hematology');
    await app.close();
  });

  it('registers a patient and finds them by national ID', async () => {
    const app = await boot();
    const add = await app.inject({
      method: 'POST',
      url: `${REST}/PatientManagement`,
      payload: { patientUpdateStatus: 'ADD', firstName: 'Amina', lastName: 'Okafor', gender: 'F', nationalId: 'NID67890' },
    });
    expect(add.statusCode).toBe(200);
    expect(add.json().patientPK).toBe('1002');
    const found = (await app.inject({ method: 'GET', url: `${REST}/patient-search-results?nationalID=NID67890` })).json();
    expect(found.patientSearchResults).toHaveLength(1);
    expect(found.patientSearchResults[0]).toMatchObject({ id: '1002', lastName: 'Okafor' });
    const bad = await app.inject({ method: 'POST', url: `${REST}/PatientManagement`, payload: { patientUpdateStatus: 'UPDATE', patientPK: '9999' } });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it('creates an order from sampleXML, enters a result, and moves it to validation', async () => {
    const app = await boot();
    const order = await app.inject({
      method: 'POST',
      url: `${REST}/SamplePatientEntry`,
      payload: {
        patientProperties: { patientUpdateStatus: 'UPDATE', patientPK: '1001' },
        sampleOrderItems: { labNo: '0000000200', priority: 'ROUTINE' },
        sampleXML: '<samples><sample sampleID="1" tests="201,310"/></samples>',
      },
    });
    expect(order.json()).toEqual({ labNo: '0000000200', accessionNumber: '0000000200' });
    const dup = await app.inject({ method: 'POST', url: `${REST}/SamplePatientEntry`, payload: { patientProperties: { patientUpdateStatus: 'NO_ACTION', patientPK: '1001' }, sampleOrderItems: { labNo: '0000000200' } } });
    expect(dup.statusCode).toBe(400);

    const pending = (await app.inject({ method: 'GET', url: `${REST}/LogbookResults?labNumber=0000000200` })).json();
    expect(pending.testResult.map((r: any) => r.testName)).toEqual(['Hemoglobin', 'Malaria Smear']);
    const hb = pending.testResult[0];
    const saved = await app.inject({
      method: 'POST',
      url: `${REST}/LogbookResults`,
      payload: { accessionNumber: '0000000200', testResult: [{ accessionNumber: '0000000200', analysisId: hb.analysisId, resultValue: '11.0' }] },
    });
    expect(saved.statusCode).toBe(200);
    const queue = (await app.inject({ method: 'GET', url: `${REST}/AccessionValidation?testSectionId=36` })).json();
    expect(queue.resultList.map((r: any) => `${r.accessionNumber}:${r.resultValue}`)).toEqual(['0000000123:13.5', '0000000200:11.0']);
    await app.close();
  });

  it('looks an order and its patient up by accession number', async () => {
    const app = await boot();
    const order = (await app.inject({ method: 'GET', url: `${REST}/order/search?labNumber=0000000123` })).json();
    expect(order).toMatchObject({ labNumber: '0000000123', patientProperties: { patientPK: '1001', patientUpdateStatus: 'UPDATE' } });
    expect((await app.inject({ method: 'GET', url: `${REST}/order/search?labNumber=nope` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${REST}/order/search` })).statusCode).toBe(400);
    const patient = (await app.inject({ method: 'GET', url: `${REST}/patientByLabNumer?accessionNumber=0000000123` })).json();
    expect(patient.person).toMatchObject({ firstName: 'Jane', lastName: 'Doe' });
    const results = (await app.inject({ method: 'GET', url: `${REST}/accession-results?accessionNumber=0000000123` })).json();
    expect(results.testResult.map((r: any) => r.testName)).toEqual(['Hemoglobin', 'Malaria Smear']);
    await app.close();
  });
});
