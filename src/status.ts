/**
 * The conformance status page, served at GET /status.
 *
 * Lists every system the mocker ships (whether or not it is enabled in this
 * deployment) and rates how closely its mock matches the adaptor's OpenAPI
 * spec in openfn-api-specs. Everything comes from the per-system ledgers
 * (`src/systems/<name>/conformance.json`, see src/conformance-ledger.ts), which
 * `pnpm test:conformance -- --update-baseline` writes and CI keeps current, so
 * the page needs no spec at runtime and can never disagree with the check.
 *
 * Server-rendered and self-contained like the sandbox (same chrome, inline CSS,
 * a few lines of JS for filtering and sorting). JSON clients get the same data
 * from the same URL.
 */
import { plugins } from './systems/index.js';
import {
  ROUTE_STATES,
  readLedger,
  summarizeLedger,
  type ConformanceLedger,
  type LedgerSummary,
  type RouteState,
} from './conformance-ledger.js';
import { FAVICON_B64, FOOTER, STYLES, esc, navbar } from './sandbox.js';
import { adaptorCatalog, type CatalogEntry, type CatalogKind } from './adaptor-catalog.js';

export type Rating = 'verified' | 'strong' | 'partial' | 'weak' | 'unverified' | 'not-measured';

export const RATINGS: { id: Rating; label: string; rule: string }[] = [
  { id: 'verified', label: 'Verified', rule: 'every route verified, every guide request routed' },
  { id: 'strong', label: 'Strong', rule: '75% or more of routes verified' },
  { id: 'partial', label: 'Partial', rule: '40% to 75% verified' },
  { id: 'weak', label: 'Weak', rule: 'under 40% verified' },
  { id: 'unverified', label: 'Unverified', rule: 'no route verified yet' },
  { id: 'not-measured', label: 'Not measured', rule: 'no ledger: no guide examples or no spec to check against' },
];

const RATING_ORDER: Rating[] = RATINGS.map((r) => r.id);

export function rate(sum: LedgerSummary | undefined): Rating {
  if (!sum || sum.routes === 0) return 'not-measured';
  if (sum.clean) return 'verified';
  const share = sum.verified / sum.routes;
  if (share >= 0.75) return 'strong';
  if (share >= 0.4) return 'partial';
  if (share > 0) return 'weak';
  return 'unverified';
}

/** How the spec a system is measured against was obtained, and so how much a "verified" is worth. */
const SPEC_ORIGINS: Record<string, { label: string; note: string }> = {
  'found-openapi': { label: 'Vendor OpenAPI', note: 'the vendor publishes this OpenAPI document' },
  converted: { label: 'Vendor spec, converted', note: 'converted from a vendor machine spec (Swagger, Discovery, ...)' },
  generated: { label: 'From vendor docs', note: 'written by hand from the vendor’s HTML docs' },
  synthesized: { label: 'From the adaptor', note: 'modelled from the adaptor’s own operation surface' },
};

export interface SystemStatus {
  name: string;
  title: string;
  adaptor: string;
  rating: Rating;
  summary?: LedgerSummary;
  ledger?: ConformanceLedger;
}

export interface StatusReport {
  systems: SystemStatus[];
  /** OpenFn adaptors with no mock here, grouped by whether one could exist. */
  missing: { asOf: string; source: string; total: number; represented: number; byKind: Record<CatalogKind, CatalogEntry[]> };
  totals: {
    systems: number;
    measured: number;
    verifiedSystems: number;
    routes: number;
    verified: number;
    counts: Record<RouteState, number>;
    deviations: number;
    byRating: Record<Rating, number>;
  };
}

