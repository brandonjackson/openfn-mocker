/**
 * The conformance yardstick: how much of what the mock serves is verified
 * against the adaptor's OpenAPI spec.
 *
 * The denominator is the mock's own routes, not the vendor's whole API (a mock
 * only needs to impersonate what the adaptor calls, and asana's spec has 249
 * operations to the mock's 7). Every route lands in exactly one state:
 *
 *   conforming   exercised by the guide; every exchange matched a spec
 *                operation and passed its schemas
 *   deviating    exercised; every violation it produced is an accepted entry
 *                in the system's deviations ledger (the spec, not the mock, is
 *                wrong, with evidence)
 *   failing      exercised; at least one violation that is not accepted
 *   unexercised  no guide example reaches it, so nothing is known
 *
 * A route is **verified** when it is conforming or deviating. The headline
 * score is verified / routes, overall and per system.
 *
 * Each system's ledger, `src/systems/<name>/conformance.json` (format and
 * reader in src/conformance-ledger.ts), holds the accepted deviations and a
 * snapshot of this score. One file per system, so parallel work on different
 * systems never conflicts. `--check-baseline` fails when a route the snapshot
 * records as verified no longer is (a regression), when the snapshot is out of
 * date (lock gains in with --update-baseline), and when a deviation matches no
 * violation (it is **stale**: the ledger cannot outlive the problem it excuses).
 */
import { writeFileSync } from 'node:fs';
import type { Exchange, Violation } from 'openfn-api-specs';
import {
  emptyLedger,
  isVerified,
  ledgerPath,
  readLedger,
  type ConformanceLedger,
  type Deviation,
  type RouteState,
} from '../../src/conformance-ledger.js';

export type { ConformanceLedger, Deviation, RouteState };

export interface RouteResult {
  route: string;
  state: RouteState;
  exchanges: number;
  /** Violations not covered by a deviation. */
  violations: Violation[];
  /** Violations covered by a deviation. */
  accepted: Violation[];
}

export interface SystemScore {
  system: string;
  routes: RouteResult[];
  counts: Record<RouteState, number> & { routes: number; verified: number };
  /** Exchanges no mock route served (the mock 404'd a guide example), with their violations. */
  unrouted: { exchange: string; violations: Violation[] }[];
  /** Ledger entries that matched nothing on this run. */
  stale: Deviation[];
  /** Every route verified, nothing unrouted, nothing stale. */
  clean: boolean;
}

export const loadLedger = (systemsDir: string, system: string): ConformanceLedger =>
  readLedger(system, systemsDir) ?? emptyLedger();

/** The snapshot part of a ledger for a score (deviations are carried over untouched). */
export function snapshotOf(score: SystemScore, spec: ConformanceLedger['spec']): Omit<ConformanceLedger, 'deviations'> {
  const routes: Record<string, RouteState> = {};
  const failures: Record<string, string[]> = {};
  for (const r of score.routes) {
    routes[r.route] = r.state;
    if (r.violations.length) failures[r.route] = [...new Set(r.violations.map(describeViolation))].sort();
  }
  return { spec, routes, failures, unrouted: [...new Set(score.unrouted.map((u) => u.exchange))].sort() };
}

export const describeViolation = (v: Violation): string =>
  `${v.kind}${v.pointer && v.pointer !== '/' ? ` ${normalizePointer(v.pointer)}` : ''}: ${v.message}`;

export function saveLedger(systemsDir: string, system: string, ledger: ConformanceLedger): void {
  const body: ConformanceLedger = {
    spec: ledger.spec,
    routes: ledger.routes,
    failures: ledger.failures,
    unrouted: ledger.unrouted,
    deviations: ledger.deviations,
  };
  writeFileSync(ledgerPath(systemsDir, system), JSON.stringify(body, null, 2) + '\n');
}

/** Replace array-index segments with `*` ('/results/0/age' becomes '/results/' + '*' + '/age'). */
export const normalizePointer = (p: string | undefined): string => (p ?? '').replace(/\/\d+(?=\/|$)/g, '/*');

