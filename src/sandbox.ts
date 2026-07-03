/**
 * Browser API sandbox served at GET / (to clients that accept text/html).
 *
 * This module is purely the *renderer*: renderSandboxPage() turns the list of
 * currently running systems into a single self-contained HTML page (inline CSS
 * + JS, no external assets) that fires real requests at the live mock from the
 * browser and shows the responses. Everything it renders about a system comes
 * from that system's plugin, the single source of truth:
 *   - the demo content (blurb + runnable example requests) is authored in a
 *     co-located `guide.ts` and read from `MockSystemPlugin.guide`;
 *   - the credential is declared on `MockSystemPlugin.credential` (visualised +
 *     turned into ready-to-paste suggestions here);
 *   - the per-function "Usage" examples come from `MockSystemPlugin.usage`.
 *
 * The page is served from the same origin as the mock, so its fetch() calls hit
 * the running endpoints directly with no CORS setup.
 */

import { plugins } from './systems/index.js';
import type { CredentialSpec, CredentialFieldSpec, AuthRequirement } from './auth.js';
import type { SandboxExample, SystemGuide, UsageExample } from './systems/types.js';

/** A running system as seen by the renderer. */
export interface RunningSystemView {
  name: string;
  mountPath: string;
  config?: Record<string, unknown>;
}

/** Replace `{{key}}` tokens (except {{ORIGIN}}, resolved in the browser). */
function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key === 'ORIGIN' ? match : key in vars ? vars[key] : match
  );
}

/** Build the `{{token}}` var map for a system (guide defaults, overridden by live config). */
function systemVars(guide: SystemGuide | undefined, sys: RunningSystemView): Record<string, string> {
  const vars: Record<string, string> = { ...(guide?.vars ?? {}) };
  for (const [k, v] of Object.entries(sys.config ?? {})) {
    if (typeof v === 'string' || typeof v === 'number') vars[k] = String(v);
  }
  return vars;
}

/** A credential field resolved for the client (secrets carry their shape, not a value). */
interface ResolvedCredentialField {
  name: string;
  role: CredentialFieldSpec['role'];
  value?: string;
  secret?: CredentialFieldSpec['secret'];
}

/** Everything the client needs to render + generate a system's credential. */
interface ResolvedCredential {
  type: CredentialSpec['type'];
  /** Name of the URL field the adaptor targets (used in the setup steps). */
  urlField: string;
  fields: ResolvedCredentialField[];
  authHeader?: CredentialSpec['authHeader'];
}

/**
 * Resolve a plugin's CredentialSpec for the browser: fill the URL field with the
 * mock origin + mount, interpolate `{{token}}` values, and leave secret fields
 * un-valued (the client generates them). `{{ORIGIN}}` is left for the browser.
 */
function resolveCredential(
  spec: CredentialSpec | undefined,
  mountPath: string,
  vars: Record<string, string>
): ResolvedCredential {
  if (!spec) {
    return {
      type: 'none',
      urlField: 'baseUrl',
      fields: [{ name: 'baseUrl', role: 'url', value: '{{ORIGIN}}' + mountPath }],
    };
  }
  let urlField: string | undefined;
  const fields: ResolvedCredentialField[] = spec.fields.map((f) => {
    if (f.role === 'url') {
      urlField = f.name;
      return { name: f.name, role: 'url', value: '{{ORIGIN}}' + mountPath };
    }
    if (f.role === 'secret') {
      return { name: f.name, role: 'secret', secret: f.secret ?? {} };
    }
    return { name: f.name, role: f.role, value: interpolate(f.value ?? '', vars) };
  });
  return {
    type: spec.type,
    urlField: urlField ?? spec.fields[0]?.name ?? 'baseUrl',
    fields,
    authHeader: spec.authHeader,
  };
}

/**
 * Resolve a guide's examples: interpolate `{{token}}`s, prepend the mount path,
 * and give every example a stable id (`ex0`, `ex1`, … by position when it does
 * not declare its own). The id is the anchor a `usage` example's `apiRef` points
 * at, so authored usage can reference an example by its position without the
 * example needing a hand-written id.
 */
function resolveExamples(
  guide: SystemGuide | undefined,
  mountPath: string,
  vars: Record<string, string>
): SandboxExample[] {
  if (!guide) return [];
  return guide.examples.map((ex, i) => {
    const resolved = JSON.parse(interpolate(JSON.stringify(ex), vars)) as SandboxExample;
    return { ...resolved, id: resolved.id ?? 'ex' + i, path: mountPath + resolved.path };
  });
}

/**
 * Resolve a system's usage examples from its plugin (`MockSystemPlugin.usage`) —
 * the single source of truth, authored per adaptor next to its seed data.
 * `{{token}}`s are interpolated; code is otherwise verbatim.
 */
function resolveUsage(name: string, vars: Record<string, string>): UsageExample[] {
  const list = plugins[name]?.usage ?? [];
  return list.map((u) => JSON.parse(interpolate(JSON.stringify(u), vars)) as UsageExample);
}

/** HTML-escape for text placed in the document (defense in depth). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render the full sandbox HTML page for the given running systems. The returned
 * string is a complete, self-contained HTML document.
 */