export function buildStatusReport(): StatusReport {
  const systems: SystemStatus[] = Object.keys(plugins).map((name) => {
    const plugin = plugins[name];
    const ledger = readLedger(name);
    const summary = ledger ? summarizeLedger(ledger) : undefined;
    return {
      name,
      title: plugin.guide?.title ?? name,
      adaptor: ledger?.spec?.adaptor ?? plugin.adaptorName ?? name,
      rating: rate(summary),
      summary,
      ledger,
    };
  });
  systems.sort(byScore);

  const counts: Record<RouteState, number> = { conforming: 0, deviating: 0, unchecked: 0, failing: 0, unexercised: 0 };
  const byRating = Object.fromEntries(RATING_ORDER.map((r) => [r, 0])) as Record<Rating, number>;
  let routes = 0;
  let deviations = 0;
  for (const s of systems) {
    byRating[s.rating]++;
    if (!s.summary) continue;
    routes += s.summary.routes;
    deviations += s.ledger!.deviations.length;
    for (const st of ROUTE_STATES) counts[st] += s.summary.counts[st];
  }
  const mocked = new Set(systems.map((s) => plugins[s.name].adaptorName ?? s.name));
  const byKind: Record<CatalogKind, CatalogEntry[]> = { http: [], protocol: [], 'no-remote': [] };
  for (const a of adaptorCatalog.adaptors) if (!mocked.has(a.name)) byKind[a.kind].push(a);
  const missing = {
    asOf: adaptorCatalog.asOf,
    source: adaptorCatalog.source,
    total: adaptorCatalog.adaptors.length,
    represented: adaptorCatalog.adaptors.filter((a) => mocked.has(a.name)).length,
    byKind,
  };

  return {
    systems,
    missing,
    totals: {
      systems: systems.length,
      measured: systems.filter((s) => s.summary && s.summary.routes > 0).length,
      verifiedSystems: byRating.verified,
      routes,
      verified: counts.conforming + counts.deviating,
      counts,
      deviations,
      byRating,
    },
  };
}

const share = (s: SystemStatus): number => (s.summary && s.summary.routes ? s.summary.verified / s.summary.routes : -1);

/** Best first: by rating, then share verified, then more routes verified, then name. */
function byScore(a: SystemStatus, b: SystemStatus): number {
  return (
    RATING_ORDER.indexOf(a.rating) - RATING_ORDER.indexOf(b.rating) ||
    share(b) - share(a) ||
    (b.summary?.verified ?? 0) - (a.summary?.verified ?? 0) ||
    a.title.localeCompare(b.title)
  );
}

const pct = (n: number, d: number): string => (d ? `${Math.round((n / d) * 100)}%` : '–');

const STATE_LABEL: Record<RouteState, string> = {
  conforming: 'Conforming',
  deviating: 'Deviating (accepted)',
  unchecked: 'Unchecked (accepted, body not validated)',
  failing: 'Failing',
  unexercised: 'Unexercised',
};

function bar(counts: Record<RouteState, number>, total: number, big = false): string {
  if (!total) return '<div class="st-bar st-bar-empty' + (big ? ' big' : '') + '" aria-hidden="true"></div>';
  const label = ROUTE_STATES.map((s) => `${counts[s]} ${STATE_LABEL[s].toLowerCase()}`).join(', ');
  const segs = ROUTE_STATES.filter((s) => counts[s] > 0)
    .map((s) => `<span class="seg ${s}" style="flex-grow:${counts[s]}"></span>`)
    .join('');
  return `<div class="st-bar${big ? ' big' : ''}" role="img" aria-label="${esc(label)}" title="${esc(label)}">${segs}</div>`;
}

const badge = (r: Rating): string =>
  `<span class="st-badge ${r}">${esc(RATINGS.find((x) => x.id === r)!.label)}</span>`;

const linkOrText = (s: string): string =>
  /^https?:\/\//.test(s) ? `<a href="${esc(s).replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${esc(s)}</a>` : esc(s);

/** Route table order in a system's detail: what needs work first. */
const DETAIL_ORDER: RouteState[] = ['failing', 'unexercised', 'unchecked', 'deviating', 'conforming'];

