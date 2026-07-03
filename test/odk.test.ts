import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import odk from '../src/systems/odk/plugin.js';

const config = { port: 0 };

describe('odk (ODK Central)', () => {
  it('POST /v1/sessions returns a token', async () => {
    const { app } = await createSystemServer(odk, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/v1/sessions', payload: { email: 'a@b.org', password: 'x' } });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe('string');
    await app.close();
  });

  it('lists projects and forms', async () => {
    const { app } = await createSystemServer(odk, config, { logLevel: 'silent' });
    const projects = await app.inject({ method: 'GET', url: '/v1/projects' });
    expect(projects.json().length).toBe(1);
    const forms = await app.inject({ method: 'GET', url: '/v1/projects/1/forms' });
    expect(forms.json().length).toBe(2);
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
    expect(body.value[0].__id).toBeTruthy();
    expect(body.value[0]._formId).toBeUndefined(); // internal field stripped
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
    expect(res.json().__id).toBeTruthy();
    const list = await app.inject({ method: 'GET', url: '/v1/projects/1/forms/household-survey.svc/Submissions' });
    expect(list.json().value.length).toBe(3);
    await app.close();
  });
});
