import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import ocl from '../src/systems/ocl/plugin.js';

const config = { port: 0 };

describe('ocl (OpenConceptLab REST)', () => {
  it('getMappings resolves a collection mappings path (array, seed present)', async () => {
    const { app } = await createSystemServer(ocl, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/orgs/DemoOrg/collections/DemoCollection/HEAD/mappings',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].map_type).toBe('SAME-AS');
    await app.close();
  });

  it('lists concepts of a source (get generic path)', async () => {
    const { app } = await createSystemServer(ocl, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/orgs/DemoOrg/sources/DemoSource/concepts' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body.map((c: any) => c.id)).toContain('MALARIA');
    await app.close();
  });

  it('paginates a list in headers, the way OCL does', async () => {
    const { app } = await createSystemServer(ocl, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/orgs/DemoOrg/sources' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    expect(res.headers['num_found']).toBe('1');
    expect(res.headers['num_returned']).toBe('1');
    expect(res.headers['pages']).toBe('1');
    expect(res.headers['page_number']).toBe('1');
    await app.close();
  });

  it('reads source metadata by id, with the fields the API always returns', async () => {
    const { app } = await createSystemServer(ocl, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/orgs/DemoOrg/sources/DemoSource' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.short_code).toBe('DemoSource');
    expect(body.version).toBe('HEAD');
    expect(typeof body.created_on).toBe('string');
    expect(typeof body.updated_on).toBe('string');
    await app.close();
  });

  it('reads organization metadata', async () => {
    const { app } = await createSystemServer(ocl, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/orgs/DemoOrg' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('DemoOrg');
    await app.close();
  });

  it('404s an unknown source', async () => {
    const { app } = await createSystemServer(ocl, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/orgs/DemoOrg/sources/Nope' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
