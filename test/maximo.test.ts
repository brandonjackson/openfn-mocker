import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import maximo from '../src/systems/maximo/plugin.js';

const config = { port: 0 };

describe('maximo (OSLC REST)', () => {
  it('fetches a lean member collection of assets', async () => {
    const { app } = await createSystemServer(maximo, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/maximo/oslc/os/mxasset' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.member)).toBe(true);
    expect(body.member.length).toBe(2);
    expect(body.responseInfo.totalCount).toBe(2);
    await app.close();
  });

  it('projects oslc.select attributes', async () => {
    const { app } = await createSystemServer(maximo, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/maximo/oslc/os/mxasset?oslc.select=assetnum,status' });
    expect(res.statusCode).toBe(200);
    const first = res.json().member[0];
    expect(first).toHaveProperty('assetnum');
    expect(first).toHaveProperty('status');
    expect(first).not.toHaveProperty('description');
    await app.close();
  });

  it('reads one asset by its business key', async () => {
    const { app } = await createSystemServer(maximo, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/maximo/oslc/os/mxasset/11430' });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe('Centrifugal Pump 100 GPM');
    await app.close();
  });

  it('creates a work order (201)', async () => {
    const { app } = await createSystemServer(maximo, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/maximo/oslc/os/mxwo',
      payload: { wonum: '1050', description: 'Replace intake filter', status: 'WAPPR' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().wonum).toBe('1050');
    expect(res.headers['location']).toContain('/oslc/os/mxwo/1050');
    await app.close();
  });

  it('updates a work order via POST + x-methodoverride (200, not 204)', async () => {
    const { app, store } = await createSystemServer(maximo, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/maximo/oslc/os/mxwo/1001',
      headers: { 'x-methodoverride': 'PATCH', patchtype: 'MERGE' },
      payload: { status: 'INPROG' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('INPROG');
    expect(store.get('mxwo', '1001').status).toBe('INPROG');
    await app.close();
  });

  it('update75 merges a form-encoded body', async () => {
    const { app, store } = await createSystemServer(maximo, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/maximo/oslc/os/mxwo/1002',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-methodoverride': 'PATCH' },
      payload: 'status=COMP',
    });
    expect(res.statusCode).toBe(200);
    expect(store.get('mxwo', '1002').status).toBe('COMP');
    await app.close();
  });

  it('serves the legacy /maxrest MBO API in its MboSet envelope', async () => {
    const { app } = await createSystemServer(maximo, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/maxrest/rest/mbo/workorder?STATUS=APPR&_compact=1' });
    expect(res.statusCode).toBe(200);
    const set = res.json().WORKORDERMboSet;
    expect(set.rsTotal).toBe(1);
    expect(set.WORKORDER[0].Attributes.WONUM).toBe('1002');
    const upd = await app.inject({ method: 'POST', url: '/maxrest/rest/mbo/workorder/1002', payload: { STATUS: 'INPROG' } });
    expect(upd.json().WORKORDER.Attributes.STATUS).toBe('INPROG');
    const inv = await app.inject({ method: 'GET', url: '/maxrest/rest/os/mxinventory?ITEMNUM=01226' });
    expect(inv.json().QueryMXINVENTORYResponse.MXINVENTORYSet.INVENTORY[0].Attributes.CURBAL.content).toBe(14);
    await app.close();
  });
});
