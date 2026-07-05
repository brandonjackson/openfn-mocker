import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createSystemServer } from '../src/server.js';
import { createSpecFallback } from '../src/engine/spec-fallback.js';
import { parseSpec } from '../src/engine/spec-parser.js';
import { DataStore } from '../src/store.js';
import twilio from '../src/systems/twilio/plugin.js';
import httpGeneric from '../src/systems/http-generic/plugin.js';

const SID = 'ACtest123456';
const config = { port: 0, account_sid: SID };

const apps: FastifyInstance[] = [];
async function makeServer(plugin: any, opts: { autoAuth?: boolean } = {}) {
  const built = await createSystemServer(plugin, config, { logLevel: 'silent', ...opts });
  apps.push(built.app);
  return built;
}

afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
});

/** Minimal request stand-in: createSpecFallback only reads url/method/body. */
function fakeReq(method: string, url: string, body?: any): FastifyRequest {
  return { method, url, body } as unknown as FastifyRequest;
}

/** A tiny synthetic OpenAPI spec exercising CRUD + envelopes, spec-less of any real system. */
const SYNTHETIC_SPEC = parseSpec({
  openapi: '3.0.0',
  info: { title: 'synthetic', version: '1' },
  paths: {
    '/api/widgets': {
      get: {
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WidgetList' },
              },
            },
          },
        },
      },
      post: {
        responses: {
          '201': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Widget' },
              },
            },
          },
        },
      },
    },
    '/api/widgets/{id}': {
      get: {
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Widget' },
              },
            },
          },
        },
      },
      patch: {
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Widget' },
              },
            },
          },
        },
      },
      delete: { responses: { '204': { description: 'gone' } } },
    },
    '/api/widgets/special': {
      get: {
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { special: { type: 'boolean', example: true } } },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Widget: {
        type: 'object',
        properties: {
          sid: { type: 'string', example: 'WG0000000000000000' },
          name: { type: 'string', example: 'A widget' },
          status: { type: 'string', enum: ['new', 'active'], example: 'new' },
        },
      },
      WidgetList: {
        type: 'object',
        properties: {
          widgets: { type: 'array', items: { $ref: '#/components/schemas/Widget' } },
          total: { type: 'integer', example: 0 },
        },
      },
    },
  },
});

describe('createSpecFallback (engine)', () => {
  it('declines paths and methods the spec does not document', () => {
    const fallback = createSpecFallback(SYNTHETIC_SPEC, new DataStore());
    expect(fallback(fakeReq('GET', '/api/nope'))).toBeUndefined();
    expect(fallback(fakeReq('PUT', '/api/widgets/w1'))).toBeUndefined();
  });

  it('serves a schema-shaped example for an untouched documented endpoint', () => {
    const fallback = createSpecFallback(SYNTHETIC_SPEC, new DataStore());
    const res = fallback(fakeReq('GET', '/api/widgets/w1'))!;
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ name: 'A widget', status: 'new' });
  });

  it('prefers the more-specific static path over the templated one', () => {
    const fallback = createSpecFallback(SYNTHETIC_SPEC, new DataStore());
    const res = fallback(fakeReq('GET', '/api/widgets/special'))!;
    expect(res.payload).toEqual({ special: true });
  });

  it('strips the mount prefix before matching', () => {
    const fallback = createSpecFallback(SYNTHETIC_SPEC, new DataStore());
    const res = fallback(fakeReq('GET', '/mysystem/api/widgets/special'), '/mysystem');
    expect(res?.payload).toEqual({ special: true });
  });

  it('supports a stateful create -> read -> list -> update -> delete round trip', () => {
    const store = new DataStore();
    const fallback = createSpecFallback(SYNTHETIC_SPEC, store);

    // Create: schema fields filled from examples, id-like field uniquified.
    const created = fallback(fakeReq('POST', '/api/widgets', { name: 'mine' }))!;
    expect(created.statusCode).toBe(201);
    expect(created.payload.name).toBe('mine');
    expect(created.payload.status).toBe('new');
    expect(created.payload.sid).toMatch(/^WG[0-9a-f]{16}$/);
    const sid = created.payload.sid;

    // Two creates never collide on the schema's fixed example id.
    const second = fallback(fakeReq('POST', '/api/widgets', {}))!;
    expect(second.payload.sid).not.toBe(sid);

    // Read back by id.
    const read = fallback(fakeReq('GET', `/api/widgets/${sid}`))!;
    expect(read.statusCode).toBe(200);
    expect(read.payload.name).toBe('mine');

    // List: stored items injected into the schema's envelope.
    const list = fallback(fakeReq('GET', '/api/widgets'))!;
    expect(list.payload.widgets).toHaveLength(2);
    expect(list.payload.widgets.map((w: any) => w.sid)).toContain(sid);

    // Patch merges.
    const patched = fallback(fakeReq('PATCH', `/api/widgets/${sid}`, { status: 'active' }))!;
    expect(patched.payload).toMatchObject({ name: 'mine', status: 'active' });

    // Delete honors the spec's 204, and the id now 404s (collection is touched).
    const del = fallback(fakeReq('DELETE', `/api/widgets/${sid}`))!;
    expect(del.statusCode).toBe(204);
    const gone = fallback(fakeReq('GET', `/api/widgets/${sid}`))!;
    expect(gone.statusCode).toBe(404);
  });
});