export function renderSandboxPage(
  systems: RunningSystemView[],
  opts: { name?: string } = {}
): string {
  const name = opts.name ?? 'openfn-mocker';

  const cards = systems.map((sys) => {
    const plugin = plugins[sys.name];
    const guide = plugin?.guide;
    const vars = systemVars(guide, sys);
    const auth: AuthRequirement | undefined = plugin?.auth;
    return {
      name: sys.name,
      mountPath: sys.mountPath,
      title: guide?.title ?? sys.name,
      blurb: guide?.blurb ?? 'Mounted mock system.',
      auth: guide?.auth ?? 'any',
      docs: guide?.docs,
      // Credential comes from the plugin (single source of truth); the sandbox
      // only visualises it and generates ready-to-paste suggestions.
      credential: resolveCredential(plugin?.credential, sys.mountPath, vars),
      // Whether the *mock* enforces auth (from the plugin's AuthRequirement),
      // surfaced so the sandbox can show "mock requires a credential" vs "open".
      authRequired: Boolean(auth?.required),
      authSchemes: auth?.schemes ?? [],
      examples: resolveExamples(guide, sys.mountPath, vars),
      usage: resolveUsage(sys.name, vars),
    };
  });

  // Everything is ordered alphabetically by title (A–Z) so the content pages
  // match the left-hand nav, which is sorted the same way in the client.
  cards.sort((a, b) => a.title.localeCompare(b.title));

  const data = { name, systems: cards };
  // Escape "<" so the JSON can never terminate the <script> element early.
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    '<!doctype html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="icon" href="data:image/svg+xml;base64,' +
    FAVICON_B64 +
    '">\n' +
    '<title>' +
    esc(name) +
    ' — API sandbox</title>\n' +
    '<style>' +
    STYLES +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    HEADER +
    '<div class="layout">\n' +
    '<aside id="sidebar" class="sidebar"><p class="loading">…</p></aside>\n' +
    '<main id="app" class="content"><p class="loading">Loading sandbox…</p></main>\n' +
    '</div>\n' +
    FOOTER +
    '<script>window.__SANDBOX__ = ' +
    dataJson +
    ';</script>\n' +
    '<script>' +
    CLIENT_JS +
    '</script>\n' +
    '</body>\n' +
    '</html>\n'
  );
}

/* ------------------------------------------------------------------ */
/* Static page chrome. No backticks or ${...} below (this file is not */
/* a template literal, but keeping it plain avoids surprises).        */
/* ------------------------------------------------------------------ */

/**
 * OpenFn logo mark, cleaned from docs.openfn.org's /img/logo.svg: a black
 * square with the brand cyan→magenta gradient and the "Fn" letterforms.
 * Embedded as base64 so the page stays self-contained (no external asset,
 * no /favicon.ico 404). Reused for both the navbar brand and the favicon.
 */
const LOGO_B64 =
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8v' +
  'd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIxMTYuMDcgLTExMi4yOCA4MDAuMDAgODAwLjAw' +
  'Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Im9mZyIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25V' +
  'c2UiIHgxPSIxMzYuMjE4MDUiIHkxPSI2NjcuNTcyMzMiIHgyPSI4OTUuOTIzOTUiIHkyPSItOTIuMTMz' +
  'NjE0Ij48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiM4M2Q2ZTIiLz48c3RvcCBvZmZzZXQ9IjEi' +
  'IHN0b3AtY29sb3I9IiNhZjI3ODMiIHN0b3Atb3BhY2l0eT0iMCIvPjwvbGluZWFyR3JhZGllbnQ+PC9k' +
  'ZWZzPjxyZWN0IHg9IjEzNi4yMTgwNSIgeT0iLTkyLjEzMzYxNCIgd2lkdGg9Ijc1OS43MDU5MyIgaGVp' +
  'Z2h0PSI3NTkuNzA1OTMiIGZpbGw9IiNmZmYiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSI0MC4y' +
  'OTQxIi8+PHJlY3QgeD0iMTM2LjIxODA1IiB5PSItOTIuMTMzNjE0IiB3aWR0aD0iNzU5LjcwNTkzIiBo' +
  'ZWlnaHQ9Ijc1OS43MDU5MyIgZmlsbD0idXJsKCNvZmcpIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0' +
  'aD0iNDAuMjk0MSIvPjxwYXRoIGQ9Im0gMjcxLjY4ODUyLDExOC43Njc0IGggMjA0LjM1MTQ2IHYgNjIu' +
  'MDkzMTggSCAzNDEuMTk1ODIgViAyNjAuMDk4OSBIIDQ3Mi43OTYzIHYgNjIuMDkzMTkgSCAzNDEuMTk1' +
  'ODIgdiAxNDUuMDM4NTYgaCAtNjkuNTA3MyB6IiBmaWxsPSIjMDAwIi8+PHBhdGggZD0ibSA2NzUuMTI3' +
  'NjksMzIyLjE5MjA5IHEgMCwtMTIuOTc0NyAtMy43MDcwNiwtMjEuNzc4OTUgLTMuMjQzNjcsLTguODA0' +
  'MjYgLTkuMjY3NjQsLTEzLjkwMTQ2IC02LjAyMzk2LC01LjU2MDU5IC0xMy40MzgwNywtNy44Nzc1IC03' +
  'LjQxNDEyLC0yLjMxNjkxIC0xNS4yOTE2MSwtMi4zMTY5MSAtMjAuMzg4ODEsMCAtMzEuOTczMzYsMTUu' +
  'NzU0OTkgLTExLjU4NDU1LDE1LjI5MTYxIC0xMS41ODQ1NSwzOS44NTA4NSB2IDEzNS4zMDc1NCBoIC02' +
  'Ni43MjcgViAyMjkuMDUyMzEgaCA2My45NDY3MSB2IDMxLjA0NjU5IGggMC45MjY3NiBxIDE0LjgyODIz' +
  'LC0yMS43Nzg5NSAzMi40MzY3NCwtMjkuNjU2NDQgMTcuNjA4NTIsLTcuODc3NSAzNy45OTczMywtNy44' +
  'Nzc1IDIxLjMxNTU3LDAgMzcuMDcwNTYsNi40ODczNSAxNS43NTQ5OCw2LjQ4NzM1IDI1Ljk0OTM5LDE4' +
  'LjA3MTkgMTAuNjU3NzgsMTEuMTIxMTcgMTUuMjkxNiwyNi40MTI3NyA1LjA5NzIsMTQuODI4MjIgNS4w' +
  'OTcyLDMxLjk3MzM2IHYgMTYxLjcyMDMxIGggLTY2LjcyNyB6IiBmaWxsPSIjMDAwIi8+PC9zdmc+';

/** Favicon reuses the OpenFn mark so the browser tab matches the docs. */
const FAVICON_B64 = LOGO_B64;

