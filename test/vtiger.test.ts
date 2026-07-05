import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import vtiger from '../src/systems/vtiger/plugin.js';

const config = { port: 0 };

describe('vtiger (webservice.php)', () => {
  it('returns a challenge token (getchallenge)', async () => {
    const { app } = await createSystemServer(vtiger, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/webservice.php?operation=getchallenge&username=admin',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(typeof body.result.token).toBe('string');
    await app.close();
  });

  it('logs in and returns a sessionName (login)', async () => {
    const { app } = await createSystemServer(vtiger, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/webservice.php',
      payload: { operation: 'login', username: 'admin', accessKey: 'abc123' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().result.sessionName).toBe('string');
    await app.close();
  });

  it('lists the available module types (listTypes)', async () => {
    const { app } = await createSystemServer(vtiger, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/webservice.php',
      payload: { operation: 'listTypes', sessionName: 'mock-session' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.types).toContain('Contacts');
    await app.close();
  });

  it('creates a Contacts record via postElement (operation=create)', async () => {
    const { app, store } = await createSystemServer(vtiger, config, { logLevel: 'silent' });
    const before = store.count('Contacts');
    const res = await app.inject({
      method: 'POST',
      url: '/webservice.php',
      payload: {
        sessionName: 'mock-session',
        operation: 'create',
        elementType: 'Contacts',
        element: JSON.stringify({ firstname: 'Grace', lastname: 'Mensah' }),
      },
    });
    expect(res.statusCode).toBe(200);
    const result = res.json().result;
    expect(result.firstname).toBe('Grace');
    expect(result.id).toMatch(/^12x\d+$/);
    expect(store.count('Contacts')).toBe(before + 1);
    await app.close();
  });

  it('retrieves a seeded record by id (retrieve)', async () => {
    const { app } = await createSystemServer(vtiger, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/webservice.php?operation=retrieve&id=12x1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.lastname).toBe('Yusuf');
    await app.close();
  });

  it('queries records for a module (query)', async () => {
    const { app } = await createSystemServer(vtiger, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/webservice.php?operation=query&query=' + encodeURIComponent('select * from Contacts;'),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().result)).toBe(true);
    expect(res.json().result.length).toBe(2);
    await app.close();
  });
});