describe('spec fallback wired into a system (twilio)', () => {
  it('answers a documented-but-unmodeled endpoint from the spec, tagged spec-fidelity', async () => {
    const { app, requestLog } = await makeServer(twilio);
    const res = await app.inject({ method: 'GET', url: `/2010-04-01/Accounts/${SID}/Balance.json` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-mock-fidelity']).toBe('spec');
    expect(res.json()).toEqual({ account_sid: 'ACtest123456', balance: '12.34', currency: 'USD' });
    const entry = requestLog.list().at(-1)!;
    expect(entry.fidelity).toBe('spec');
    expect(entry.path).toContain('/Balance.json');
  });

  it('serves the call-recordings tail endpoint with the Twilio list envelope', async () => {
    const { app } = await makeServer(twilio);
    const res = await app.inject({
      method: 'GET',
      url: `/2010-04-01/Accounts/${SID}/Calls/CA00000000000000000000000000000000/Recordings.json`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-mock-fidelity']).toBe('spec');
    const body = res.json();
    expect(Array.isArray(body.recordings)).toBe(true);
    expect(body.recordings[0].sid).toMatch(/^RE/);
    expect(body).toHaveProperty('page_size');
  });

  it('leaves modeled routes untouched and tagged modeled', async () => {
    const { app, requestLog } = await makeServer(twilio);
    const res = await app.inject({ method: 'GET', url: `/2010-04-01/Accounts/${SID}/Messages.json` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-mock-fidelity']).toBeUndefined();
    expect(res.json().messages).toHaveLength(5);
    expect(requestLog.list().at(-1)!.fidelity).toBe('modeled');
  });

  it('404s (fidelity none) for paths neither routes nor the spec claim', async () => {
    const { app, requestLog } = await makeServer(twilio);
    const res = await app.inject({ method: 'GET', url: '/2010-04-01/Nope.json' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'Not Found', statusCode: 404 });
    expect(requestLog.list().at(-1)!.fidelity).toBe('none');
  });

  it('still enforces the system auth policy on fallback-served paths', async () => {
    const { app } = await makeServer(twilio, { autoAuth: false });
    const res = await app.inject({ method: 'GET', url: `/2010-04-01/Accounts/${SID}/Balance.json` });
    expect(res.statusCode).toBe(401);
  });
});

describe('fidelity tagging elsewhere', () => {
  it('http-generic echoes are tagged generic in the request log', async () => {
    const { app, requestLog } = await makeServer(httpGeneric);
    const res = await app.inject({ method: 'GET', url: '/anything/at/all' });
    expect(res.statusCode).toBe(200);
    expect(requestLog.list().at(-1)!.fidelity).toBe('generic');
  });
});
