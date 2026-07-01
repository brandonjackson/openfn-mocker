import { describe, it, expect, afterAll } from 'vitest';
import { createSystemServer } from '../src/server.js';
import commcare from '../src/systems/commcare/plugin.js';

const config = { port: 0, domain: 'test-project', appId: 'app-001' };
const CASE_LIST = '/a/test-project/api/v0.5/case/';
const FORM_LIST = '/a/test-project/api/v0.5/form/';
const RECEIVER = '/a/test-project/receiver/';

const servers: Array<{ close: () => Promise<void> }> = [];
async function boot() {
  const { app, store } = await createSystemServer(commcare, config, { logLevel: 'silent' });
  servers.push(app);
  return { app, store };
}

afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

describe('commcare (v0.5 Data API, Tastypie envelope)', () => {
  it('GET case list returns { meta, objects } with seeded cases', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: CASE_LIST });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta).toMatchObject({ limit: 20, offset: 0, total_count: 5 });
    expect(body.meta.next).toBeNull();
    expect(body.meta.previous).toBeNull();
    expect(Array.isArray(body.objects)).toBe(true);
    expect(body.objects).toHaveLength(5);
    const first = body.objects[0];
    expect(first.case_id).toBe('case-0001');
    expect(first.case_type).toBe('patient');
    expect(first.closed).toBe(false);
    expect(first.properties.first_name).toBe('Jane');
  });

  it('supports ?type= and ?owner_id= filters', async () => {
    const { app } = await boot();
    const byOwner = await app.inject({
      method: 'GET',
      url: `${CASE_LIST}?owner_id=owner-clinic-002`,
    });
    const body = byOwner.json();
    expect(body.objects.every((c: any) => c.owner_id === 'owner-clinic-002')).toBe(true);
    expect(body.objects.length).toBe(2);

    const byType = await app.inject({ method: 'GET', url: `${CASE_LIST}?type=nonexistent` });
    expect(byType.json().objects).toHaveLength(0);
    expect(byType.json().meta.total_count).toBe(0);
  });

  it('paginates with ?offset= and ?limit= and emits next/previous links', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: `${CASE_LIST}?limit=2&offset=0` });
    const body = res.json();
    expect(body.objects).toHaveLength(2);
    expect(body.meta.total_count).toBe(5);
    expect(typeof body.meta.next).toBe('string');
    expect(body.meta.next).toContain('offset=2');
    expect(body.meta.previous).toBeNull();
  });

  it('GET single case by case_id returns the case object (404 when missing)', async () => {
    const { app } = await boot();
    const ok = await app.inject({ method: 'GET', url: `${CASE_LIST}case-0003/` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().properties.first_name).toBe('Amina');

    const missing = await app.inject({ method: 'GET', url: `${CASE_LIST}nope-999/` });
    expect(missing.statusCode).toBe(404);
  });

  it('GET form list and single form work', async () => {
    const { app } = await boot();
    const list = await app.inject({ method: 'GET', url: FORM_LIST });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.meta.total_count).toBe(3);
    expect(body.objects[0].form.meta.instanceID).toContain('uuid:');

    const single = await app.inject({ method: 'GET', url: `${FORM_LIST}form-0002/` });
    expect(single.statusCode).toBe(200);
    expect(single.json().app_id).toBe('app-001');
  });

  it('POST /receiver/ accepts OpenRosa XML and returns 201 submit_success XML', async () => {
    const { app } = await boot();
    const xml =
      '<?xml version="1.0"?><data xmlns="http://openrosa.org/formdesigner/X">' +
      '<name>Test Patient</name><meta><instanceID>uuid:abc-123</instanceID></meta></data>';
    const res = await app.inject({
      method: 'POST',
      url: RECEIVER,
      headers: { 'content-type': 'text/xml' },
      payload: xml,
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers['content-type']).toContain('text/xml');
    expect(res.body).toContain('<OpenRosaResponse');
    expect(res.body).toContain('nature="submit_success"');

    // The submission was stored — form count grows from 3 to 4.
    const list = await app.inject({ method: 'GET', url: FORM_LIST });
    expect(list.json().meta.total_count).toBe(4);
  });
});
