import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createSystemServer } from '../src/server.js';
import fhir from '../src/systems/fhir/plugin.js';

const config = { port: 0, apiPath: 'fhir' };

const apps: FastifyInstance[] = [];
async function makeApp() {
  const { app, store } = await createSystemServer(fhir, config, { logLevel: 'silent' });
  apps.push(app);
  return { app, store };
}

afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
});

describe('fhir (HAPI R4)', () => {
  it('GET /fhir/Patient returns a searchset Bundle of seeded patients', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/fhir/Patient' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resourceType).toBe('Bundle');
    expect(body.type).toBe('searchset');
    expect(body.total).toBe(3);
    expect(body.link[0]).toMatchObject({ relation: 'self' });
    expect(body.entry).toHaveLength(3);
    expect(body.entry[0].search).toEqual({ mode: 'match' });
    expect(body.entry[0].resource.resourceType).toBe('Patient');
    expect(body.entry[0].fullUrl).toContain('/fhir/Patient/');
  });

  it('GET /fhir/Patient/:id returns the resource', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/fhir/Patient/pat-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resourceType).toBe('Patient');
    expect(body.id).toBe('pat-1');
    expect(body.name[0].family).toBe('Doe');
  });

  it('GET a missing resource returns 404 OperationOutcome', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/fhir/Patient/does-not-exist' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.resourceType).toBe('OperationOutcome');
    expect(body.issue[0].severity).toBe('error');
    expect(body.issue[0].code).toBe('not-found');
  });

  it('POST create assigns id + meta, sets Location, then reads back', async () => {
    const { app } = await makeApp();
    const create = await app.inject({
      method: 'POST',
      url: '/fhir/Patient',
      payload: {
        resourceType: 'Patient',
        name: [{ family: 'Newman', given: ['Nadia'] }],
        gender: 'female',
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(typeof created.id).toBe('string');
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.meta.versionId).toBe('1');
    expect(typeof created.meta.lastUpdated).toBe('string');
    expect(create.headers.location).toContain(`/fhir/Patient/${created.id}/_history/1`);

    const read = await app.inject({ method: 'GET', url: `/fhir/Patient/${created.id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().name[0].family).toBe('Newman');

    // And it appears in the search Bundle.
    const search = await app.inject({ method: 'GET', url: '/fhir/Patient' });
    const ids = search.json().entry.map((e: any) => e.resource.id);
    expect(ids).toContain(created.id);
  });

  it('PUT upserts a resource at a known id (201 new, 200 update)', async () => {
    const { app } = await makeApp();
    const put1 = await app.inject({
      method: 'PUT',
      url: '/fhir/Observation/obs-custom',
      payload: {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Weight' },
        subject: { reference: 'Patient/pat-1' },
      },
    });
    expect(put1.statusCode).toBe(201);
    expect(put1.json().id).toBe('obs-custom');
    expect(put1.json().meta.versionId).toBe('1');

    const put2 = await app.inject({
      method: 'PUT',
      url: '/fhir/Observation/obs-custom',
      payload: { resourceType: 'Observation', status: 'amended', code: { text: 'Weight' } },
    });
    expect(put2.statusCode).toBe(200);
    expect(put2.json().meta.versionId).toBe('2');
    expect(put2.json().status).toBe('amended');
  });

  it('DELETE returns 200 OperationOutcome and removes the resource', async () => {
    const { app } = await makeApp();
    const del = await app.inject({ method: 'DELETE', url: '/fhir/Patient/pat-3' });
    expect(del.statusCode).toBe(200);
    expect(del.json().resourceType).toBe('OperationOutcome');
    const read = await app.inject({ method: 'GET', url: '/fhir/Patient/pat-3' });
    expect(read.statusCode).toBe(404);
  });

  it('POST /fhir/Patient/_search behaves like GET search with params', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/fhir/Patient/_search',
      payload: { name: 'Smith' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resourceType).toBe('Bundle');
    expect(body.total).toBe(1);
    expect(body.entry[0].resource.name[0].family).toBe('Smith');
  });

  it('GET search supports _id and name query params', async () => {
    const { app } = await makeApp();
    const byId = await app.inject({ method: 'GET', url: '/fhir/Patient?_id=pat-2' });
    expect(byId.json().total).toBe(1);
    expect(byId.json().entry[0].resource.id).toBe('pat-2');

    const byName = await app.inject({ method: 'GET', url: '/fhir/Patient?name=Doe' });
    expect(byName.json().total).toBe(1);
    expect(byName.json().entry[0].resource.name[0].family).toBe('Doe');
  });

  it('POST a transaction Bundle returns a transaction-response Bundle', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/fhir',
      payload: {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          {
            resource: { resourceType: 'Patient', name: [{ family: 'Batch' }] },
            request: { method: 'POST', url: 'Patient' },
          },
          {
            request: { method: 'GET', url: 'Patient/pat-1' },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resourceType).toBe('Bundle');
    expect(body.type).toBe('transaction-response');
    expect(body.entry).toHaveLength(2);
    expect(body.entry[0].response.status).toBe('201 Created');
    expect(body.entry[0].resource.resourceType).toBe('Patient');
    expect(body.entry[1].response.status).toBe('200 OK');
    expect(body.entry[1].resource.id).toBe('pat-1');

    // The created Patient is persisted and findable.
    const created = body.entry[0].resource.id;
    const read = await app.inject({ method: 'GET', url: `/fhir/Patient/${created}` });
    expect(read.statusCode).toBe(200);
  });

  it('seeds Encounter, Observation and Condition collections', async () => {
    const { store } = await makeApp();
    expect(store.count('Patient')).toBe(3);
    expect(store.count('Encounter')).toBe(2);
    expect(store.count('Observation')).toBe(2);
    expect(store.count('Condition')).toBe(1);
  });
});
