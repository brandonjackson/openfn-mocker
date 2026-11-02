import { describe, it, expect } from 'vitest';
import type { Exchange, Violation } from 'openfn-api-specs';
import dhis2 from '../src/systems/dhis2/plugin.js';
import { guideExchanges } from '../scripts/lib/conformance.js';
import { diffBaseline, normalizePointer, scoreSystem, snapshotOf, verifiedRoutes, type Deviation } from '../scripts/lib/yardstick.js';
import { summarizeLedger } from '../src/conformance-ledger.js';

const ex = (method: string, path: string): Exchange => ({ method, path, status: 200 });
const v = (kind: Violation['kind'], pointer?: string): Violation => ({ kind, exchange: 'x', pointer, message: 'm' });

describe('yardstick', () => {
  const routes = ['GET /a', 'GET /b', 'GET /c', 'GET /d'];
  const exchanges = [ex('GET', '/a'), ex('GET', '/b'), ex('GET', '/c?x=1'), ex('GET', '/nope')];
  const routeOf = ['GET /a', 'GET /b', 'GET /c', undefined];
  const violationsOf: Violation[][] = [[], [v('response-schema', '/rows/3/age')], [v('unknown-status')], [v('unknown-operation')]];

  it('puts every route in exactly one state and scores verified / routes', () => {
    const s = scoreSystem({ system: 't', routes, exchanges, routeOf, violationsOf, deviations: [] });
    expect(Object.fromEntries(s.routes.map((r) => [r.route, r.state]))).toEqual({
      'GET /a': 'conforming',
      'GET /b': 'failing',
      'GET /c': 'failing',
      'GET /d': 'unexercised',
    });
    expect(s.counts).toMatchObject({ routes: 4, verified: 1, failing: 2, unexercised: 1 });
    expect(s.unrouted.map((u) => u.exchange)).toEqual(['GET /nope']);
    expect(s.clean).toBe(false);
  });

  it('an accepted deviation (array indices wildcarded) turns a failing route into a deviating one', () => {
    const deviations: Deviation[] = [
      { route: 'GET /b', kind: 'response-schema', pointer: '/rows/*/age', category: 'vendor-spec-wrong', reason: 'r', evidence: 'e' },
      { route: 'GET /c', kind: 'unknown-status', category: 'spec-gap', reason: 'r', evidence: 'e' },
    ];
    const s = scoreSystem({ system: 't', routes, exchanges, routeOf, violationsOf, deviations });
    expect(s.routes.find((r) => r.route === 'GET /b')?.state).toBe('deviating');
    expect(s.routes.find((r) => r.route === 'GET /c')?.state).toBe('deviating');
    expect(s.counts.verified).toBe(3);
    expect(s.stale).toEqual([]);
  });

  it('a deviation that matches nothing is stale and blocks clean', () => {
    const stale: Deviation = { route: 'GET /a', kind: 'response-schema', category: 'vendor-spec-wrong', reason: 'r', evidence: 'e' };
    const s = scoreSystem({ system: 't', routes: ['GET /a'], exchanges: [exchanges[0]], routeOf: ['GET /a'], violationsOf: [[]], deviations: [stale] });
    expect(s.counts.verified).toBe(1);
    expect(s.stale).toEqual([stale]);
    expect(s.clean).toBe(false);
  });

  it('diffBaseline reports regressions, unrecorded gains and a stale snapshot', () => {
    const s = scoreSystem({ system: 't', routes, exchanges, routeOf, violationsOf, deviations: [] });
    const spec = { adaptor: 't', origin: 'generated' };
    expect(verifiedRoutes(s)).toEqual(['GET /a']);
    const old = { ...snapshotOf(s, spec), deviations: [] };
    old.routes = { ...old.routes, 'GET /a': 'failing', 'GET /b': 'conforming' };
    expect(diffBaseline(s, old, spec)).toEqual({ system: 't', regressed: ['GET /b'], gained: ['GET /a'], stale: true });
    expect(diffBaseline(s, { ...snapshotOf(s, spec), deviations: [] }, spec)).toEqual({ system: 't', regressed: [], gained: [], stale: false });
  });

  it('a snapshot round-trips into the same summary the status page shows', () => {
    const s = scoreSystem({ system: 't', routes, exchanges, routeOf, violationsOf, deviations: [] });
    const snap = snapshotOf(s, { adaptor: 't' });
    expect(snap.failures['GET /b']).toEqual(['response-schema /rows/*/age: m']);
    expect(snap.unrouted).toEqual(['GET /nope']);
    const sum = summarizeLedger({ ...snap, deviations: [] });
    expect(sum).toMatchObject({ routes: 4, verified: 1, unrouted: 1, clean: false });
    expect(sum.counts).toEqual({ conforming: 1, deviating: 0, failing: 2, unexercised: 1 });
  });

  it('normalizePointer wildcards only whole numeric segments', () => {
    expect(normalizePointer('/rows/12/v2/0')).toBe('/rows/*/v2/*');
    expect(normalizePointer(undefined)).toBe('');
  });

  it('guideExchanges reports the routes the mock serves and which one served each exchange', async () => {
    const run = await guideExchanges(dhis2);
    expect(run.routes.length).toBeGreaterThan(5);
    expect(run.routes.some((r) => r.includes('/_admin'))).toBe(false);
    expect(run.routeOf.length).toBe(run.exchanges.length);
    for (const r of run.routeOf) if (r) expect(run.routes).toContain(r);
  });
});
