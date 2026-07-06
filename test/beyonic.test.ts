import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import beyonic from '../src/systems/beyonic/plugin.js';

const config = { port: 0 };

describe('beyonic', () => {
  it('creates a payment (201) with a generated integer id and scheduled state', async () => {
    const { app } = await createSystemServer(beyonic, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/payments',
      payload: { phonenumber: '+256777000111', amount: 5000, currency: 'UGX', description: 'Salary' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.id).toBe('number');
    expect(body.state).toBe('scheduled');
    expect(body.amount).toBe(5000);
    await app.close();
  });

  it('lists seeded payments in a results envelope', async () => {
    const { app } = await createSystemServer(beyonic, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/payments' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    await app.close();
  });

  it('creates a contact (201)', async () => {
    const { app } = await createSystemServer(beyonic, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/contacts',
      payload: { first_name: 'Grace', last_name: 'Hopper', phonenumber: '+256777000222' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.first_name).toBe('Grace');
    expect(typeof body.created).toBe('string');
    await app.close();
  });

  it('creates a collection request (201) that starts pending', async () => {
    const { app } = await createSystemServer(beyonic, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/collectionrequests',
      payload: { phonenumber: '+256777000111', amount: 2000, currency: 'UGX' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('pending');
    await app.close();
  });
});