function renderDetail(s: SystemStatus): string {
  const l = s.ledger;
  if (!l || !s.summary?.routes) {
    return '<p class="st-muted">No ledger for this system yet. It needs guide examples and a spec in openfn-api-specs before it can be measured.</p>';
  }
  const rows = Object.entries(l.routes)
    .sort(([ra, sa], [rb, sb]) => DETAIL_ORDER.indexOf(sa) - DETAIL_ORDER.indexOf(sb) || ra.localeCompare(rb))
    .map(([route, state]) => {
      const notes: string[] = [];
      for (const f of l.failures[route] ?? []) notes.push(`<li>${esc(f)}</li>`);
      if (state === 'deviating' || state === 'unchecked') {
        for (const d of l.deviations.filter((d) => d.route === route)) {
          notes.push(`<li><span class="st-cat">${esc(d.category)}</span> ${esc(d.reason)}</li>`);
        }
      }
      const [method, ...rest] = route.split(' ');
      return (
        `<tr class="r-${state}"><td><span class="st-state ${state}">${esc(STATE_LABEL[state].replace(/ \(.*\)$/, ''))}</span></td>` +
        `<td class="mono"><b>${esc(method)}</b> ${esc(rest.join(' '))}</td>` +
        `<td>${notes.length ? `<ul class="st-notes">${notes.join('')}</ul>` : ''}</td></tr>`
      );
    })
    .join('');
  const origin = l.spec?.origin ? SPEC_ORIGINS[l.spec.origin] : undefined;
  const parts = [
    `<p class="st-meta">Measured against the <b>${esc(s.adaptor)}</b> spec` +
      (origin ? ` (${esc(origin.note)})` : '') +
      `. <a href="https://github.com/brandonjackson/openfn-api-specs/tree/main/specs/adaptors/${encodeURIComponent(s.adaptor)}" target="_blank" rel="noopener">View spec</a></p>`,
    `<div class="st-table-wrap"><table class="st-routes"><thead><tr><th>State</th><th>Route</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`,
  ];
  if (l.unrouted.length) {
    parts.push(
      `<p class="st-sub">Guide requests no mock route served</p><ul class="st-notes mono">${l.unrouted.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>`
    );
  }
  if (l.deviations.length) {
    parts.push(
      `<p class="st-sub">Accepted deviations (${l.deviations.length})</p><ul class="st-devs">` +
        l.deviations
          .map(
            (d) =>
              `<li><span class="mono">${esc(d.route)}</span> <span class="st-cat">${esc(d.category)}</span> <span class="st-muted">${esc(d.kind)}${d.pointer ? ' ' + esc(d.pointer) : ''}</span><br>${esc(d.reason)}<br><span class="st-muted">Evidence: ${linkOrText(d.evidence)}</span></li>`
          )
          .join('') +
        '</ul>'
    );
  }
  return parts.join('');
}

function renderRow(s: SystemStatus): string {
  const sum = s.summary;
  const origin = s.ledger?.spec?.origin;
  const originInfo = origin ? SPEC_ORIGINS[origin] : undefined;
  const score = sum && sum.routes ? sum.verified / sum.routes : -1;
  const counts = sum?.counts ?? { conforming: 0, deviating: 0, unchecked: 0, failing: 0, unexercised: 0 };
  const attrs =
    `data-name="${esc(`${s.title} ${s.name} ${s.adaptor}`.toLowerCase())}" data-rating="${s.rating}" ` +
    `data-score="${score.toFixed(4)}" data-routes="${sum?.routes ?? 0}" data-failing="${counts.failing}" data-title="${esc(s.title.toLowerCase())}"`;
  return (
    `<details class="st-row" id="sys-${esc(s.name)}" ${attrs}><summary>` +
    `<span class="st-name"><b>${esc(s.title)}</b><span class="st-muted mono">${esc(s.name)}</span></span>` +
    `<span class="st-rating">${badge(s.rating)}</span>` +
    `<span class="st-score">${sum && sum.routes ? `<b>${pct(sum.verified, sum.routes)}</b> <span class="st-muted">${sum.verified}/${sum.routes} routes</span>` : '<span class="st-muted">–</span>'}</span>` +
    `<span class="st-barcell">${bar(counts, sum?.routes ?? 0)}</span>` +
    `<span class="st-origin st-muted"${originInfo ? ` title="${esc(originInfo.note)}"` : ''}>${esc(originInfo?.label ?? origin ?? '')}</span>` +
    `</summary><div class="st-detail">${renderDetail(s)}</div></details>`
  );
}