const covers = (d: Deviation, route: string, v: Violation): boolean =>
  d.route === route && d.kind === v.kind && (d.pointer === undefined || normalizePointer(d.pointer) === normalizePointer(v.pointer));

/**
 * Score one system. `violationsOf[i]` are the violations for `exchanges[i]`,
 * `routeOf[i]` the mock route that served it.
 */
export function scoreSystem(input: {
  system: string;
  routes: string[];
  exchanges: Exchange[];
  routeOf: (string | undefined)[];
  violationsOf: Violation[][];
  deviations: Deviation[];
}): SystemScore {
  const { system, deviations } = input;
  const byRoute = new Map<string, RouteResult>();
  for (const route of input.routes) byRoute.set(route, { route, state: 'unexercised', exchanges: 0, violations: [], accepted: [] });

  const used = new Set<Deviation>();
  const unrouted: SystemScore['unrouted'] = [];
  input.exchanges.forEach((ex, i) => {
    const route = input.routeOf[i];
    const vs = input.violationsOf[i] ?? [];
    if (!route) {
      unrouted.push({ exchange: `${ex.method} ${ex.path.split('?')[0]}`, violations: vs });
      return;
    }
    let r = byRoute.get(route);
    if (!r) {
      // Served by a route registered outside onRoute's view (shouldn't happen); count it anyway.
      r = { route, state: 'unexercised', exchanges: 0, violations: [], accepted: [] };
      byRoute.set(route, r);
    }
    r.exchanges++;
    for (const v of vs) {
      const d = deviations.find((d) => covers(d, route, v));
      if (d) {
        used.add(d);
        r.accepted.push(v);
      } else r.violations.push(v);
    }
  });

  const routes = [...byRoute.values()].sort((a, b) => a.route.localeCompare(b.route));
  for (const r of routes) {
    if (r.exchanges === 0) r.state = 'unexercised';
    else if (r.violations.length) r.state = 'failing';
    else if (r.accepted.length) r.state = 'deviating';
    else r.state = 'conforming';
  }
  const counts = { routes: routes.length, verified: 0, conforming: 0, deviating: 0, failing: 0, unexercised: 0 };
  for (const r of routes) counts[r.state]++;
  counts.verified = counts.conforming + counts.deviating;

  const stale = deviations.filter((d) => !used.has(d));
  return {
    system,
    routes,
    counts,
    unrouted,
    stale,
    clean: counts.verified === counts.routes && unrouted.length === 0 && stale.length === 0,
  };
}

export const verifiedRoutes = (s: SystemScore): string[] =>
  s.routes.filter((r) => r.state === 'conforming' || r.state === 'deviating').map((r) => r.route);

export interface BaselineDiff {
  system: string;
  /** Recorded as verified, not verified now. */
  regressed: string[];
  /** Verified now, not recorded as verified. */
  gained: string[];
  /** Anything else in the snapshot differs (states, failure detail, routes added/removed, unrouted, spec). */
  stale: boolean;
}

export function diffBaseline(score: SystemScore, ledger: ConformanceLedger, spec: ConformanceLedger['spec']): BaselineDiff {
  const now = new Set(verifiedRoutes(score));
  const before = new Set(Object.entries(ledger.routes).filter(([, st]) => isVerified(st)).map(([r]) => r));
  const { deviations: _d, ...recorded } = ledger;
  return {
    system: score.system,
    regressed: [...before].filter((r) => !now.has(r)),
    gained: [...now].filter((r) => !before.has(r)),
    stale: canonical(recorded) !== canonical(snapshotOf(score, spec)),
  };
}

/** Key-order-insensitive JSON, so a hand-reformatted ledger doesn't read as stale. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val
  );
}

export const pct = (n: number, d: number): string => (d ? `${Math.round((n / d) * 1000) / 10}%` : '—');
