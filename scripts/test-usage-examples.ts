/**
 * End-to-end test for the sandbox "Usage" examples.
 *
 * Every system's Usage tab (see `MockSystemPlugin.usage`, authored per adaptor
 * next to its seed data) ships a set of adaptor-function snippets — the exact
 * OpenFn job code a user would write, e.g. `getIndividual('IND_AMINA001')`. This
 * script proves those snippets actually run: for each system that has usage
 * examples, it
 *
 *   1. boots a single-system mock mounted at the server ROOT on an ephemeral
 *      port (via `createSystemServer` + a real `listen`), so an adaptor that
 *      ignores the URL path — like openspp's odoo-await, which builds its
 *      XML-RPC client from host+port and hardcodes `/xmlrpc/2/...` — still
 *      reaches the mock (the `/<system>` mount prefix would otherwise be lost);
 *   2. resolves the OpenFn credential the sandbox would hand out (from the
 *      plugin's `credential` spec — the single source of truth) into a concrete
 *      `state.configuration`, with its URL field pointed at the mock origin;
 *   3. writes each usage snippet to a job file, runs it through the real OpenFn
 *      CLI (`openfn <job> -a <adaptor> -s <state> -o <out>`), which
 *      auto-installs the real published adaptor from npm; and
 *   4. verifies the run succeeded — non-zero exit, a thrown/compile error, or a
 *      CLI-reported error (`✗`) all count as a failure.
 *
 * The mock is reset to pristine seed between examples so each snippet runs
 * independently and the suite is deterministic on re-run.
 *
 * The set of systems under test is discovered automatically, so any system that
 * gains a `usage` block is covered without touching this file. Adaptors that
 * can't yet be driven end to end against the mock (the gaps tracked in the
 * README's Roadmap — Twilio/Mailgun ignore the base URL, OAuth systems need a
 * token handshake) will surface here as failures, which is the point: this is
 * the empirical check behind that Roadmap.
 *
 * Run with `pnpm test:usage` (see package.json). Requires network access (to
 * install the CLI's adaptors from npm) and the `openfn` CLI on PATH, or set
 * $OPENFN_CLI / pass --cli. It is intentionally NOT part of `pnpm test`: it
 * spawns real subprocesses and hits npm, which is too heavy and network-bound
 * for the unit suite.
 *
 * Usage:
 *   pnpm test:usage                     # every system with usage examples
 *   pnpm test:usage -- --system openspp # one system (comma-separated for more)
 *   pnpm test:usage -- --list           # list discovered examples, run nothing
 *   pnpm test:usage -- --keep           # keep the temp job/state/log files
 *   pnpm test:usage -- --cli "npx -y @openfn/cli"   # override the CLI command
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSystemServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { plugins } from '../src/systems/index.js';
import { SYSTEM_GUIDES } from '../src/sandbox.js';
import type { MockSystemPlugin, SystemConfig, UsageExample } from '../src/systems/types.js';
import type { CredentialSpec } from '../src/auth.js';

/* -------------------------------------------------------------------------- */
/* System name -> OpenFn adaptor short name                                   */
/*                                                                            */
/* The CLI expands a short name like `openspp` to `@openfn/language-openspp`  */
/* and auto-installs it. Almost every system key already matches its adaptor  */
/* name 1:1; list only the exceptions here.                                   */
/* -------------------------------------------------------------------------- */
const ADAPTOR_NAMES: Record<string, string> = {
  'http-generic': 'http',
};

const adaptorFor = (system: string): string => ADAPTOR_NAMES[system] ?? system;

/**
 * A system's usage examples, read from its plugin (`MockSystemPlugin.usage`) —
 * the single source of truth the sandbox renders too, so the systems under test
 * stay in lockstep with what the Usage tab documents.
 */
const usageFor = (system: string): UsageExample[] => plugins[system]?.usage ?? [];

interface Args {
  systems?: string[];
  list: boolean;
  keep: boolean;
  cli?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue; // arg separator (pnpm forwards it through)
    else if (a === '--list') args.list = true;
    else if (a === '--keep') args.keep = true;
    else if (a === '--system' || a === '--systems') {
      args.systems = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--cli') args.cli = argv[++i];
    else if (a.startsWith('--')) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

/** Replace `{{ORIGIN}}` and `{{token}}` placeholders (unknown tokens kept as-is). */
function interpolate(text: string, origin: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key: string) =>
    key === 'ORIGIN' ? origin : key in vars ? vars[key] : m
  );
}