export function renderStatusPage(report: StatusReport = buildStatusReport()): string {
  const t = report.totals;
  const legend = ROUTE_STATES.map(
    (s) => `<span class="st-key"><span class="sw ${s}"></span>${esc(STATE_LABEL[s])} <b>${t.counts[s]}</b></span>`
  ).join('');
  const chips =
    `<button type="button" class="st-chip on" data-filter="all">All <b>${t.systems}</b></button>` +
    RATINGS.filter((r) => t.byRating[r.id] > 0)
      .map((r) => `<button type="button" class="st-chip" data-filter="${r.id}">${esc(r.label)} <b>${t.byRating[r.id]}</b></button>`)
      .join('');
  const scale = RATINGS.map((r) => `<li>${badge(r.id)} ${esc(r.rule)}</li>`).join('');

  return (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<link rel="icon" href="data:image/svg+xml;base64,${FAVICON_B64}">\n` +
    '<title>Mocker conformance status</title>\n' +
    `<style>${STYLES}${STATUS_STYLES}</style>\n</head>\n<body>\n` +
    navbar('/') +
    '<div class="hero"><div class="wrap">' +
    '<h1>Spec conformance</h1>' +
    '<p class="hero-lede">How closely each mock matches its adaptor’s OpenAPI spec in ' +
    '<a href="https://github.com/brandonjackson/openfn-api-specs" target="_blank" rel="noopener">openfn-api-specs</a>. ' +
    'A route is <b>verified</b> when a guide example exercises it and everything it returns passes the spec, ' +
    'or the only mismatches are accepted deviations where the spec itself is wrong.</p>' +
    '<div class="st-stats">' +
    `<div class="st-stat"><span class="st-big">${pct(t.verified, t.routes)}</span><span>of mock routes verified<br><b>${t.verified}</b> of ${t.routes}</span></div>` +
    `<div class="st-stat"><span class="st-big">${t.verifiedSystems}<small>/${t.systems}</small></span><span>systems fully<br>verified</span></div>` +
    `<div class="st-stat"><span class="st-big">${report.missing.represented}<small>/${report.missing.total}</small></span><span>OpenFn adaptors<br><a href="#missing">have a mock</a></span></div>` +
    `<div class="st-stat"><span class="st-big">${t.counts.failing}</span><span>routes failing<br>the spec</span></div>` +
    `<div class="st-stat"><span class="st-big">${t.counts.unexercised}</span><span>routes no guide<br>example reaches</span></div>` +
    '</div>' +
    bar(t.counts, t.routes, true) +
    `<div class="st-legend">${legend}</div>` +
    '</div></div>' +
    '<main class="wrap st-main">' +
    '<div class="st-controls">' +
    '<input type="search" id="st-q" placeholder="Filter systems" aria-label="Filter systems">' +
    '<label class="st-sort">Sort <select id="st-sort"><option value="score">Best first</option><option value="worst">Worst first</option>' +
    '<option value="title">Name</option><option value="routes">Most routes</option><option value="failing">Most failing</option></select></label>' +
    `<div class="st-chips" role="group" aria-label="Filter by rating">${chips}</div>` +
    '</div>' +
    '<div class="st-head" aria-hidden="true"><span>System</span><span>Rating</span><span>Verified</span><span>Routes</span><span>Spec</span></div>' +
    `<div id="st-list">${report.systems.map(renderRow).join('')}</div>` +
    '<p id="st-none" class="st-muted" hidden>No systems match.</p>' +
    renderMissing(report.missing) +
    '<section class="st-about"><h2>How this is measured</h2>' +
    `<ul class="st-scale">${scale}</ul>` +
    '<p>For each system, the mock’s guide examples are fired at it in-process and every request and response is checked against the spec by ' +
    'the openfn-api-specs conformance engine. Every route the mock serves is then either <b>conforming</b>, <b>deviating</b> (its only ' +
    'violations are accepted, with evidence that the spec is wrong, and its response was still checked), <b>unchecked</b> (an accepted deviation means its response was never ' +
    'checked: the spec has no such operation or status), <b>failing</b>, or <b>unexercised</b> (no example reaches it, so nothing is known). Only conforming and deviating count as verified. ' +
    'Results come from each system’s ledger, <span class="mono">src/systems/&lt;name&gt;/conformance.json</span>, refreshed with ' +
    '<span class="mono">pnpm test:conformance -- --update-baseline</span> and checked in CI, so a verified route cannot quietly regress.</p>' +
    '<p>A rating is only as good as the spec behind it: a vendor-published OpenAPI is stronger evidence than one written from the vendor’s HTML docs. ' +
    'The Spec column says which kind each system is measured against.</p>' +
    '</section></main>\n' +
    FOOTER +
    `<script>${STATUS_JS}</script>\n</body>\n</html>\n`
  );
}

const KIND_COPY: Record<CatalogKind, { title: string; blurb: string }> = {
  http: {
    title: 'HTTP APIs with no mock yet',
    blurb: 'Each of these wraps an HTTP API, so a mock could stand in for it; none has been built. Where openfn-api-specs already has a spec, building one is mostly a matter of following it.',
  },
  protocol: {
    title: 'Non-HTTP protocols',
    blurb: 'These speak a database, file-transfer or other wire protocol. An HTTP mock cannot impersonate them; they need a real (containerised) server in tests instead.',
  },
  'no-remote': {
    title: 'Nothing to mock',
    blurb: 'These adaptors call no external system (helpers, local processing, test harnesses), so there is nothing for a mock to stand in for.',
  },
};

function renderMissing(m: StatusReport['missing']): string {
  const missingCount = m.total - m.represented;
  const groups = (['http', 'protocol', 'no-remote'] as CatalogKind[])
    .filter((k) => m.byKind[k].length)
    .map((k) => {
      const items = m.byKind[k]
        .map((a) => {
          const origin = a.specOrigin ? SPEC_ORIGINS[a.specOrigin]?.label ?? a.specOrigin : undefined;
          const tag =
            k === 'http'
              ? origin
                ? `<span class="st-muted">spec: ${esc(origin)}</span>`
                : '<span class="st-nospec">no spec yet</span>'
              : a.note
                ? `<span class="st-muted">${esc(a.note)}</span>`
                : '';
          return `<li><span class="mono">${esc(a.name)}</span>${tag}</li>`;
        })
        .join('');
      return (
        `<div class="st-missing-group"><h3>${esc(KIND_COPY[k].title)} <span class="st-muted">${m.byKind[k].length}</span></h3>` +
        `<p class="st-muted">${esc(KIND_COPY[k].blurb)}</p><ul class="st-missing">${items}</ul></div>`
      );
    })
    .join('');
  return (
    '<section class="st-about st-wide" id="missing"><h2>Not represented in the mocker</h2>' +
    `<p>The mocker covers <b>${m.represented}</b> of the <b>${m.total}</b> adaptors in ` +
    `<a href="${esc(m.source).replace(/"/g, '&quot;')}" target="_blank" rel="noopener">OpenFn/adaptors</a> (as of ${esc(m.asOf)}). ` +
    `The other ${missingCount} have no mock at all, so nothing on this page says anything about them.</p>` +
    groups +
    '</section>'
  );
}

