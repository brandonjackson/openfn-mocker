import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import odk from '../src/systems/odk/plugin.js';
import { examplePng } from '../src/systems/shared/attachments.js';

const config = { port: 0 };

describe('odk (ODK Central)', () => {
  it('POST /v1/sessions returns a token', async () => {
    const { app } = await createSystemServer(odk, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/v1/sessions', payload: { email: 'a@b.org', password: 'x' } });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe('string');
    await app.close();
  });

  it('lists projects and forms with representative shapes', async () => {
    const { app } = await createSystemServer(odk, config, { logLevel: 'silent' });
    const projects = await app.inject({ method: 'GET', url: '/v1/projects' });
    expect(projects.json().length).toBe(1);
    const project = projects.json()[0];
    expect(typeof project.description).toBe('string');
    expect(typeof project.forms).toBe('number');

    const forms = await app.inject({ method: 'GET', url: '/v1/projects/1/forms' });
    expect(forms.json().length).toBe(2);
    const form = forms.json()[0];
    // hash is a required MD5 string in ODK — never null.
    expect(form.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(form.reviewStates).toMatchObject({ received: expect.any(Number) });
    await app.close();
  });

  it('returns submissions in an OData envelope', async () => {
    const { app } = await createSystemServer(odk, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/projects/1/forms/household-survey.svc/Submissions',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.value)).toBe(true);
    expect(body.value.length).toBe(2);
    const row = body.value[0];
    expect(row.__id).toBeTruthy();
    expect(row._formId).toBeUndefined(); // internal field stripped
    // Every real OData row carries meta.instanceID and a full __system block.
    expect(row.meta.instanceID).toBe(row.__id);
    expect(row.__system.submissionDate).toBeTruthy();
    expect(row.__system).toHaveProperty('updatedAt');
    expect(row.__system).toHaveProperty('formVersion');
    await app.close();
  });

  it('lists and downloads a submission attachment', async () => {
    const { app } = await createSystemServer(odk, config, { logLevel: 'silent' });
    const base = '/v1/projects/1/forms/household-survey/submissions/uuid:sub-0001/attachments';

    const list = await app.inject({ method: 'GET', url: base });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([{ name: 'example.png', exists: true }]);

    const dl = await app.inject({ method: 'GET', url: `${base}/example.png` });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-type']).toContain('image/png');
    // Raw bytes match the fixture; the adaptor base64-encodes them via parseAs.
    expect(Buffer.compare(dl.rawPayload, examplePng.bytes())).toBe(0);

    const missing = await app.inject({ method: 'GET', url: `${base}/nope.png` });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('surfaces attachment counts in __system for a submission with media', async () => {
    const { app } = await createSystemServer(odk, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/projects/1/forms/household-survey.svc/Submissions',
    });
    const withPhoto = res.json().value.find((r: any) => r.__id === 'uuid:sub-0001');
    expect(withPhoto.__system.attachmentsPresent).toBe(1);
    expect(withPhoto.__system.attachmentsExpected).toBe(1);
    expect(withPhoto.photo).toBe('example.png');
    await app.close();
  });

  it('accepts a new submission through the OData table', async () => {
    const { app } = await createSystemServer(odk, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects/1/forms/household-survey.svc/Submissions',
      payload: { head_name: 'New Head', household_size: 2 },
    });
    expect(res.statusCode).toBe(200);
    const created = res.json();
    expect(created.__id).toBeTruthy();
    // POST-created rows match the seed rows' shape (meta + __system).
    expect(created.meta.instanceID).toBe(created.__id);
    expect(created.__system.deviceId).toBeDefined();
    const list = await app.inject({ method: 'GET', url: '/v1/projects/1/forms/household-survey.svc/Submissions' });
    expect(list.json().value.length).toBe(3);
    await app.close();
  });
});
