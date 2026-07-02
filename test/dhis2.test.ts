import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createSystemServer } from '../src/server.js';
import dhis2 from '../src/systems/dhis2/plugin.js';

const config = { port: 0, version: '2.39' };
const openServers: FastifyInstance[] = [];

async function boot() {
  const { app, store } = await createSystemServer(dhis2, config, { logLevel: 'silent' });
  openServers.push(app);
  return { app, store };
}

afterAll(async () => {
  await Promise.all(openServers.map((a) => a.close()));
});

describe('dhis2', () => {
  it('GET /api/system/info returns version + contextPath', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/system/info' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe('2.39');
    expect(typeof body.serverDate).toBe('string');
    expect(body.contextPath).toContain('http://localhost:');
  });

  it('GET /api/organisationUnits returns pager + resource-typed array with seed data', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/organisationUnits' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pager).toMatchObject({ page: 1, pageSize: 50, pageCount: 1, total: 3 });
    expect(Array.isArray(body.organisationUnits)).toBe(true);
    expect(body.organisationUnits).toHaveLength(3);
    const facility = body.organisationUnits.find((o: any) => o.name === 'Ngelehun CHC');
    expect(facility.parent.id).toBe('O6uvpzGd5pu');
    expect(facility.level).toBe(3);
  });

  it('supports ?filter=field:eq:value', async () => {
    const { app } = await boot();
    const res = await app.inject({
      method: 'GET',
      url: '/api/organisationUnits?filter=' + encodeURIComponent('name:eq:Bo'),
    });
    const body = res.json();
    expect(body.pager.total).toBe(1);
    expect(body.organisationUnits[0].name).toBe('Bo');
  });

  it('supports ?paging=false (no pager, all items)', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/dataElements?paging=false' });
    const body = res.json();
    expect(body.pager).toBeUndefined();
    expect(body.dataElements).toHaveLength(5);
    expect(body.dataElements[0].valueType).toBeTruthy();
  });

  it('GET single org unit by uid returns the object directly; 404 when missing', async () => {
    const { app } = await boot();
    const ok = await app.inject({ method: 'GET', url: '/api/organisationUnits/DiszpKrYNg8' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().name).toBe('Ngelehun CHC');

    const missing = await app.inject({ method: 'GET', url: '/api/organisationUnits/doesNotExist' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().httpStatusCode).toBe(404);
  });

  it('programs list includes a program with two stages', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/programs' });
    const prog = res.json().programs.find((p: any) => p.id === 'IpHINAT79UW');
    expect(prog.programStages).toHaveLength(2);
  });

  it('POST /api/trackedEntityInstances returns an ImportSummary and is read-back-able', async () => {
    const { app, store } = await boot();
    const res = await app.inject({
      method: 'POST',
      url: '/api/trackedEntityInstances',
      payload: {
        trackedEntityType: 'nEenWmSyUEp',
        orgUnit: 'DiszpKrYNg8',
        attributes: [{ attribute: 'w75KJ2mc4zz', value: 'Jane' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.httpStatusCode).toBe(200);
    expect(body.response.responseType).toBe('ImportSummary');
    expect(body.response.status).toBe('SUCCESS');
    expect(body.response.importCount.imported).toBe(1);
    const uid = body.response.reference;
    // 11-char uid, first char a letter.
    expect(uid).toMatch(/^[A-Za-z][A-Za-z0-9]{10}$/);

    // Read back via the list.
    const list = await app.inject({ method: 'GET', url: '/api/trackedEntityInstances' });
    const found = list
      .json()
      .trackedEntityInstances.find((t: any) => t.trackedEntityInstance === uid);
    expect(found).toBeTruthy();
    expect(found.orgUnit).toBe('DiszpKrYNg8');
    expect(store.get('trackedEntityInstances', uid)).toBeTruthy();
  });

  it('POST /api/events stores under the event uid', async () => {
    const { app } = await boot();
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        program: 'IpHINAT79UW',
        programStage: 'A03MvHHogjR',
        orgUnit: 'DiszpKrYNg8',
        eventDate: '2024-02-01',
        status: 'COMPLETED',
        dataValues: [{ dataElement: 'qrur9Dvnyt5', value: '22' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const uid = res.json().response.reference;
    const list = await app.inject({ method: 'GET', url: '/api/events' });
    expect(list.json().events.find((e: any) => e.event === uid)).toBeTruthy();
  });

  it('POST /api/dataValueSets reports imported count and reads back flattened dataValues', async () => {
    const { app } = await boot();
    const res = await app.inject({
      method: 'POST',
      url: '/api/dataValueSets',
      payload: {
        dataSet: 'pBOMPrpg1QX',
        period: '202401',
        orgUnit: 'DiszpKrYNg8',
        dataValues: [
          { dataElement: 'FTRrcoaog83', categoryOptionCombo: 'HllvX50cXC0', value: '120' },
          { dataElement: 'fbfJHSPpUQD', value: '10' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().response.importCount.imported).toBe(2);

    const read = await app.inject({ method: 'GET', url: '/api/dataValueSets' });
    expect(read.json().dataValues.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/metadata ingests a bundle and returns stats', async () => {
    const { app } = await boot();
    const res = await app.inject({
      method: 'POST',
      url: '/api/metadata',
      payload: {
        organisationUnits: [{ id: 'newOrgUnit1', name: 'New Clinic', level: 3 }],
        dataElements: [{ name: 'New DE', valueType: 'TEXT' }, { name: 'Another DE', valueType: 'NUMBER' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('OK');
    expect(body.stats.created).toBe(3);
    expect(body.stats.total).toBe(3);

    const ou = await app.inject({ method: 'GET', url: '/api/organisationUnits/newOrgUnit1' });
    expect(ou.statusCode).toBe(200);
    expect(ou.json().name).toBe('New Clinic');
  });

  it('trackedEntityTypes list has two seeded types', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/trackedEntityTypes' });
    expect(res.json().trackedEntityTypes).toHaveLength(2);
  });

  it('accepts an optional API version segment (/api/{version}/...)', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/42/organisationUnits' });
    expect(res.statusCode).toBe(200);
    // Same seeded org units as the versionless path, via the generic layer.
    expect(res.json().organisationUnits).toHaveLength(3);

    const info = await app.inject({ method: 'GET', url: '/api/40/system/info' });
    expect(info.statusCode).toBe(200);
    expect(info.json().version).toBe('2.39');
  });

  it('new Tracker API: POST /api/tracker imports and GET /api/tracker/:type reads back', async () => {
    const { app } = await boot();
    const res = await app.inject({
      method: 'POST',
      url: '/api/tracker',
      query: { async: 'false', importStrategy: 'CREATE_AND_UPDATE' },
      payload: {
        trackedEntities: [
          { trackedEntityType: 'nEenWmSyUEp', orgUnit: 'DiszpKrYNg8', attributes: [] },
        ],
        events: [{ program: 'IpHINAT79UW', orgUnit: 'DiszpKrYNg8', status: 'ACTIVE' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('OK');
    expect(body.stats.created).toBe(2);
    expect(body.bundleReport.typeReportMap.TRACKED_ENTITY.stats.created).toBe(1);
    expect(body.bundleReport.typeReportMap.EVENT.stats.created).toBe(1);

    const te = await app.inject({ method: 'GET', url: '/api/tracker/trackedEntities' });
    expect(te.statusCode).toBe(200);
    expect(te.json().instances).toHaveLength(1);
    expect(te.json().total).toBe(1);
  });

  it('GET /api/analytics returns a headers/rows grid', async () => {
    const { app } = await boot();
    const res = await app.inject({
      method: 'GET',
      url: '/api/analytics?dimension=dx:fbfJHSPpUQD&dimension=pe:202401',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.headers)).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeGreaterThanOrEqual(1);
    expect(body.metaData.items).toBeTruthy();
  });

  it('GET /api/schemas lists schemas; /api/schemas/:type returns one', async () => {
    const { app } = await boot();
    const all = await app.inject({ method: 'GET', url: '/api/schemas' });
    expect(all.json().schemas.length).toBeGreaterThan(0);
    const one = await app.inject({ method: 'GET', url: '/api/schemas/dataElement' });
    expect(one.statusCode).toBe(200);
    expect(one.json().plural).toBe('dataElements');
  });

  it('generic classic CRUD works for an unseeded resourceType (dataSets)', async () => {
    const { app } = await boot();
    const create = await app.inject({
      method: 'POST',
      url: '/api/dataSets',
      payload: { name: 'Monthly Report', periodType: 'Monthly' },
    });
    expect(create.statusCode).toBe(200);
    const uid = create.json().response.reference;
    expect(uid).toMatch(/^[A-Za-z][A-Za-z0-9]{10}$/);

    const list = await app.inject({ method: 'GET', url: '/api/dataSets' });
    expect(list.json().dataSets.find((d: any) => d.id === uid)).toBeTruthy();

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/dataSets/${uid}`,
      payload: { name: 'Renamed Report' },
    });
    expect(patch.statusCode).toBe(200);
    const read = await app.inject({ method: 'GET', url: `/api/dataSets/${uid}` });
    expect(read.json().name).toBe('Renamed Report');

    const del = await app.inject({ method: 'DELETE', url: `/api/dataSets/${uid}` });
    expect(del.statusCode).toBe(200);
    const gone = await app.inject({ method: 'GET', url: `/api/dataSets/${uid}` });
    expect(gone.statusCode).toBe(404);
  });
});