const STATUS_STYLES = [
  '.st-stats{display:flex;flex-wrap:wrap;gap:12px 36px;margin:22px 0 16px}',
  '.st-stat{display:flex;align-items:center;gap:12px;font-size:13.5px;color:var(--muted);line-height:1.35}',
  '.st-big{font-size:34px;font-weight:800;color:var(--ink);letter-spacing:-.02em;line-height:1}',
  '.st-big small{font-size:18px;color:var(--muted);font-weight:700}',
  '.st-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--border-soft);min-width:60px}',
  '.st-bar.big{height:14px;border-radius:7px}',
  '.st-bar .seg{display:block;min-width:3px}',
  '.seg.conforming,.sw.conforming{background:#16a34a}.seg.deviating,.sw.deviating{background:#0ea5e9}',
  '.seg.failing,.sw.failing{background:#dc2626}.seg.unexercised,.sw.unexercised{background:#cbd2d9}',
  '.seg.unchecked,.sw.unchecked{background:#f59e0b}',
  '.st-legend{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:10px;font-size:13.5px;color:var(--muted)}',
  '.st-key{display:inline-flex;align-items:center;gap:6px}.st-key b{color:var(--ink)}',
  '.sw{display:inline-block;width:11px;height:11px;border-radius:3px}',
  '.st-main{padding-top:26px;padding-bottom:60px}',
  '.st-controls{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin-bottom:16px}',
  '#st-q{font:inherit;font-size:14px;padding:7px 11px;border:1px solid var(--border);border-radius:var(--radius);min-width:0;flex:0 1 240px}',
  '.st-sort{font-size:14px;color:var(--muted)}',
  '.st-sort select{font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius);background:#fff;color:var(--ink)}',
  '.st-chips{display:flex;flex-wrap:wrap;gap:6px}',
  '.st-chip{font:inherit;font-size:13px;border:1px solid var(--border);background:#fff;color:var(--ink);border-radius:999px;padding:4px 11px;cursor:pointer}',
  '.st-chip b{color:var(--muted);font-weight:600;margin-left:3px}',
  '.st-chip.on{background:var(--accent-soft);border-color:#cfe3fb;color:var(--accent-strong)}',
  '.st-head,.st-row>summary{display:grid;grid-template-columns:minmax(0,2.2fr) 120px 150px minmax(80px,1.6fr) minmax(0,1.3fr);gap:14px;align-items:center}',
  '.st-head{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;padding:0 14px 8px}',
  '.st-row{border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;background:#fff}',
  '.st-row>summary{padding:11px 14px;cursor:pointer;list-style:none}',
  '.st-row>summary::-webkit-details-marker{display:none}',
  '.st-row>summary:hover{background:var(--wash)}',
  '.st-row[open]>summary{border-bottom:1px solid var(--border-soft)}',
  '.st-name{display:flex;flex-direction:column;min-width:0}.st-name b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.st-name .mono{font-size:12.5px}',
  '.st-muted{color:var(--muted)}',
  '.st-score{font-size:14px;white-space:nowrap}.st-score b{font-size:16px}',
  '.st-origin{font-size:13px}',
  '.st-badge{display:inline-block;font-size:12px;font-weight:700;border-radius:5px;padding:2px 8px;white-space:nowrap}',
  '.st-badge.verified{background:#e3f4e8;color:#0a6b2c}.st-badge.strong{background:#e6f4fb;color:#0369a1}',
  '.st-badge.partial{background:#fff3df;color:#9a4a07}.st-badge.weak{background:#fde8e8;color:#a61b1b}',
  '.st-badge.unverified{background:#b91c1c;color:#fff}.st-badge.not-measured{background:var(--wash);color:var(--muted);border:1px solid var(--border)}',
  '.st-detail{padding:12px 14px 16px;font-size:14px}',
  '.st-meta{margin:0 0 10px;color:var(--muted)}',
  '.st-table-wrap{overflow-x:auto}',
  '.st-routes{width:100%;border-collapse:collapse;font-size:13.5px}',
  '.st-routes th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--border)}',
  '.st-routes td{padding:7px 8px;border-bottom:1px solid var(--border-soft);vertical-align:top}',
  '.st-routes td.mono{font-size:12.5px;word-break:break-all}',
  '.st-state{font-size:11.5px;font-weight:700;border-radius:4px;padding:1px 7px;white-space:nowrap}',
  '.st-state.conforming{background:#e3f4e8;color:#0a6b2c}.st-state.deviating{background:#e6f4fb;color:#0369a1}',
  '.st-state.failing{background:#fde8e8;color:#a61b1b}.st-state.unexercised{background:var(--wash);color:var(--muted)}',
  '.st-state.unchecked{background:#fff3df;color:#9a4a07}',
  '.st-notes{margin:0;padding-left:16px;font-size:12.5px}.st-notes li{margin:1px 0;word-break:break-word}',
  '.st-sub{margin:14px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}',
  '.st-devs{margin:0;padding-left:16px;font-size:13px}.st-devs li{margin-bottom:8px}',
  '.st-cat{font-size:11px;font-weight:700;background:var(--wash);border:1px solid var(--border);border-radius:4px;padding:0 5px}',
  '.st-about{margin-top:34px;font-size:14.5px;color:var(--ink);max-width:80ch}',
  '.st-about h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 10px}',
  '.st-scale{list-style:none;padding:0;margin:0 0 14px}.st-scale li{margin:4px 0}',
  '.st-wide{max-width:none}',
  '.st-missing-group{margin:18px 0 6px}.st-missing-group h3{font-size:16px;margin:0 0 2px}',
  '.st-missing-group>p{margin:0 0 10px;font-size:14px;max-width:80ch}',
  '.st-missing{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px 18px}',
  '.st-missing li{display:flex;flex-direction:column;border:1px solid var(--border-soft);border-radius:6px;padding:6px 10px;font-size:13px;line-height:1.35}',
  '.st-missing li .mono{font-size:13.5px;font-weight:600;color:var(--ink)}',
  '.st-nospec{color:#9a4a07}',
  '@media(max-width:760px){.st-head{display:none}',
  '.st-row>summary{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"name rating" "score score" "bar bar" "origin origin";gap:6px 10px}',
  '.st-name{grid-area:name}.st-rating{grid-area:rating}.st-score{grid-area:score}.st-barcell{grid-area:bar}.st-origin{grid-area:origin}',
  '.st-stats{gap:14px 24px}.st-big{font-size:28px}#st-q{flex:1 1 100%}}',
].join('');

