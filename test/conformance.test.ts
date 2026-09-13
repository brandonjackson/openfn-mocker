import { describe, it, expect } from 'vitest';
import { createConformer, getOpenapi } from 'openfn-api-specs';
import dhis2 from '../src/systems/dhis2/plugin.js';
import { createSystemServer } from '../src/server.js';
import { attachExchangeCapture, guideExchanges, harnessConfig, resolveGuideExamples } from '../scripts/lib/conformance.js';

describe('conformance capture', () => {
  it('harnessConfig keeps the system block but strips fault injection', () => {
    const config = harnessConfig('dhis2');
    expect(config.version).toBe('2.39');
    expect(config.error_rate).toBeUndefined();
    expect(config.rate_limit).toBeUndefined();
    expect(config.latency).toBeUndefined();
    expect(config.port).toBe(0);
  });

  it('guideExchanges records one exchange per guide example, with parsed JSON bodies', async () => {
    const { exchanges, examples } = await guideExchanges(dhis2);
    expect(examples.length).toBe(dhis2.guide!.examples.length);
    expect(exchanges.length).toBe(examples.length);
    for (const ex of exchanges) {
      expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(ex.method);
      expect(ex.path.startsWith('/')).toBe(true);
      expect(ex.path.includes('/_admin')).toBe(false);
      expect(typeof ex.status).toBe('number');
      expect(ex.status).toBeLessThan(500);
      if (ex.contentType?.includes('json') && ex.responseBody !== undefined) {
        expect(typeof ex.responseBody).toBe('object');
      }
    }
    const post = exchanges.find((e) => e.method === 'POST');
    expect(post?.requestBody).toBeTypeOf('object');
    const get = exchanges.find((e) => e.method === 'GET');
    expect(get?.requestBody).toBeUndefined();
  });

  it('resolveGuideExamples interpolates {{tokens}} from the config', () => {
    const examples = resolveGuideExamples(dhis2, harnessConfig('dhis2'));
    expect(examples.some((e) => JSON.stringify(e).includes('{{'))).toBe(false);
  });

  it('attachExchangeCapture ignores the admin API and records status + content type', async () => {
    const { app } = await createSystemServer(dhis2, harnessConfig('dhis2'), { logLevel: 'silent' });
    const cap = attachExchangeCapture(app);
    try {
      await app.inject({ method: 'GET', url: '/_admin/requests' });
      await app.inject({ method: 'GET', url: '/api/system/info' });
      await app.inject({ method: 'GET', url: '/definitely/not/a/route' });
    } finally {
      await app.close();
    }
    expect(cap.exchanges.map((e) => [e.method, e.path.split('?')[0], e.status])).toEqual([
      ['GET', '/api/system/info', 200],
      ['GET', '/definitely/not/a/route', 404],
    ]);
    expect(cap.exchanges[0].contentType).toMatch(/application\/json/);
  });

  it('the captured exchanges are consumable by the api-specs conformance engine', async () => {
    const spec = getOpenapi('dhis2');
    expect(spec?.paths).toBeTruthy();
    const { exchanges } = await guideExchanges(dhis2);
    const conformer = createConformer(spec);
    const violations = conformer.checkAll(exchanges);
    expect(Array.isArray(violations)).toBe(true);
    const coverage = conformer.coverage();
    expect(coverage.exchanges).toBe(exchanges.length);
    // At least the guide's system/info and organisationUnits reads exist in the spec.
    expect(coverage.hit).toContain('GET /api/system/info');
    expect(coverage.hit).toContain('GET /api/organisationUnits');
  });
});
