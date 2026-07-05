import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import erpnext from '../src/systems/erpnext/plugin.js';

const config = { port: 0 };

describe('erpnext (Frappe REST)', () => {
  it('lists seeded Customer documents in a { data } envelope', async () => {
    const { app } = await createSystemServer(erpnext, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/resource/Customer' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
    await app.close();
  });

  it('creates a document (201) and echoes it under data', async () => {
    const { app } = await createSystemServer(erpnext, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/resource/Customer',
      payload: { customer_name: 'Gamma Distributors', customer_type: 'Company' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.customer_name).toBe('Gamma Distributors');
    expect(typeof res.json().data.name).toBe('string');
    await app.close();
  });

  it('reads a seeded document by name', async () => {
    const { app } = await createSystemServer(erpnext, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/resource/Customer/CUST-0001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.customer_name).toBe('Acme Corporation');
    await app.close();
  });

  it('updates a document and merges the changes', async () => {
    const { app } = await createSystemServer(erpnext, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/resource/Customer/CUST-0001',
      payload: { customer_group: 'Non Profit' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.customer_group).toBe('Non Profit');
    expect(res.json().data.customer_name).toBe('Acme Corporation'); // untouched
    await app.close();
  });

  it('deletes a document and replies { message: "ok" }', async () => {
    const { app, store } = await createSystemServer(erpnext, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'DELETE', url: '/api/resource/Customer/CUST-0002' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('ok');
    expect(store.get('Customer', 'CUST-0002')).toBeUndefined();
    await app.close();
  });

  it('counts documents via frappe.client.get_count -> { message }', async () => {
    const { app } = await createSystemServer(erpnext, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/method/frappe.client.get_count?doctype=Customer',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe(2);
    await app.close();
  });
});