/* Filtering + sorting. Plain ES5, no template literals (kept like the sandbox client). */
const STATUS_JS = [
  '(function(){',
  'var list=document.getElementById("st-list"),q=document.getElementById("st-q"),sel=document.getElementById("st-sort"),none=document.getElementById("st-none");',
  'var rows=[].slice.call(list.children),order=rows.slice(),filter="all";',
  'function apply(){var t=(q.value||"").toLowerCase().trim(),shown=0;',
  'rows.forEach(function(r){var ok=(filter==="all"||r.getAttribute("data-rating")===filter)&&(!t||r.getAttribute("data-name").indexOf(t)>=0);r.hidden=!ok;if(ok)shown++;});',
  'none.hidden=shown>0;}',
  'function num(r,k){return parseFloat(r.getAttribute("data-"+k))||0;}',
  'function sort(){var m=sel.value,s=order.slice();',
  'if(m==="worst")s.reverse();',
  'else if(m==="title")s.sort(function(a,b){return a.getAttribute("data-title")<b.getAttribute("data-title")?-1:1;});',
  'else if(m==="routes")s.sort(function(a,b){return num(b,"routes")-num(a,"routes");});',
  'else if(m==="failing")s.sort(function(a,b){return num(b,"failing")-num(a,"failing");});',
  's.forEach(function(r){list.appendChild(r);});}',
  'q.addEventListener("input",apply);sel.addEventListener("change",sort);',
  '[].forEach.call(document.querySelectorAll(".st-chip"),function(c){c.addEventListener("click",function(){',
  '[].forEach.call(document.querySelectorAll(".st-chip"),function(x){x.classList.remove("on");});c.classList.add("on");filter=c.getAttribute("data-filter");apply();});});',
  'if(location.hash){var d=document.getElementById(location.hash.slice(1));if(d&&d.tagName==="DETAILS"){d.open=true;d.scrollIntoView();}}',
  '})();',
].join('');
