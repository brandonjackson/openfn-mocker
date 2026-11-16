import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import ibipimo from '../src/systems/ibipimo/plugin.js';

const config = { port: 0 };

describe('ibipimo', () => {
  it('saves viral-load samples (201) and returns their generated s_uid', async () => {
    const { app } = await createSystemServer(ibipimo, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/post-viral-load-requests',
      payload: {
        siteid: '77889900',
        samples: [{ sidainfo_uid: '147461', p_code: '000011', date_blood_taken: '2024-04-15 11:49:00' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.errors).toEqual([]);
    expect(body.saved_viral_load_samples).toHaveLength(1);
    const saved = body.saved_viral_load_samples[0];
    expect(typeof saved.id).toBe('number');
    expect(typeof saved.s_uid).toBe('string');
    expect(saved.siteid).toBe('77889900');
    expect(saved.codepatient).toBe('000011');
    expect(saved.date_prelevement).toBe('15/04/2024 11:49:00');

    // The saved sample can then be asked about by its s_uid.
    const asked = await app.inject({
      method: 'POST',
      url: '/api/v1/ask-for-vl-results',
      payload: { siteid: '77889900', sample_uids: [saved.s_uid] },
    });
    expect(asked.json().sample_statuses[saved.s_uid].sidainfo_uid).toBe('147461');
    await app.close();
  });

  it('rejects a submission without siteid and samples (400)', async () => {
    const { app } = await createSystemServer(ibipimo, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/post-viral-load-requests',
      payload: { sampleId: 'SMP-1001' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('reports statuses for known sample UIDs and lists unknown ones', async () => {
    const { app } = await createSystemServer(ibipimo, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ask-for-vl-results',
      payload: { siteid: '77889900', sample_uids: ['IBI-2024-000001', 'NOPE'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.siteid).toBe('77889900');
    expect(body.results).toEqual([]);
    expect(body.sample_statuses['IBI-2024-000001'].request_status).toBe('not_processed');
    expect(body.no_results).toEqual(['IBI-2024-000001']);
    expect(body.not_found_sample_uids).toEqual(['NOPE']);
    expect(body.total_requested).toBe(2);
    expect(body.total_without_published_result).toBe(1);
    await app.close();
  });

  it('lists seeded sites', async () => {
    const { app } = await createSystemServer(ibipimo, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/sites' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.sites)).toBe(true);
    expect(body.sites[0].code).toBe('ST-01');
    await app.close();
  });

  it('lists sample statuses', async () => {
    const { app } = await createSystemServer(ibipimo, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/samples/status' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().samples)).toBe(true);
    await app.close();
  });
});
