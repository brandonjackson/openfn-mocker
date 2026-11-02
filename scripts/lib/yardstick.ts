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
  UNCHECKING_KINDS,
  emptyLedger,
  isVerified,
  ledgerPath,
  readLedger,
  type ConformanceLedger,
  type Deviation,
  type RouteAlias,
  type RouteState,
  type SpecCoverage,
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
  /** Ledger entries too broad to accept (a whole-body schema deviation with no `message`), with why. */
  invalid: { deviation: Deviation; reason: string }[];
  /** Every route verified, nothing unrouted, nothing stale. */
  clean: boolean;
}

/** Route aliases: 'GET /products' -> 'GET /api/products' when the ledger declares '/' as an alias of '/api/'. */
export function aliasMap(routes: string[], aliases: RouteAlias[] = []): Map<string, string> {
  const set = new Set(routes);
  const out = new Map<string, string>();
  for (const route of routes) {
    const sp = route.indexOf(' ');
    const method = route.slice(0, sp);
    const path = route.slice(sp + 1);
    for (const a of aliases) {
      if (!path.startsWith(a.prefix) || path.startsWith(a.canonical)) continue;
      const canonical = `${method} ${a.canonical}${path.slice(a.prefix.length)}`;
      if (canonical !== route && set.has(canonical)) {
        out.set(route, canonical);
        break;
      }
    }
  }
  return out;
}

const isRootPointer = (p: string | undefined): boolean => p === undefined || p === '' || p === '/';

/** Why a deviation is too broad to accept, or undefined if it's fine. */
export function deviationProblem(d: Deviation): string | undefined {
  if ((d.kind === 'response-schema' || d.kind === 'request-schema') && isRootPointer(d.pointer) && !d.message) {
    return 'a whole-body schema deviation must name the violation with `message`, or it would accept any future one';
  }
  return undefined;
}

export const loadLedger = (systemsDir: string, system: string): ConformanceLedger =>
  readLedger(system, systemsDir) ?? emptyLedger();

/** The snapshot part of a ledger for a score (deviations are carried over untouched). */
export function snapshotOf(
  score: SystemScore,
  spec: ConformanceLedger['spec'],
  coverage?: SpecCoverage
): Omit<ConformanceLedger, 'deviations'> {
  const routes: Record<string, RouteState> = {};
  const failures: Record<string, string[]> = {};
  for (const r of score.routes) {
    routes[r.route] = r.state;
    if (r.violations.length) failures[r.route] = [...new Set(r.violations.map(describeViolation))].sort();
  }
  return {
    spec,
    ...(coverage ? { coverage } : {}),
    routes,
    failures,
    unrouted: [...new Set(score.unrouted.map((u) => u.exchange))].sort(),
  };
}

export const describeViolation = (v: Violation): string =>
  `${v.kind}${v.pointer && v.pointer !== '/' ? ` ${normalizePointer(v.pointer)}` : ''}: ${v.message}`;

export function saveLedger(systemsDir: string, system: string, ledger: ConformanceLedger): void {
  const body: ConformanceLedger = {
    spec: ledger.spec,
    ...(ledger.coverage ? { coverage: ledger.coverage } : {}),
    ...(ledger.specMounts?.length ? { specMounts: ledger.specMounts } : {}),
    ...(ledger.routeAliases?.length ? { routeAliases: ledger.routeAliases } : {}),
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
  d.route === route &&
  d.kind === v.kind &&
  (d.pointer === undefined || normalizePointer(d.pointer) === normalizePointer(v.pointer)) &&
  (d.message === undefined || v.message.includes(d.message));

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
  routeAliases?: RouteAlias[];
}): SystemScore {
  const { system } = input;
  const invalid = input.deviations.flatMap((d) => {
    const reason = deviationProblem(d);
    return reason ? [{ deviation: d, reason }] : [];
  });
  const deviations = input.deviations.filter((d) => !deviationProblem(d));
  const aliases = aliasMap(input.routes, input.routeAliases);
  const byRoute = new Map<string, RouteResult>();
  for (const route of input.routes) {
    if (!aliases.has(route)) byRoute.set(route, { route, state: 'unexercised', exchanges: 0, violations: [], accepted: [] });
  }

  const used = new Set<Deviation>();
  const unrouted: SystemScore['unrouted'] = [];
  input.exchanges.forEach((ex, i) => {
    const served = input.routeOf[i];
    const route = served && (aliases.get(served) ?? served);
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
    else if (r.accepted.some((v) => UNCHECKING_KINDS.includes(v.kind))) r.state = 'unchecked';
    else if (r.accepted.length) r.state = 'deviating';
    else r.state = 'conforming';
  }
  const counts = { routes: routes.length, verified: 0, conforming: 0, deviating: 0, unchecked: 0, failing: 0, unexercised: 0 };
  for (const r of routes) counts[r.state]++;
  counts.verified = counts.conforming + counts.deviating;

  const stale = deviations.filter((d) => !used.has(d));
  return {
    system,
    routes,
    counts,
    unrouted,
    stale,
    invalid,
    clean: counts.verified === counts.routes && unrouted.length === 0 && stale.length === 0 && invalid.length === 0,
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
  /** Anything else in the snapshot differs (states, failure detail, routes added/removed, unrouted, spec, coverage). */
  stale: boolean;
}

export function diffBaseline(
  score: SystemScore,
  ledger: ConformanceLedger,
  spec: ConformanceLedger['spec'],
  coverage?: SpecCoverage
): BaselineDiff {
  const now = new Set(verifiedRoutes(score));
  const before = new Set(Object.entries(ledger.routes).filter(([, st]) => isVerified(st)).map(([r]) => r));
  const { deviations: _d, specMounts: _m, routeAliases: _a, ...recorded } = ledger;
  return {
    system: score.system,
    regressed: [...before].filter((r) => !now.has(r)),
    gained: [...now].filter((r) => !before.has(r)),
    stale: canonical(recorded) !== canonical(snapshotOf(score, spec, coverage)),
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
