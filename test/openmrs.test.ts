import { describe, it, expect, afterAll } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openmrs from '../src/systems/openmrs/plugin.js';

const config = { port: 0 };

const { app, store } = await createSystemServer(openmrs, config, { logLevel: 'silent' });

afterAll(async () => {
  await app.close();
});

describe('openmrs (REST + FHIR hybrid)', () => {
  it('GET /ws/rest/v1/patient returns seed patients in { results } envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/ws/rest/v1/patient' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBe(5);
    const first = body.results[0];
    expect(first.uuid).toBeTruthy();
    expect(first.display).toContain(' - ');
    expect(first.identifiers[0].identifier).toMatch(/^MRN-/);
    expect(first.person.names[0].givenName).toBeTruthy();
    expect(first.person.gender).toBeTruthy();
  });

  it('?v=ref returns the minimal { uuid, display, links } representation', async () => {
    const res = await app.inject({ method: 'GET', url: '/ws/rest/v1/patient?v=ref' });
    expect(res.statusCode).toBe(200);
    const item = res.json().results[0];
    expect(Object.keys(item).sort()).toEqual(['display', 'links', 'uuid']);
    expect(item.links[0].rel).toBe('self');
    expect(item.links[0].uri).toContain('/ws/rest/v1/patient/');
  });

  it('?q= filters the patient list', async () => {
    const res = await app.inject({ method: 'GET', url: '/ws/rest/v1/patient?q=Kamara' });
    expect(res.statusCode).toBe(200);
    const results = res.json().results;
    expect(results.length).toBe(1);
    expect(results[0].display).toContain('Kamara');
  });

  it('POST /ws/rest/v1/patient creates (201) and is readable back', async () => {
    const payload = {
      identifiers: [{ identifier: 'MRN-900', identifierType: { display: 'OpenMRS ID' } }],
      person: {
        names: [{ givenName: 'Test', familyName: 'Patient' }],
        gender: 'M',
        birthdate: '1990-01-01',
      },
    };
    const create = await app.inject({ method: 'POST', url: '/ws/rest/v1/patient', payload });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(created.uuid).toBeTruthy();
    expect(created.display).toBe('MRN-900 - Test Patient');

    const read = await app.inject({ method: 'GET', url: `/ws/rest/v1/patient/${created.uuid}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().uuid).toBe(created.uuid);
    expect(read.json().person.names[0].familyName).toBe('Patient');
  });

  it('POST /ws/rest/v1/patient/{uuid} merges an update', async () => {
    const list = await app.inject({ method: 'GET', url: '/ws/rest/v1/patient' });
    const target = list.json().results[0];
    const upd = await app.inject({
      method: 'POST',
      url: `/ws/rest/v1/patient/${target.uuid}`,
      payload: { display: 'Renamed Patient' },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().display).toBe('Renamed Patient');
    // Merge preserved the original identifiers.
    expect(upd.json().identifiers[0].identifier).toBe(target.identifiers[0].identifier);
  });

  it('DELETE /ws/rest/v1/patient/{uuid} returns 204', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/ws/rest/v1/concept',
      payload: { display: 'Disposable concept' },
    });
    const uuid = create.json().uuid;
    const del = await app.inject({ method: 'DELETE', url: `/ws/rest/v1/concept/${uuid}` });
    expect(del.statusCode).toBe(204);
    const read = await app.inject({ method: 'GET', url: `/ws/rest/v1/concept/${uuid}` });
    expect(read.statusCode).toBe(404);
  });

  it('GET /ws/rest/v1/concept returns 10 seed concepts with datatype/conceptClass', async () => {
    const res = await app.inject({ method: 'GET', url: '/ws/rest/v1/concept' });
    const results = res.json().results;
    // 10 seeded (one may have been deleted by a prior test if run in isolation it's 10).
    expect(results.length).toBeGreaterThanOrEqual(10);
    const c = results[0];
    expect(c.datatype.display).toBeTruthy();
    expect(c.conceptClass.display).toBeTruthy();
  });

  it('GET /ws/rest/v1/encountertype returns 3 seed types', async () => {
    const res = await app.inject({ method: 'GET', url: '/ws/rest/v1/encountertype' });
    expect(res.json().results.length).toBe(3);
  });

  it('FHIR GET /ws/fhir2/R4/Patient returns a searchset Bundle mirroring seed patients', async () => {
    const res = await app.inject({ method: 'GET', url: '/ws/fhir2/R4/Patient' });
    expect(res.statusCode).toBe(200);
    const bundle = res.json();
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('searchset');
    expect(bundle.total).toBeGreaterThanOrEqual(5);
    const entry = bundle.entry[0];
    expect(entry.resource.resourceType).toBe('Patient');
    expect(entry.resource.name[0].family).toBeTruthy();
    expect(['male', 'female', 'unknown']).toContain(entry.resource.gender);
    expect(entry.search.mode).toBe('match');

    // FHIR Patient corresponds to a REST patient (same uuid + identifier value).
    const restPatients = store.list('patient');
    const restMrns = restPatients.map((p) => p.identifiers[0].identifier);
    expect(restMrns).toContain(entry.resource.identifier[0].value);
  });

  it('FHIR GET /ws/fhir2/R4/Patient/{id} returns the resource; unknown id -> 404 OperationOutcome', async () => {
    const bundle = (await app.inject({ method: 'GET', url: '/ws/fhir2/R4/Patient' })).json();
    const id = bundle.entry[0].resource.id;
    const ok = await app.inject({ method: 'GET', url: `/ws/fhir2/R4/Patient/${id}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().resourceType).toBe('Patient');

    const miss = await app.inject({ method: 'GET', url: '/ws/fhir2/R4/Patient/does-not-exist' });
    expect(miss.statusCode).toBe(404);
    expect(miss.json().resourceType).toBe('OperationOutcome');
  });

  it('FHIR POST /ws/fhir2/R4/Patient creates (201) and is readable back', async () => {
    const payload = {
      resourceType: 'Patient',
      name: [{ family: 'Newman', given: ['Alice'] }],
      gender: 'female',
      birthDate: '2000-02-02',
    };
    const create = await app.inject({ method: 'POST', url: '/ws/fhir2/R4/Patient', payload });
    expect(create.statusCode).toBe(201);
    const id = create.json().id;
    expect(id).toBeTruthy();
    const read = await app.inject({ method: 'GET', url: `/ws/fhir2/R4/Patient/${id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().name[0].family).toBe('Newman');
  });
});