// Palette + chrome mirror the OpenFn documentation site (docs.openfn.org, a
// Docusaurus/infima light theme): azure #2196f3 primary, white navbar + content,
// a light sidebar with soft-blue active states, a dark-slate footer, the same
// system-ui / SFMono font stacks, 8px radii and 1px #dadde1 borders. Response
// bodies stay on a dark code surface, matching the docs' dark Prism code blocks.
const STYLES = [
  ':root{--bg:#fff;--panel:#fff;--ink:#1c1e21;--muted:#606770;',
  '--border:#dadde1;--border-soft:#ebedf0;--wash:#f6f7f8;',
  '--accent:#2196f3;--accent-hover:#0d89ec;--accent-strong:#0a6bb7;--accent-soft:#ebf2fc;',
  '--code:#282a36;--code-ink:#e6edf3;',
  '--footer:#303846;--footer-ink:#dfe3ea;--footer-link:#b7c0cf;',
  '--radius:8px;--navbar-h:60px;--wrap:1120px;--shadow:0 1px 2px 0 rgba(0,0,0,.1);',
  '--mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;',
  '--get:#0a7d33;--post:#b45309;--put:#6d28d9;--patch:#0369a1;--delete:#b91c1c;--ok:#0a7d33;--err:#b91c1c;}',
  '*{box-sizing:border-box}',
  'html{-webkit-text-size-adjust:100%}',
  'body{margin:0;background:var(--bg);color:var(--ink);',
  'font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,Cantarell,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji";}',
  'code,pre,.mono{font-family:var(--mono);}',
  'a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}',
  '.wrap{max-width:var(--wrap);margin:0 auto;padding:0 24px;}',
  // Top navbar: white, sticky, OpenFn logo + wordmark on the left, docs links on
  // the right — the docs.openfn.org navbar.
  'header.navbar{position:sticky;top:0;z-index:20;background:#fff;height:var(--navbar-h);',
  'border-bottom:1px solid var(--border);box-shadow:var(--shadow);}',
  '.navbar-inner{max-width:var(--wrap);margin:0 auto;height:100%;padding:0 24px;',
  'display:flex;align-items:center;justify-content:space-between;gap:16px;}',
  '.brand{display:inline-flex;align-items:center;gap:9px;color:var(--ink);font-weight:700;font-size:19px;letter-spacing:-.01em;}',
  '.brand:hover{text-decoration:none}',
  '.brand-logo{width:30px;height:30px;display:block}',
  '.brand-sep{color:var(--border);font-weight:400}',
  '.brand-sub{color:var(--muted);font-weight:500;font-size:16px}',
  '.navbar-links{display:flex;align-items:center;gap:22px;font-size:15px;font-weight:500}',
  '.navbar-links a{color:var(--ink)}',
  '.navbar-links a:hover{color:var(--accent);text-decoration:none}',
  // Hero band under the navbar: page title + intro + base URL chip.
  '.hero{background:#fff;border-bottom:1px solid var(--border);}',
  '.hero .wrap{padding:34px 24px 30px}',
  '.hero h1{margin:0 0 8px;font-size:34px;line-height:1.15;letter-spacing:-.02em;font-weight:800;}',
  '.hero-lede{margin:0;color:var(--muted);font-size:17px;max-width:72ch;}',
  '.baseurl{margin-top:18px;display:inline-flex;align-items:center;gap:10px;background:var(--accent-soft);',
  'border:1px solid #cfe3fb;border-radius:var(--radius);padding:8px 13px;font-size:14px;}',
  '.baseurl-label{color:var(--accent-strong);font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:11px}',
  '.baseurl .mono{color:var(--ink)}',
  // Two-column layout: sticky left-hand nav + main content column.
  '.layout{max-width:var(--wrap);margin:0 auto;padding:26px 24px 60px;display:flex;gap:36px;align-items:flex-start;}',
  '.sidebar{flex:0 0 220px;position:sticky;top:calc(var(--navbar-h) + 18px);align-self:flex-start;',
  'max-height:calc(100vh - var(--navbar-h) - 34px);overflow:auto;}',
  '.sidebar-inner{font-size:14.5px}',
  '.nav-group{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin:18px 0 6px;padding:0 10px}',
  '.nav-group:first-child{margin-top:0}',
  '.nav-list{list-style:none;margin:0 0 4px;padding:0}',
  '.nav-list a{display:block;padding:6px 10px;border-radius:var(--radius);color:var(--muted);line-height:1.4}',
  '.nav-list a:hover{background:var(--wash);color:var(--ink);text-decoration:none}',
  '.nav-list a.active{background:var(--accent-soft);color:var(--accent);font-weight:600}',
  '.content{flex:1;min-width:0}',
  // Each nav target is its own page: only the active one is shown. Clicking a
  // nav link swaps pages via the hash router (no scrolling animation).
  '.page{display:none}',
  '.page.active{display:block}',
  // Per-system guide block: "Set up the adaptor" steps + "API overview" docs links.
  '.sys-guide{display:grid;grid-template-columns:1fr 1fr;gap:18px 30px;margin:12px 0 18px;',
  'padding:18px 20px;background:var(--wash);border:1px solid var(--border-soft);border-radius:var(--radius)}',
  '.sys-guide h4{margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}',
  '.sys-guide p{margin:0 0 10px;color:var(--muted)}',
  '.sys-guide code{background:#fff;border:1px solid var(--border);border-radius:5px;padding:1px 5px;',
  'font-size:12.5px;color:var(--ink);word-break:break-word}',
  '.steps{margin:0;padding:0;list-style:none;counter-reset:step;font-size:14px}',
  '.steps>li{position:relative;padding:0 0 14px 36px;color:var(--muted)}',
  '.steps>li:last-child{padding-bottom:0}',
  '.steps>li::before{counter-increment:step;content:counter(step);position:absolute;left:0;top:-1px;',
  'width:24px;height:24px;border-radius:50%;background:var(--accent-soft);color:var(--accent);',
  'font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center}',
  '.steps .step-h{display:block;color:var(--ink);font-weight:600;margin-bottom:1px}',
  '.doc-links{list-style:none;margin:0;padding:0;display:grid;gap:8px;font-size:14px}',
  '.doc-links a{font-weight:600}',
  '.loading{color:var(--muted)}',
  'section.console{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);',
  'padding:22px 22px 18px;margin-bottom:24px;box-shadow:var(--shadow);}',
  'section.console h2,.sys h2{margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}',
  '.console .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px;}',
  '.console select,.console input,.console textarea,.ex input,.ex textarea{font:inherit;font-size:14px;color:var(--ink);',
  'background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:8px 11px;}',
  '.console input.path{flex:1;min-width:220px}',
  '.console select,.ex-method-sel{font-family:inherit;font-weight:600}',
  'input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}',
  'textarea{width:100%;min-height:96px;resize:vertical;margin-top:8px;line-height:1.5;font-size:13px;}',
  '.ex textarea{min-height:70px}',
  'button{font:inherit;font-weight:600;cursor:pointer;border:1px solid transparent;border-radius:var(--radius);padding:8px 15px;transition:background .15s}',
  'button.run,button.send{background:var(--accent);color:#fff;}',
  'button.run:hover,button.send:hover{background:var(--accent-hover)}',
  'button.ghost{background:#fff;color:var(--accent);border-color:var(--border);padding:5px 11px;font-size:12.5px;font-weight:600;}',
  'button.ghost:hover{background:var(--accent-soft);border-color:var(--accent)}',
  'button:disabled{opacity:.55;cursor:progress}',
  '.sys{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:22px 22px 10px;',
  'margin-bottom:18px;box-shadow:var(--shadow);}',
  '.sys-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px;}',
  '.sys-head h3{margin:0;font-size:24px;letter-spacing:-.01em;font-weight:800}',
  '.sys-head .mount{font-family:var(--mono);font-size:13px;color:var(--accent);background:var(--accent-soft);border-radius:6px;padding:2px 8px}',
  '.sys-head .auth{font-size:12px;color:var(--muted);border:1px solid var(--border);border-radius:6px;padding:2px 8px}',
  // The "requires a credential" chip highlights systems whose mock returns 401.
  '.sys-head .auth.req{color:var(--accent-strong);border-color:#cfe3fb;background:var(--accent-soft)}',
  '.blurb{color:var(--muted);margin:10px 0 14px;max-width:80ch}',
  '.cred{margin:0 0 16px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}',
  '.cred-head{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--wash);',
  'border-bottom:1px solid var(--border);padding:7px 12px;font-size:12.5px;color:var(--muted)}',
  '.cred-head-l{display:flex;align-items:center;gap:10px;min-width:0}',
  // Credential-type badge: Username & password / API key / OAuth / No credentials.
  '.cred-type{font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;',
  'color:var(--accent-strong);background:var(--accent-soft);border:1px solid #cfe3fb;border-radius:5px;padding:2px 7px;white-space:nowrap}',
  '.cred-actions{display:flex;gap:6px;flex:none}',
  '.cred-note{margin:-8px 2px 16px;color:var(--muted);font-size:12.5px}',
  '.cred pre{margin:0;padding:13px 14px;background:var(--code);color:var(--code-ink);',
  'font-size:12.5px;overflow-x:auto}',
  '.ex{border-top:1px solid var(--border-soft);padding:14px 0}',
  '.ex-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
  '.m{font-size:11px;font-weight:700;letter-spacing:.04em;color:#fff;border-radius:5px;padding:3px 7px;min-width:56px;text-align:center}',
  '.m.GET{background:var(--get)}.m.POST{background:var(--post)}.m.PUT{background:var(--put)}',
  '.m.PATCH{background:var(--patch)}.m.DELETE{background:var(--delete)}',
  '.ex .path{flex:1;min-width:200px;font-size:13px;color:var(--ink);background:var(--wash)}',
  '.ex-label{color:var(--muted);font-size:13.5px;margin:8px 0 0}',
  '.resp{margin-top:10px;display:none}',
  '.resp.show{display:block}',
  '.resp-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px;margin-bottom:6px}',
  '.pill{font-weight:700;border-radius:5px;padding:2px 8px;color:#fff}',
  '.pill.ok{background:var(--ok)}.pill.err{background:var(--err)}',
  '.resp-meta .dim{color:var(--muted)}',
  '.resp pre{margin:0;padding:13px;background:var(--code);color:var(--code-ink);border-radius:var(--radius);',
  'font-size:12.5px;max-height:380px;overflow:auto;white-space:pre-wrap;word-break:break-word}',
  '.admin-links{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 0 8px;border-top:1px solid var(--border-soft);margin-top:8px}',
  // Per-system tab bar (Setup / API / Usage) + panels.
  '.tabbar{display:flex;gap:2px;border-bottom:1px solid var(--border);margin:16px 0 18px}',
  '.tab{background:none;border:none;border-bottom:2px solid transparent;border-radius:0;',
  'color:var(--muted);padding:9px 16px;font-size:14px;font-weight:600;margin-bottom:-1px}',
  '.tab:hover{color:var(--ink);background:var(--wash)}',
  '.tab.active{color:var(--accent);border-bottom-color:var(--accent)}',
  '.tabpanel{display:none}',
  '.tabpanel.active{display:block}',
  // API example flash when jumped to from a Usage link.
  '.ex{transition:background .3s,box-shadow .3s;border-radius:var(--radius)}',
  '.ex-flash{background:var(--accent-soft);box-shadow:0 0 0 3px var(--accent-soft)}',
  // Usage cards: signature chip, description, code block, "run the request" link.
  '.use-intro{color:var(--muted);margin:0 0 16px;max-width:80ch}',
  '.use{border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:12px}',
  '.use-sig{display:inline-block;font-size:13.5px;color:var(--accent-strong);background:var(--accent-soft);',
  'border:1px solid #cfe3fb;border-radius:6px;padding:3px 9px;font-weight:600}',
  '.use-desc{color:var(--muted);margin:9px 0 0}',
  '.use-code{margin:10px 0 0;padding:12px 14px;background:var(--code);color:var(--code-ink);',
  'border-radius:var(--radius);font-size:12.5px;overflow-x:auto;white-space:pre-wrap;word-break:break-word}',
  '.use-link{margin-top:10px}',
  '.empty{color:var(--muted);padding:10px 0}',
  // Footer: OpenFn dark slate with light links.
  'footer.foot{background:var(--footer);color:var(--footer-ink);padding:32px 24px;margin-top:8px}',
  'footer.foot .foot-note{margin:0 0 10px;font-size:13.5px;text-align:center}',
  'footer.foot .foot-links{margin:0;font-size:13.5px;text-align:center}',
  'footer.foot a{color:var(--footer-link)}footer.foot a:hover{color:#fff}',
  // Stack the sidebar above the content on narrow screens (nav becomes a wrap).
  '@media(max-width:860px){.layout{flex-direction:column;gap:16px;padding-top:20px}',
  '.sidebar{position:static;flex:none;width:100%;max-height:none;overflow:visible;',
  'border:1px solid var(--border);background:#fff;border-radius:var(--radius);padding:14px 16px}',
  '.nav-list{display:flex;flex-wrap:wrap;gap:4px 6px;margin-bottom:2px}',
  '.nav-list a{padding:5px 10px}',
  '.nav-group{margin:12px 0 6px;padding:0}.nav-group:first-child{margin-top:0}}',
  '@media(max-width:640px){.ex .path{min-width:140px}.hero h1{font-size:27px}.sys-head h3{font-size:20px}',
  '.navbar-links{gap:14px}.brand-sub,.brand-sep{display:none}.sys-guide{grid-template-columns:1fr;gap:16px}}',
].join('');

