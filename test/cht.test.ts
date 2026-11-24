import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import cht from '../src/systems/cht/plugin.js';

const config = { port: 0 };

describe('cht (Community Health Toolkit)', () => {
  it('creates a person via the Medic REST API', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/people',
      payload: { name: 'New CHW', phone: '+23276111111' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBeTruthy();
    const read = await app.inject({ method: 'GET', url: `/medic/${body.id}` });
    expect(read.json().type).toBe('person');
    await app.close();
  });

  it('serves the CouchDB _changes feed', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/medic/_changes' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body).toHaveProperty('last_seq');
    await app.close();
  });

  it('filters _changes by ?since=', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const all = await app.inject({ method: 'GET', url: '/medic/_changes' });
    const total = all.json().results.length;
    const res = await app.inject({ method: 'GET', url: '/medic/_changes?since=2' });
    expect(res.json().results.length).toBe(total - 2);
    await app.close();
  });

  it('writes multiple docs via _bulk_docs', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/medic/_bulk_docs',
      payload: { docs: [{ _id: 'bulk-1', type: 'person' }, { type: 'clinic' }] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].ok).toBe(true);
    await app.close();
  });

  it('reads and updates app settings', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const get = await app.inject({ method: 'GET', url: '/api/v1/settings' });
    expect(get.json().locale).toBe('en');
    const put = await app.inject({ method: 'PUT', url: '/api/v1/settings', payload: { locale: 'fr' } });
    expect(put.json().success).toBe(true);
    const after = await app.inject({ method: 'GET', url: '/api/v1/settings' });
    expect(after.json().locale).toBe('fr');
    await app.close();
  });

  it('exports contacts and reports as CSV downloads, as cht-core does', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const contacts = await app.inject({ method: 'GET', url: '/api/v2/export/contacts' });
    expect(contacts.statusCode).toBe(200);
    expect(contacts.headers['content-type']).toMatch(/^text\/csv/);
    expect(contacts.headers['content-disposition']).toMatch(/^attachment; filename=contacts-\d{12}\.csv$/);
    const lines = contacts.body.trimEnd().split('\n');
    expect(lines[0]).toBe('id,rev,name,patient_id,type,contact_type,place_id');
    expect(lines.find((l) => l.startsWith('"person-chw-0001"'))).toMatch(
      /^"person-chw-0001","1-[0-9a-f]+","Aminata Kamara",,"person",,$/
    );

    const reports = await app.inject({ method: 'GET', url: '/api/v2/export/reports' });
    expect(reports.headers['content-type']).toMatch(/^text\/csv/);
    const [header, row] = reports.body.trimEnd().split('\n');
    expect(header).toBe(
      '_id,form,patient_id,reported_date,from,contact.name,contact.parent.name,contact.parent.parent.name,contact.parent.parent.parent.name,edd,lmp_date,patient_id'
    );
    expect(row).toBe('"report-anc-0001","pregnancy",,1710000000000,,,,,,"2024-10-08","2024-01-01","person-patient-0001"');
    await app.close();
  });
});
