import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import sunbirdRc from '../src/systems/sunbird-rc/plugin.js';
import { examplePdf } from '../src/systems/shared/attachments.js';

const config = { port: 0 };

describe('sunbird-rc', () => {
  it('creates a registry record with a generated osid (200)', async () => {
    const { app } = await createSystemServer(sunbirdRc, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/Student',
      payload: { name: 'Asha', grade: '5' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.osid).toBe('string');
    expect(body.name).toBe('Asha');
    await app.close();
  });

  it('fetches the seeded Student by osid', async () => {
    const { app } = await createSystemServer(sunbirdRc, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/Student/stu-0001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().osid).toBe('stu-0001');
    await app.close();
  });

  it('issues a credential with a did:rcw: id', async () => {
    const { app } = await createSystemServer(sunbirdRc, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/credentials/issue',
      payload: { credential: { credentialSubject: { id: 'did:rcw:123' } }, credentialSchemaId: 'schema-1' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id.startsWith('did:rcw:')).toBe(true);
    await app.close();
  });

  it('fetches the seeded credential by id', async () => {
    const { app } = await createSystemServer(sunbirdRc, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/credentials/did:rcw:cred0001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('did:rcw:cred0001');
    await app.close();
  });

  it('downloadCredential: returns a PDF when Accept is application/pdf', async () => {
    const { app } = await createSystemServer(sunbirdRc, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/credentials/did:rcw:cred0001',
      headers: { accept: 'application/pdf' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    // Real PDF bytes (the adaptor base64-encodes them via parseAs: 'base64').
    expect(Buffer.compare(res.rawPayload, examplePdf.bytes())).toBe(0);

    // A missing credential still 404s regardless of Accept.
    const missing = await app.inject({
      method: 'GET',
      url: '/credentials/nope',
      headers: { accept: 'application/pdf' },
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('returns 404 for an unknown registry record', async () => {
    const { app } = await createSystemServer(sunbirdRc, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/Student/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
    await app.close();
  });
});