const HEADER = [
  '<header class="navbar"><div class="navbar-inner">',
  '<a class="brand" href="#console" aria-label="OpenFn mocker — API sandbox">',
  '<img class="brand-logo" src="data:image/svg+xml;base64,',
  LOGO_B64,
  '" alt="OpenFn" width="30" height="30">',
  '<span class="brand-name">OpenFn</span>',
  '<span class="brand-sep">/</span>',
  '<span class="brand-sub">mocker</span>',
  '</a>',
  '<nav class="navbar-links">',
  '<a href="https://docs.openfn.org/documentation" target="_blank" rel="noopener">Docs</a>',
  '<a href="https://docs.openfn.org/adaptors" target="_blank" rel="noopener">Adaptors</a>',
  '<a href="https://github.com/brandonjackson/openfn-mocker" target="_blank" rel="noopener">GitHub</a>',
  '</nav></div></header>',
  '<div class="hero"><div class="wrap">',
  '<h1>API sandbox</h1>',
  '<p class="hero-lede">A configurable mock of the external systems OpenFn integrates with. ',
  'Point an OpenFn credential at the base URL below, or try the endpoints live right here in your browser.</p>',
  '<div class="baseurl"><span class="baseurl-label">Base URL</span> <span class="mono" id="base-url"></span></div>',
  '</div></div>',
].join('');

