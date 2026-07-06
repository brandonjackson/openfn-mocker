import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createSystemServer } from '../src/server.js';
import kobotoolbox from '../src/systems/kobotoolbox/plugin.js';

const config = { port: 0, baseURL: 'http://localhost:4016' };
const ASSET_UID = 'aHousehold01Q1';

const apps: FastifyInstance[] = [];
async function server() {
  const { app, store } = await createSystemServer(kobotoolbox, config, { logLevel: 'silent' });
  apps.push(app);
  return { app, store };
}

afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
});

describe('kobotoolbox (DRF-style envelopes)', () => {
  it('GET /api/v2/assets/ returns seed assets in { count, next, previous, results }', async () => {
    const { app } = await server();
    const res = await app.inject({ method: 'GET', url: '/api/v2/assets/?format=json' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(3);
    expect(body.next).toBeNull();
    expect(body.previous).toBeNull();
    expect(Array.isArray(body.results)).toBe(true);
    const asset = body.results.find((a: any) => a.uid === ASSET_UID);
    expect(asset).toBeTruthy();
    expect(asset.asset_type).toBe('survey');
    expect(asset.deployment__active).toBe(true);
    expect(asset.has_deployment).toBe(true);
    expect(asset.url).toContain(`/api/v2/assets/${ASSET_UID}/`);
    // Live submission count reflects seeded submissions.
    expect(asset.deployment__submission_count).toBe(5);
    // Full Asset serializer fields a real /assets/ response returns.
    expect(asset.kind).toBe('asset');
    expect(asset.deployment_status).toBe('deployed');
    expect(asset.data).toBe(`${asset.url}data/`);
    expect(asset.owner).toContain('/api/v2/users/');
    expect(Array.isArray(asset.summary.columns)).toBe(true);
    expect(asset.summary.columns).toContain('household_head_name');
    expect(asset.deployment__last_submission_time).toBeTruthy();
    expect(typeof asset.version_id).toBe('string');
  });

  it('GET /api/v2/assets/:uid/ returns a single asset', async () => {
    const { app } = await server();
    const res = await app.inject({ method: 'GET', url: `/api/v2/assets/${ASSET_UID}/` });
    expect(res.statusCode).toBe(200);
    expect(res.json().uid).toBe(ASSET_UID);
  });

  it('GET unknown asset returns 404 with DRF detail', async () => {
    const { app } = await server();
    const res = await app.inject({ method: 'GET', url: '/api/v2/assets/aNope/' });
    expect(res.statusCode).toBe(404);
    expect(res.json().detail).toBe('Not found.');
  });

  it('GET /api/v2/assets/:uid/data/ returns submissions in DRF envelope', async () => {
    const { app } = await server();
    const res = await app.inject({ method: 'GET', url: `/api/v2/assets/${ASSET_UID}/data/` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(5);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBe(5);
    // Every submission belongs to this asset and has an integer _id.
    for (const s of body.results) {
      expect(s._xform_id_string).toBe(ASSET_UID);
      expect(Number.isInteger(s._id)).toBe(true);
    }
    // Standard Kobo submission metadata is present.
    const first = body.results[0];
    expect(first['meta/instanceID']).toBe(`uuid:${first._uuid}`);
    expect(first._status).toBe('submitted_via_web');
    expect(Array.isArray(first._attachments)).toBe(true);
    expect(Array.isArray(first._geolocation)).toBe(true);
    expect(first).toHaveProperty('__version__');
  });

  it('supports ?start=&limit= pagination with next link', async () => {
    const { app } = await server();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v2/assets/${ASSET_UID}/data/?start=0&limit=2`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(5);
    expect(body.results.length).toBe(2);
    expect(body.next).toContain('start=2');
    expect(body.previous).toBeNull();
  });

  it('GET single submission via /data/:id/', async () => {
    const { app } = await server();
    const listRes = await app.inject({ method: 'GET', url: `/api/v2/assets/${ASSET_UID}/data/` });
    const first = listRes.json().results[0];
    const res = await app.inject({
      method: 'GET',
      url: `/api/v2/assets/${ASSET_UID}/data/${first._id}/`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()._id).toBe(first._id);
  });

  it('POST submission assigns _id (int) + _uuid and is readable back', async () => {
    const { app } = await server();
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v2/assets/${ASSET_UID}/submissions/`,
      payload: {
        id: ASSET_UID,
        submission: { household_head_name: 'New Person', household_size: 2, water_source: 'piped' },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.message).toBe('Successful submission.');
    expect(Number.isInteger(created._id)).toBe(true);
    expect(typeof created._uuid).toBe('string');

    // Read back via single-submission endpoint.
    const readRes = await app.inject({
      method: 'GET',
      url: `/api/v2/assets/${ASSET_UID}/data/${created._id}/`,
    });
    expect(readRes.statusCode).toBe(200);
    const sub = readRes.json();
    expect(sub.household_head_name).toBe('New Person');
    expect(sub._xform_id_string).toBe(ASSET_UID);

    // Count now reflects the new submission (5 -> 6) on both data list and asset.
    const dataRes = await app.inject({ method: 'GET', url: `/api/v2/assets/${ASSET_UID}/data/` });
    expect(dataRes.json().count).toBe(6);
    const assetRes = await app.inject({ method: 'GET', url: `/api/v2/assets/${ASSET_UID}/` });
    expect(assetRes.json().deployment__submission_count).toBe(6);
  });

  it('accepts a bare survey object (no submission wrapper)', async () => {
    const { app } = await server();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v2/assets/aClinicVisit02/submissions/`,
      payload: { patient_name: 'Bare Body', age: 30 },
    });
    expect(res.statusCode).toBe(201);
    const readRes = await app.inject({
      method: 'GET',
      url: `/api/v2/assets/aClinicVisit02/data/${res.json()._id}/`,
    });
    expect(readRes.json().patient_name).toBe('Bare Body');
  });

  it('getForms: ?asset_type=survey filters the asset list', async () => {
    const { app } = await server();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/assets/?format=json&asset_type=survey',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(3);
    const none = await app.inject({
      method: 'GET',
      url: '/api/v2/assets/?asset_type=question',
    });
    expect(none.json().count).toBe(0);
  });

  it('tolerates the double-slashed paths the adaptor emits', async () => {
    const { app } = await server();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v2//assets/${ASSET_UID}/data//?format=json`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(5);
  });

  it('getDeploymentInfo: GET /api/v2/assets/:uid/deployment/', async () => {
    const { app } = await server();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v2/assets/${ASSET_UID}/deployment/`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.active).toBe(true);
    expect(body.submission_count).toBe(5);
    expect(body.identifier).toContain(`/api/v2/assets/${ASSET_UID}/`);
    // DeploymentResponse embeds the full Asset object (required field).
    expect(body.asset.uid).toBe(ASSET_UID);
    expect(body.asset.kind).toBe('asset');
    expect(body.backend).toBe('openrosa');
  });

  it('getSubmissions: ?query= (Mongo filter) and ?sort= work', async () => {
    const { app } = await server();
    const query = encodeURIComponent(JSON.stringify({ water_source: 'borehole' }));
    const res = await app.inject({
      method: 'GET',
      url: `/api/v2/assets/${ASSET_UID}/data/?query=${query}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results.every((s: any) => s.water_source === 'borehole')).toBe(true);

    const sort = encodeURIComponent(JSON.stringify({ household_size: -1 }));
    const sorted = await app.inject({
      method: 'GET',
      url: `/api/v2/assets/${ASSET_UID}/data/?sort=${sort}`,
    });
    const sizes = sorted.json().results.map((s: any) => s.household_size);
    expect(sizes).toEqual([...sizes].sort((a: number, b: number) => b - a));
  });

  it('http.* create/update/delete asset round-trips', async () => {
    const { app } = await server();
    const create = await app.inject({
      method: 'POST',
      url: '/api/v2/assets/',
      payload: { name: 'New Survey', asset_type: 'survey' },
    });
    expect(create.statusCode).toBe(201);
    const uid = create.json().uid;
    expect(typeof uid).toBe('string');

    // Deploy it, then confirm deployment info flips active.
    const deploy = await app.inject({ method: 'POST', url: `/api/v2/assets/${uid}/deployment/` });
    expect(deploy.statusCode).toBe(200);
    expect(deploy.json().active).toBe(true);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v2/assets/${uid}/`,
      payload: { name: 'Renamed Survey' },
    });
    expect(patch.json().name).toBe('Renamed Survey');

    const del = await app.inject({ method: 'DELETE', url: `/api/v2/assets/${uid}/` });
    expect(del.statusCode).toBe(204);
  });

  it('bulk PATCH updates submissions by id', async () => {
    const { app } = await server();
    const list = await app.inject({ method: 'GET', url: `/api/v2/assets/${ASSET_UID}/data/` });
    const ids = list.json().results.slice(0, 2).map((s: any) => s._id);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v2/assets/${ASSET_UID}/data/bulk/`,
      payload: { submission_ids: ids, data: { reviewed: true } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().successes).toBe(2);

    const check = await app.inject({
      method: 'GET',
      url: `/api/v2/assets/${ASSET_UID}/data/${ids[0]}/`,
    });
    expect(check.json().reviewed).toBe(true);
  });
});
