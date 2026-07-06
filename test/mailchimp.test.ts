import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import mailchimp from '../src/systems/mailchimp/plugin.js';

const config = { port: 0 };

describe('mailchimp', () => {
  it('lists seeded audiences', async () => {
    const { app } = await createSystemServer(mailchimp, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/3.0/lists' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.lists)).toBe(true);
    expect(body.total_items).toBeGreaterThan(0);
    await app.close();
  });

  it('adds a member to an audience', async () => {
    const { app } = await createSystemServer(mailchimp, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/3.0/lists/list_seed01/members',
      payload: { email_address: 'grace@example.com', status: 'subscribed' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.id).toBe('string');
    expect(body.email_address).toBe('grace@example.com');
    expect(body.list_id).toBe('list_seed01');
    await app.close();
  });

  it('returns 204 when tagging a member', async () => {
    const { app } = await createSystemServer(mailchimp, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/3.0/lists/list_seed01/members/hashseed01/tags',
      payload: { tags: [{ name: 'VIP', status: 'active' }] },
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('404s for an unknown audience', async () => {
    const { app } = await createSystemServer(mailchimp, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/3.0/lists/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().status).toBe(404);
    await app.close();
  });
});