const FOOTER = [
  '<footer class="foot"><div class="wrap">',
  '<p class="foot-note">Every request runs against the live in-memory mock; data resets on restart or via the reset endpoints.</p>',
  '<p class="foot-links">',
  '<a href="https://docs.openfn.org/documentation" target="_blank" rel="noopener">OpenFn docs</a> · ',
  '<a href="https://docs.openfn.org/adaptors" target="_blank" rel="noopener">Adaptors reference</a> · ',
  '<a href="https://docs.openfn.org/documentation/build/credentials" target="_blank" rel="noopener">Credentials</a> · ',
  '<a href="/_admin/systems">/_admin/systems</a> · ',
  '<a href="https://github.com/brandonjackson/openfn-mocker">source</a>',
  '</p></div></footer>',
].join('');

/*
 * Client script. Kept free of backticks and template interpolation so it can be
 * concatenated verbatim. Builds the DOM with createElement (text via
 * textContent), fires fetch() at the live mock, and renders responses inline.
 */
const CLIENT_JS = [
  '(function(){',
  'var DATA=window.__SANDBOX__||{systems:[]};',
  'var ORIGIN=window.location.origin;',
  'function sub(s){return typeof s==="string"?s.split("{{ORIGIN}}").join(ORIGIN):s;}',
  'function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;',
  'if(text!=null)n.textContent=text;return n;}',
  // Build an element from mixed parts (strings become text nodes; nodes append as-is).
  'function rich(tag,cls,parts){var n=el(tag,cls);for(var i=0;i<parts.length;i++){var p=parts[i];',
  'n.appendChild(typeof p==="string"?document.createTextNode(p):p);}return n;}',
  'function bold(t){return el("b",null,t);}',
  'function codeEl(t){return el("code",null,t);}',
  'function link(t,href){var a=el("a",null,t);a.href=href;a.target="_blank";a.rel="noopener";return a;}',
  'function pretty(text,ctype){if(ctype&&ctype.indexOf("json")===-1){return text;}',
  'try{return JSON.stringify(JSON.parse(text),null,2);}catch(e){return text;}}',
  // --- Credential suggestion generation (client-side, fresh per page view) ---
  'var HEX="0123456789abcdef";',
  'var ALNUM="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";',
  'function randChars(n,charset){var alph=charset==="hex"?HEX:ALNUM;var out="";',
  'var buf=new Uint8Array(n);(window.crypto||window.msCrypto).getRandomValues(buf);',
  'for(var i=0;i<n;i++){out+=alph.charAt(buf[i]%alph.length);}return out;}',
  'function genSecret(shape){shape=shape||{};',
  'return (shape.prefix||"")+randChars(shape.length||16,shape.charset||"alnum");}',
  // Resolve a credential spec into a concrete { field: value } object: url/static/
  // username values as-is (with {{ORIGIN}} substituted), secrets freshly generated.
  'function resolveCredValues(cred){var out={};for(var i=0;i<cred.fields.length;i++){',
  'var f=cred.fields[i];out[f.name]=f.role==="secret"?genSecret(f.secret):sub(f.value||"");}return out;}',
  // Build an Authorization header from a resolved credential + the plugin spec.
  // The mock validates presence, not value, so this just keeps the live example
  // requests realistic and consistent with the credential shown.
  'function buildAuthHeader(spec,vals){if(!spec)return null;',
  'if(spec.scheme==="basic"){var u=spec.user!=null?spec.user:(vals[spec.userField]||"");',
  'var p=spec.value!=null?spec.value:(vals[spec.passField]||"");return "Basic "+btoa(u+":"+p);}',
  'var tok=spec.value!=null?spec.value:(vals[spec.passField]||"");',
  'return (spec.scheme==="bearer"?"Bearer ":"Token ")+tok;}',
  // Human label for the credential-type badge.
  'function credTypeLabel(t){return t==="userpass"?"Username & password":',
  't==="apikey"?"API key":t==="oauth"?"OAuth client credentials":"No credentials";}',
  // Perform a request and render into a response container.
  'function send(method,path,contentType,body,respEl,btn,authHeader){',
  'var opts={method:method,headers:{}};',
  // Auth-required systems get their credential header; the mock checks presence,
  // not the value. Open systems (fhir, http-generic) pass no header.
  'if(authHeader){opts.headers["Authorization"]=authHeader;}',
  'if(method!=="GET"&&method!=="HEAD"&&body!=null&&body!==""){',
  'opts.headers["Content-Type"]=contentType||"application/json";opts.body=body;}',
  'var t0=(window.performance&&performance.now)?performance.now():Date.now();',
  'if(btn){btn.disabled=true;}',
  'respEl.className="resp show";respEl.innerHTML="";',
  'respEl.appendChild(el("div","resp-meta",null)).appendChild(el("span","dim","Sending…"));',
  'fetch(path,opts).then(function(res){return res.text().then(function(text){',
  'var t1=(window.performance&&performance.now)?performance.now():Date.now();',
  'renderResp(respEl,res.status,res.statusText,Math.round(t1-t0),',
  'res.headers.get("content-type")||"",text,res.headers.get("location"));',
  'if(btn){btn.disabled=false;}',
  '});}).catch(function(err){',
  'respEl.innerHTML="";var m=el("div","resp-meta");m.appendChild(el("span","pill err","ERROR"));',
  'm.appendChild(el("span","dim",String(err&&err.message||err)));respEl.appendChild(m);',
  'if(btn){btn.disabled=false;}});}',
  // Render status line + pretty body.
  'function renderResp(respEl,status,statusText,ms,ctype,text,location){',
  'respEl.innerHTML="";respEl.className="resp show";',
  'var meta=el("div","resp-meta");',
  'var ok=status>=200&&status<300;',
  'meta.appendChild(el("span","pill "+(ok?"ok":"err"),String(status)+(statusText?" "+statusText:"")));',
  'meta.appendChild(el("span","dim",ms+" ms"));',
  'if(ctype){meta.appendChild(el("span","dim",ctype.split(";")[0]));}',
  'if(location){meta.appendChild(el("span","dim","Location: "+location));}',
  'respEl.appendChild(meta);',
  'respEl.appendChild(el("pre",null,pretty(text,ctype)));}',
  // The shared top console.
  'function buildConsole(){',
  'var sec=el("section","console page");sec.id="console";sec.appendChild(el("h2",null,"Request console"));',
  'sec.appendChild(el("p","blurb","Send an ad-hoc request to any mounted system, or pick a system from the left for its Setup, API and Usage tabs."));',
  'var row=el("div","row");',
  'var sel=document.createElement("select");["GET","POST","PUT","PATCH","DELETE"].forEach(function(m){',
  'var o=document.createElement("option");o.value=m;o.textContent=m;sel.appendChild(o);});',
  'var path=el("input","path");path.type="text";path.value="/";path.placeholder="/dhis2/api/organisationUnits";',
  'var ct=el("input","ctype");ct.type="text";ct.value="application/json";ct.style.maxWidth="220px";',
  'ct.title="Content-Type for the request body";',
  'var btn=el("button","send","Send");',
  'row.appendChild(sel);row.appendChild(path);row.appendChild(btn);',
  'var body=el("textarea");body.placeholder="Request body (JSON, form, or XML). Ignored for GET.";',
  'var ctRow=el("div","row");ctRow.appendChild(el("span","dim","Content-Type"));ctRow.appendChild(ct);',
  'var resp=el("div","resp");',
  'sec.appendChild(row);sec.appendChild(body);sec.appendChild(ctRow);sec.appendChild(resp);',
  'btn.addEventListener("click",function(){send(sel.value,path.value,ct.value,body.value,resp,btn);});',
  'window.__loadConsole=function(method,p,contentType,b){sel.value=method;path.value=p;',
  'ct.value=contentType||"application/json";body.value=b||"";',
  // Navigate to the console page (fires the router); if already there just jump up.
  'if(currentId()!=="console"){window.location.hash="#console";}else{window.scrollTo(0,0);}};',
  'return sec;}',
  // A single example row (editable path + body, inline response).
  // One runnable API example. `sysName` + `ex.id` give it a stable DOM id so a
  // Usage-tab entry can jump to (and flash) the request its function calls.
  'function buildExample(ex,getAuth,sysName){',
  'var wrap=el("div","ex");',
  'if(ex.id){wrap.id="ex-"+sysName+"-"+ex.id;}',
  'var head=el("div","ex-head");',
  'head.appendChild(el("span","m "+ex.method,ex.method));',
  'var path=el("input","path");path.type="text";path.value=ex.path;',
  'var run=el("button","run","Run");',
  'head.appendChild(path);head.appendChild(run);',
  'wrap.appendChild(head);',
  'wrap.appendChild(el("p","ex-label",ex.label));',
  'var body=null;',
  'if(ex.body!=null){body=el("textarea");body.value=ex.body;wrap.appendChild(body);}',
  'var resp=el("div","resp");wrap.appendChild(resp);',
  'run.addEventListener("click",function(){',
  'send(ex.method,path.value,ex.contentType,body?body.value:null,resp,run,getAuth?getAuth():null);});',
  'return wrap;}',
  // One adaptor-function usage card: signature, description, example job code,
  // and (when apiRef is set) a button that switches to the API tab and flashes
  // the underlying request.
  'function buildUsage(u,sysName,activate){',
  'var wrap=el("div","use");',
  'wrap.appendChild(el("code","use-sig",u.signature||u.fn));',
  'if(u.description){wrap.appendChild(el("p","use-desc",u.description));}',
  'wrap.appendChild(el("pre","use-code",u.code));',
  'if(u.apiRef){var a=el("button","ghost use-link","Run the API request \\u2192");',
  'a.addEventListener("click",function(){activate("api");',
  'var t=document.getElementById("ex-"+sysName+"-"+u.apiRef);',
  'if(t){t.scrollIntoView({block:"center"});t.classList.add("ex-flash");',
  'setTimeout(function(){t.classList.remove("ex-flash");},1400);}});',
  'wrap.appendChild(a);}',
  'return wrap;}',
  // One system card. Three tabs: Setup (guide + credential), API (runnable
  // requests) and Usage (per-adaptor-function example code linking to the API).
  'function buildSystem(sys){',
  'var card=el("section","sys page");card.id="sys-"+sys.name;',
  'var head=el("div","sys-head");',
  'head.appendChild(el("h3",null,sys.title));',
  'head.appendChild(el("span","mount",sys.mountPath));',
  'if(sys.auth){head.appendChild(el("span","auth","auth: "+sys.auth));}',
  // Surface the plugin's own auth policy: does the mock 401 an anonymous request?
  'head.appendChild(el("span","auth"+(sys.authRequired?" req":""),',
  'sys.authRequired?"requires a credential":"accepts anonymous"));',
  'card.appendChild(head);',
  // Tab bar + three panels; activate() flips which panel/button is shown.
  'var panels={};var buttons={};',
  'function activate(name){for(var k in panels){var on=(k===name);',
  'panels[k].classList.toggle("active",on);buttons[k].classList.toggle("active",on);}}',
  'var tabbar=el("div","tabbar");',
  'var defs=[["setup","Setup"],["api","API"],["usage","Usage"]];',
  'for(var d=0;d<defs.length;d++){(function(key,lbl){var b=el("button","tab",lbl);',
  'b.addEventListener("click",function(){activate(key);});buttons[key]=b;tabbar.appendChild(b);})(defs[d][0],defs[d][1]);}',
  'card.appendChild(tabbar);',
  // authHeader is read by the API Run buttons via getAuth(), so Regenerate (in
  // Setup) updates both the shown credential and what the examples send.
  'var state={vals:{},authHeader:null};',
  // ---- Setup panel: adaptor guide + credential. ----
  'var setupPanel=el("div","tabpanel");panels.setup=setupPanel;',
  'var guide=el("div","sys-guide");',
  'var setup=el("div","sys-guide-col");setup.appendChild(el("h4",null,"Set up the adaptor"));',
  'var steps=el("ol","steps");',
  'steps.appendChild(rich("li",null,[el("span","step-h","Create the credential"),',
  '"In OpenFn open ",bold("Settings \\u2192 Credentials \\u2192 New credential"),", pick ",bold(sys.title),',
  '", and name it e.g. ",codeEl("mocker-"+sys.name),"."]));',
  'steps.appendChild(rich("li",null,[el("span","step-h","Point it at this mock"),',
  '"Under ",bold("Credential environments"),", set ",bold(sys.credential.urlField)," to ",',
  'codeEl(ORIGIN+sys.mountPath),". ",(sys.authRequired?',
  '"This mock requires a credential, but any value works \\u2014 it checks one is present, never that it is valid. ":',
  '"This mock accepts requests with or without credentials. "),',
  '"Copy the suggested credential below and paste it into OpenFn."]));',
  'steps.appendChild(rich("li",null,[el("span","step-h","Grant access & attach"),',
  '"Under ",bold("Projects access")," add your project, save, then select the credential on the workflow step."]));',
  'setup.appendChild(steps);',
  'var ov=el("div","sys-guide-col");ov.appendChild(el("h4",null,"API overview"));',
  'ov.appendChild(el("p",null,sys.blurb));',
  'var dl=el("ul","doc-links");',
  'if(sys.docs){dl.appendChild(rich("li",null,[link(sys.title+" adaptor docs \\u2197",sys.docs)]));}',
  'dl.appendChild(rich("li",null,[link("Managing credentials \\u2197","https://docs.openfn.org/documentation/build/credentials")]));',
  'ov.appendChild(dl);',
  'guide.appendChild(setup);guide.appendChild(ov);setupPanel.appendChild(guide);',
  // Credential block: a fresh, ready-to-paste suggestion generated per page view.
  'var cred=el("div","cred");',
  'var ch=el("div","cred-head");',
  'var chL=el("div","cred-head-l");',
  'chL.appendChild(el("span",null,"OpenFn credential"));',
  'chL.appendChild(el("span","cred-type",credTypeLabel(sys.credential.type)));',
  'ch.appendChild(chL);',
  'var chR=el("div","cred-actions");',
  'var regen=el("button","ghost","Regenerate");var copy=el("button","ghost","Copy");',
  'chR.appendChild(regen);chR.appendChild(copy);ch.appendChild(chR);cred.appendChild(ch);',
  'var pre=el("pre",null,"");cred.appendChild(pre);',
  'function renderCred(){state.vals=resolveCredValues(sys.credential);',
  'state.authHeader=buildAuthHeader(sys.credential.authHeader,state.vals);',
  'pre.textContent=JSON.stringify(state.vals,null,2);}',
  'renderCred();',
  'regen.addEventListener("click",renderCred);',
  'copy.addEventListener("click",function(){',
  'if(navigator.clipboard){navigator.clipboard.writeText(pre.textContent).then(function(){',
  'copy.textContent="Copied";setTimeout(function(){copy.textContent="Copy";},1200);});}});',
  'setupPanel.appendChild(cred);',
  // Only note "generated" when the credential actually carries a secret.
  'var hasSecret=sys.credential.fields.some(function(f){return f.role==="secret";});',
  'if(hasSecret){setupPanel.appendChild(el("p","cred-note",',
  '"Secret values are freshly generated suggestions \\u2014 the mock accepts any value; use Regenerate for a new set."));}',
  'card.appendChild(setupPanel);',
  // ---- API panel: runnable example requests + admin quick links. ----
  'var apiPanel=el("div","tabpanel");panels.api=apiPanel;',
  'if(sys.examples.length){for(var i=0;i<sys.examples.length;i++){',
  'apiPanel.appendChild(buildExample(sys.examples[i],function(){return state.authHeader;},sys.name));}}',
  'else{apiPanel.appendChild(el("p","empty","No example requests for this system yet \\u2014 use the Request console above."));}',
  'var admin=el("div","admin-links");',
  'admin.appendChild(el("span","dim","admin:"));',
  'var mk=function(lbl,method,p,b){var g=el("button","ghost",lbl);g.addEventListener("click",function(){',
  'window.__loadConsole(method,p,"application/json",b||"");});return g;};',
  'admin.appendChild(mk("status","GET",sys.mountPath+"/_admin/status"));',
  'admin.appendChild(mk("requests","GET",sys.mountPath+"/_admin/requests"));',
  'admin.appendChild(mk("store","GET",sys.mountPath+"/_admin/store"));',
  'admin.appendChild(mk("reset","POST",sys.mountPath+"/_admin/reset"));',
  'apiPanel.appendChild(admin);',
  'card.appendChild(apiPanel);',
  // ---- Usage panel: per-adaptor-function example job code. ----
  'var usagePanel=el("div","tabpanel");panels.usage=usagePanel;',
  'if(sys.usage&&sys.usage.length){',
  'usagePanel.appendChild(el("p","use-intro",',
  '"How each adaptor function maps onto the API above \\u2014 the OpenFn job code plus a link to the request it fires."));',
  'for(var u=0;u<sys.usage.length;u++){usagePanel.appendChild(buildUsage(sys.usage[u],sys.name,activate));}}',
  'else{var ph=el("div","empty");',
  'ph.appendChild(document.createTextNode("Per-function usage examples for this adaptor are coming soon. "));',
  'if(sys.docs){ph.appendChild(link("See the adaptor docs \\u2197",sys.docs));}usagePanel.appendChild(ph);}',
  'card.appendChild(usagePanel);',
  'activate("setup");',
  'return card;}',
  // Left-hand navigation: the request console plus one link per system.
  'function buildSidebar(){',
  'var nav=el("nav","sidebar-inner");',
  'var g=el("ul","nav-list");var li=el("li");var a=el("a",null,"Request console");',
  'a.href="#console";li.appendChild(a);g.appendChild(li);nav.appendChild(g);',
  'if(DATA.systems.length){',
  'nav.appendChild(el("div","nav-group","Systems"));',
  'var s=el("ul","nav-list");',
  // Nav links are sorted alphabetically by title (the content cards keep their
  // curated order); localeCompare gives a case-insensitive, human-friendly sort.
  'var navSystems=DATA.systems.slice().sort(function(a,b){return a.title.localeCompare(b.title);});',
  'for(var j=0;j<navSystems.length;j++){var sys=navSystems[j];var li2=el("li");',
  'var a2=el("a",null,sys.title);a2.href="#sys-"+sys.name;li2.appendChild(a2);s.appendChild(li2);}',
  'nav.appendChild(s);}',
  'return nav;}',
  // Hash router: each nav link points at a page id (#console or #sys-<name>);
  // show only the active page and highlight its nav link. Defaults to the
  // console when the hash is empty or unknown.
  'function currentId(){var h=(window.location.hash||"").replace(/^#/,"");',
  'return h&&document.getElementById(h)?h:"console";}',
  'function showPage(){var id=currentId();',
  'var pages=document.querySelectorAll("#app .page");',
  'for(var i=0;i<pages.length;i++){',
  'if(pages[i].id===id){pages[i].classList.add("active");}else{pages[i].classList.remove("active");}}',
  'var links=document.querySelectorAll(".nav-list a");',
  'for(var j=0;j<links.length;j++){var href=links[j].getAttribute("href")||"";',
  'if(href==="#"+id){links[j].classList.add("active");}else{links[j].classList.remove("active");}}',
  'window.scrollTo(0,0);}',
  // Boot.
  'function boot(){',
  'var base=document.getElementById("base-url");if(base)base.textContent=ORIGIN;',
  'var side=document.getElementById("sidebar");if(side){side.innerHTML="";side.appendChild(buildSidebar());}',
  'var app=document.getElementById("app");app.innerHTML="";',
  'var consolePage=buildConsole();',
  'if(!DATA.systems.length){consolePage.appendChild(el("p","loading","No systems are enabled."));}',
  'app.appendChild(consolePage);',
  // One page per system; the router shows just one at a time.
  'for(var i=0;i<DATA.systems.length;i++){app.appendChild(buildSystem(DATA.systems[i]));}',
  'window.addEventListener("hashchange",showPage);',
  'showPage();}',
  'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",boot);}else{boot();}',
  '})();',
].join('');

/** True if an Accept header indicates the client wants HTML (a browser). */
export function wantsHtml(accept: string | undefined): boolean {
  return typeof accept === 'string' && accept.includes('text/html');
}