/** Build the `{{token}}` map for a system: guide defaults overridden by live config. */
function systemVars(system: string, config: SystemConfig): Record<string, string> {
  const vars: Record<string, string> = { ...(SYSTEM_GUIDES[system]?.vars ?? {}) };
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === 'string' || typeof v === 'number') vars[k] = String(v);
  }
  return vars;
}

/** Generate a random secret suggestion, matching the sandbox's shape rules. */
function generateSecret(shape: CredentialSpec['fields'][number]['secret']): string {
  const length = shape?.length ?? 16;
  const prefix = shape?.prefix ?? '';
  const alphabet =
    shape?.charset === 'hex' ? '0123456789abcdef' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let body = '';
  for (let i = 0; i < length; i++) body += alphabet[bytes[i] % alphabet.length];
  return prefix + body;
}

/**
 * Resolve the plugin's credential spec into a concrete `state.configuration`,
 * exactly as the sandbox would generate one — except the URL field points at
 * the root-mounted mock origin (no `/<system>` prefix, since the system owns
 * this whole port). Systems with no credential just get a `baseUrl`.
 */
function resolveConfiguration(
  plugin: MockSystemPlugin,
  origin: string,
  vars: Record<string, string>
): Record<string, unknown> {
  const spec = plugin.credential;
  if (!spec) return { baseUrl: origin };
  const out: Record<string, unknown> = {};
  for (const f of spec.fields) {
    if (f.role === 'url') out[f.name] = origin;
    else if (f.role === 'secret') out[f.name] = generateSecret(f.secret);
    else out[f.name] = interpolate(f.value ?? '', origin, vars);
  }
  return out;
}

/** Boot one system, mounted at the root, on an ephemeral loopback port. */
async function startSystem(system: string, plugin: MockSystemPlugin) {
  const fromFile = (() => {
    try {
      return loadConfig().systems[system];
    } catch {
      return undefined;
    }
  })();
  // port is only used for self-referential URL rewriting, which is gated on a
  // reverse-proxy header we never send — so its value is irrelevant here.
  const config: SystemConfig = { ...(fromFile ?? {}), port: 0 };

  const { app } = await createSystemServer(plugin, config, { logLevel: 'warn', autoAuth: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const origin = `http://127.0.0.1:${port}`;
  return { app, origin, config };
}

interface CliCmd {
  command: string;
  baseArgs: string[];
}

/**
 * Resolve the OpenFn CLI command: an explicit --cli / $OPENFN_CLI wins, then a
 * plain `openfn` on PATH, then `npx -y @openfn/cli` as a (slower) fallback.
 */
function resolveCli(explicit?: string): CliCmd {
  const configured = explicit ?? process.env.OPENFN_CLI;
  if (configured) {
    const [command, ...baseArgs] = configured.split(/\s+/).filter(Boolean);
    return { command, baseArgs };
  }
  const onPath = spawnSync('openfn', ['--version'], { stdio: 'ignore' });
  if (onPath.status === 0) return { command: 'openfn', baseArgs: [] };
  const npx = spawnSync('npx', ['--version'], { stdio: 'ignore' });
  if (npx.status === 0) return { command: 'npx', baseArgs: ['--yes', '@openfn/cli'] };
  throw new Error(
    'Could not find the OpenFn CLI. Install it with `npm i -g @openfn/cli`, or set $OPENFN_CLI / pass --cli.'
  );
}

interface RunResult {
  system: string;
  fn: string;
  ok: boolean;
  ms: number;
  detail: string;
}

/** Run one usage example through the CLI and judge whether it worked. */
function runExample(
  cli: CliCmd,
  adaptor: string,
  ex: UsageExample,
  configuration: Record<string, unknown>,
  dir: string,
  repoDir: string
): Promise<RunResult> {
  const safe = ex.fn.replace(/[^a-zA-Z0-9_-]/g, '_');
  const jobPath = join(dir, `${safe}.js`);
  const statePath = join(dir, `${safe}.state.json`);
  const outPath = join(dir, `${safe}.out.json`);
  writeFileSync(jobPath, ex.code + '\n');
  writeFileSync(statePath, JSON.stringify({ configuration, data: {} }, null, 2));

  const args = [...cli.baseArgs, jobPath, '-a', adaptor, '-s', statePath, '-o', outPath];
  const started = Date.now();

  return new Promise((resolve) => {
    const child = spawn(cli.command, args, {
      env: { ...process.env, OPENFN_REPO_DIR: repoDir },
    });
    let out = '';
    const collect = (buf: Buffer) => {
      out += buf.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    // Hard cap per example so a hung connection can't stall the whole suite.
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(join(dir, `${safe}.log`), out);
      // A run is a failure if the process errored (non-zero exit: thrown or
      // compile errors), or the CLI reported an error it caught and attached to
      // state (its `✗` marker) — the openspp connection/path failures surface
      // this way even though the process exits 0.
      const cliError = /✗/.test(out) || /CRITICAL ERROR|Workflow failed/i.test(out);
      const ok = code === 0 && !cliError;
      const detail = ok
        ? firstLine(out.match(/ℹ[^\n]*|[✔√][^\n]*completed[^\n]*/)?.[0] ?? 'ok')
        : firstLine(out.match(/✗[^\n]*/)?.[0] ?? `exit code ${code}`);
      resolve({ system: '', fn: ex.fn, ok, ms: Date.now() - started, detail });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ system: '', fn: ex.fn, ok: false, ms: Date.now() - started, detail: err.message });
    });
  });
}

