import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import resourcemap from '../src/systems/resourcemap/plugin.js';

const config = { port: 0 };

describe('resourcemap', () => {
  it('lists collections', async () => {
    const { app } = await createSystemServer(resourcemap, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/collections.json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);
    await app.close();
  });

  it('queries the sites in a collection', async () => {
    const { app } = await createSystemServer(resourcemap, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/collections/1.json' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Health Facilities');
    expect(body.count).toBe(2);
    expect(body.totalPages).toBe(1);
    expect(Array.isArray(body.sites)).toBe(true);
    // The query API projects sites: `long`, not `lng`, and camelCase timestamps.
    expect(body.sites[0].long).toBeTypeOf('number');
    expect(body.sites[0].lng).toBeUndefined();
    expect(body.sites[0].createdAt).toBeTruthy();
    await app.close();
  });

  it('submits a site (200) into a collection', async () => {
    const { app, store } = await createSystemServer(resourcemap, config, { logLevel: 'silent' });
    const before = store.count('sites');
    const res = await app.inject({
      method: 'POST',
      url: '/api/collections/1/sites.json',
      payload: { name: 'New Health Post', lat: -1.95, lng: 30.06, properties: { type: 'health_post' } },
    });
    expect(res.statusCode).toBe(200);
    const site = res.json();
    expect(site.name).toBe('New Health Post');
    expect(site.collection_id).toBe(1);
    expect(typeof site.id).toBe('number');
    // Writes return the raw record: lng (not long), plus uuid/version.
    expect(site.lng).toBe(30.06);
    expect(typeof site.uuid).toBe('string');
    expect(site.version).toBe(1);
    expect(store.count('sites')).toBe(before + 1);
    await app.close();
  });

  it('a submitted site then appears in the collection site list', async () => {
    const { app } = await createSystemServer(resourcemap, config, { logLevel: 'silent' });
    await app.inject({
      method: 'POST',
      url: '/api/collections/2/sites.json',
      payload: { name: 'Freezer #2', properties: { model: 'HBD-116' } },
    });
    const res = await app.inject({ method: 'GET', url: '/api/collections/2.json' });
    expect(res.statusCode).toBe(200);
    const names = res.json().sites.map((s: any) => s.name);
    expect(names).toContain('Freezer #2');
    await app.close();
  });
});
