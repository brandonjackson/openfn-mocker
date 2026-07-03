import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openlmis from '../src/systems/openlmis/plugin.js';
import { IDS } from '../src/systems/openlmis/seed.js';

const config = { port: 0 };

describe('openlmis', () => {
  it('POST /api/oauth/token returns an access_token', async () => {
    const { app } = await createSystemServer(openlmis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/api/oauth/token?grant_type=client_credentials' });
    expect(res.statusCode).toBe(200);
    expect(res.json().access_token).toBe('mock_openlmis_token');
    await app.close();
  });

  it('lists facilities in a Spring page envelope', async () => {
    const { app } = await createSystemServer(openlmis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/facilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.content)).toBe(true);
    expect(body.totalElements).toBe(2);
    expect(body).toHaveProperty('totalPages');
    await app.close();
  });

  it('reads a single facility by id', async () => {
    const { app } = await createSystemServer(openlmis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `/api/facilities/${IDS.facilityBo}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().code).toBe('FAC001');
    await app.close();
  });

  it('initiates a requisition', async () => {
    const { app } = await createSystemServer(openlmis, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/requisitions/initiate?program=${IDS.programEpi}&facility=${IDS.facilityNgelehun}`,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('INITIATED');
    await app.close();
  });

  it('404s an unknown orderable', async () => {
    const { app } = await createSystemServer(openlmis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/orderables/does-not-exist' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