function firstLine(s: string): string {
  const line = s.split('\n')[0].trim();
  return line.length > 100 ? line.slice(0, 97) + '...' : line;
}

/** Reset a root-mounted mock back to pristine seed between examples. */
async function resetMock(origin: string): Promise<void> {
  try {
    await fetch(`${origin}/_admin/reset`, { method: 'POST' });
  } catch {
    /* best effort — a failed reset only risks cross-example bleed, not a crash */
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Discover every system that has authored usage examples AND a live plugin.
  const discovered = Object.keys(plugins)
    .filter((name) => usageFor(name).length > 0)
    .sort();
  const targets = args.systems ? discovered.filter((s) => args.systems!.includes(s)) : discovered;

  if (args.systems) {
    const missing = args.systems.filter((s) => !discovered.includes(s));
    if (missing.length) {
      console.error(`No usage examples for: ${missing.join(', ')} (known: ${discovered.join(', ') || 'none'})`);
    }
  }

  if (!targets.length) {
    console.log('No systems with usage examples to test.');
    console.log(`(Systems that have usage examples: ${discovered.join(', ') || 'none'})`);
    return;
  }

  if (args.list) {
    for (const system of targets) {
      const usage = usageFor(system);
      console.log(`\n${system}  (adaptor: ${adaptorFor(system)})  — ${usage.length} example(s)`);
      for (const u of usage) console.log(`  • ${u.fn.padEnd(22)} ${u.code}`);
    }
    return;
  }

  const cli = resolveCli(args.cli);
  // Cache adaptor installs across runs so only the first run pays the npm cost.
  const repoDir = process.env.OPENFN_REPO_DIR ?? join(tmpdir(), 'openfn-mocker-adaptors');
  mkdirSync(repoDir, { recursive: true });
  const workDir = join(tmpdir(), `openfn-mocker-usage-${process.pid}`);

  console.log(`OpenFn CLI: ${[cli.command, ...cli.baseArgs].join(' ')}`);
  console.log(`Adaptor cache: ${repoDir}`);
  console.log(`Testing: ${targets.join(', ')}\n`);

  const results: RunResult[] = [];

  for (const system of targets) {
    const plugin = plugins[system];
    const usage = usageFor(system);
    const adaptor = adaptorFor(system);
    const dir = join(workDir, system);
    mkdirSync(dir, { recursive: true });

    const { app, origin, config } = await startSystem(system, plugin);
    const configuration = resolveConfiguration(plugin, origin, systemVars(system, config));
    console.log(`── ${system} @ ${origin}  (adaptor: ${adaptor}, ${usage.length} example(s))`);

    try {
      for (const ex of usage) {
        await resetMock(origin);
        const r = await runExample(cli, adaptor, ex, configuration, dir, repoDir);
        r.system = system;
        results.push(r);
        const mark = r.ok ? '✓ PASS' : '✗ FAIL';
        console.log(`   ${mark}  ${ex.fn.padEnd(22)} ${String(r.ms).padStart(5)}ms  ${r.detail}`);
      }
    } finally {
      await app.close();
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${passed}/${results.length} passed` + (failed ? `, ${failed} FAILED` : ''));
  if (failed) {
    console.log('  Failures:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`    ✗ ${r.system}/${r.fn}: ${r.detail}`);
    }
  }
  console.log('═'.repeat(60));

  if (!args.keep) rmSync(workDir, { recursive: true, force: true });
  else console.log(`\nKept job/state/log files under ${workDir}`);

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
