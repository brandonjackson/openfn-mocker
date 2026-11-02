import { describe, it, expect, afterAll } from 'vitest';
import { buildServer } from '../src/app.js';
import { plugins } from '../src/systems/index.js';
import { readLedger, summarizeLedger } from '../src/conformance-ledger.js';
import { buildStatusReport, rate, renderStatusPage } from '../src/status.js';
import type { MockerConfig } from '../src/config.js';
import { adaptorCatalog } from '../src/adaptor-catalog.js';

// Only one system enabled: the status page must still list every system the mocker ships.
const config: MockerConfig = { log_level: 'silent', port: 0, systems: { dhis2: { enabled: true, port: 0 } } };
const { app } = await buildServer(config);
afterAll(() => app.close());

describe('conformance status page', () => {
  it('rates by share of routes verified, and only a clean ledger is "verified"', () => {
    const sum = (verified: number, routes: number, unrouted = 0) => ({
      routes,
      verified,
      unrouted,
      counts: { conforming: verified, deviating: 0, failing: routes - verified, unexercised: 0 },
      clean: verified === routes && unrouted === 0,
    });
    expect(rate(undefined)).toBe('not-measured');
    expect(rate(sum(5, 5))).toBe('verified');
    expect(rate(sum(5, 5, 1))).toBe('strong');
    expect(rate(sum(3, 4))).toBe('strong');
    expect(rate(sum(2, 4))).toBe('partial');
    expect(rate(sum(1, 4))).toBe('weak');
    expect(rate(sum(0, 4))).toBe('unverified');
  });

  it('the report covers every shipped system and its totals add up from the ledgers', () => {
    const report = buildStatusReport();
    expect(report.systems.map((s) => s.name).sort()).toEqual(Object.keys(plugins).sort());
    let routes = 0;
    let verified = 0;
    for (const name of Object.keys(plugins)) {
      const l = readLedger(name);
      if (!l) continue;
      const s = summarizeLedger(l);
      routes += s.routes;
      verified += s.verified;
    }
    expect(report.totals.routes).toBe(routes);
    expect(report.totals.verified).toBe(verified);
    expect(Object.values(report.totals.byRating).reduce((a, b) => a + b, 0)).toBe(report.totals.systems);
  });

  it('accounts for every OpenFn adaptor: mocked, or listed as not represented', () => {
    const { missing } = buildStatusReport();
    const listed = Object.values(missing.byKind).flat().length;
    expect(missing.represented + listed).toBe(missing.total);
    // Every mocked adaptor must be in the catalog; if not, the catalog is stale (pnpm catalog:refresh).
    const catalog = new Set(adaptorCatalog.adaptors.map((a) => a.name));
    for (const [name, p] of Object.entries(plugins)) expect(catalog, `${name} not in adaptor catalog`).toContain(p.adaptorName ?? name);
  });

  it('serves HTML to browsers, listing every system with a rating', async () => {
    const res = await app.inject({ method: 'GET', url: '/status', headers: { accept: 'text/html' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    for (const name of Object.keys(plugins)) expect(res.body).toContain(`id="sys-${name}"`);
    expect(res.body).toContain('Spec conformance');
  });

  it('serves the same data as JSON to API clients', async () => {
    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = res.json();
    expect(body.systems).toHaveLength(Object.keys(plugins).length);
    expect(body.totals.routes).toBe(buildStatusReport().totals.routes);
    expect(body.systems[0]).toHaveProperty('rating');
  });

  it('escapes ledger text into the page', () => {
    const report = buildStatusReport();
    const s = report.systems[0];
    const evil = { ...s, title: '<script>x</script>' };
    const html = renderStatusPage({ ...report, systems: [evil] });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});
