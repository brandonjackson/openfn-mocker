/**
 * `pnpm specs <command>` — maintain up-to-date API specs for every OpenFn adaptor.
 *
 * The system is a loop with an agentic "finding" step:
 *
 *   1. list      — pull the adaptor list from openfn/adaptors (cached).
 *   2. status    — which adaptors have an OpenAPI spec + data-object schemas.
 *   3. instructions <a|--missing|--all>
 *                — emit a per-adaptor work order. An AI agent executes it: find
 *                  an official OpenAPI spec online (save), find another standard
 *                  (save + convert), or do a documenting pass over the vendor
 *                  docs (generate). It writes openapi.json + source.json.
 *   4. data-objects <a|--all>
 *                — extract one standalone JSON Schema per data object (the
 *                  closure of the API's response resources) into data-schemas/.
 *   5. manifest  — rebuild the aggregate index/coverage report.
 *
 * See specs/adaptors/README.md for the on-disk layout.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadAdaptors, type AdaptorInfo } from './adaptors.js';
import { extractDataObjects } from './data-objects.js';
import { instructionsFor } from './instructions.js';
import { buildManifest } from './manifest.js';
import { dataSchemasDir, dataSchemasIndexPath, manifestPath, openapiPath } from './paths.js';

const today = (): string => new Date().toISOString().slice(0, 10);

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function has(path: string): boolean {
  return existsSync(path);
}

/** Resolve which adaptors a command targets from argv (names, --all, --missing). */
function selectTargets(all: AdaptorInfo[], argv: string[]): AdaptorInfo[] {
  if (argv.includes('--all')) return all;
  if (argv.includes('--missing')) return all.filter((a) => !has(openapiPath(a.name)));
  const names = argv.filter((a) => !a.startsWith('--'));
  if (names.length === 0) return [];
  const set = new Set(names);
  const chosen = all.filter((a) => set.has(a.name));
  const unknown = names.filter((n) => !all.some((a) => a.name === n));
  if (unknown.length) throw new Error(`Unknown adaptor(s): ${unknown.join(', ')}`);
  return chosen;
}

async function cmdList(argv: string[]): Promise<void> {
  const adaptors = await loadAdaptors(argv.includes('--refresh'));
  const rest = adaptors.filter((a) => a.rest).length;
  console.log(`${adaptors.length} adaptors (${rest} REST, ${adaptors.length - rest} non-REST)`);
  for (const a of adaptors) {
    console.log(`  ${a.rest ? ' ' : '·'} ${a.name}${a.note ? `  — ${a.note}` : ''}`);
  }
}

async function cmdStatus(argv: string[]): Promise<void> {
  const adaptors = await loadAdaptors();
  const rows = adaptors.map((a) => ({
    name: a.name,
    rest: a.rest,
    openapi: has(openapiPath(a.name)),
    dataSchemas: has(dataSchemasIndexPath(a.name)),
  }));

  if (argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  for (const r of rows) {
    const o = r.openapi ? '✓' : '✗';
    const d = r.dataSchemas ? '✓' : '✗';
    console.log(`  openapi:${o}  data-schemas:${d}  ${r.name}`);
  }
  const withO = rows.filter((r) => r.openapi).length;
  const withD = rows.filter((r) => r.dataSchemas).length;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${withO}/${rows.length} have OpenAPI, ${withD}/${rows.length} have data-schemas`);
}

async function cmdMissing(): Promise<void> {
  const adaptors = await loadAdaptors();
  const missing = adaptors.filter((a) => !has(openapiPath(a.name)));
  console.log(missing.map((a) => a.name).join('\n'));
}

async function cmdInstructions(argv: string[]): Promise<void> {
  const adaptors = await loadAdaptors();
  const targets = selectTargets(adaptors, argv);
  if (targets.length === 0) {
    throw new Error('Specify adaptor name(s), --missing, or --all.');
  }
  console.log(targets.map(instructionsFor).join('\n\n' + '═'.repeat(72) + '\n\n'));
}

async function cmdDataObjects(argv: string[]): Promise<void> {
  const adaptors = await loadAdaptors();
  const targets = argv.includes('--all')
    ? adaptors.filter((a) => has(openapiPath(a.name)))
    : selectTargets(adaptors, argv);
  if (targets.length === 0) throw new Error('Specify adaptor name(s) or --all.');

  for (const a of targets) {
    const p = openapiPath(a.name);
    if (!has(p)) {
      console.log(`  ✗ ${a.name}: no openapi.json`);
      continue;
    }
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    const { objects, index } = extractDataObjects(raw, a.name, today());

    // Rewrite the folder from scratch so a shrunk object set leaves no stragglers.
    const dir = dataSchemasDir(a.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const obj of objects) writeJson(join(dir, obj.file), obj.schema);
    writeJson(dataSchemasIndexPath(a.name), index);

    const res = index.resources.length;
    console.log(`  ✓ ${a.name}: ${objects.length} data object(s) (${res} resource(s)) → data-schemas/`);
  }
}

async function cmdManifest(): Promise<void> {
  const adaptors = await loadAdaptors();
  const manifest = buildManifest(adaptors, new Date().toISOString());
  writeJson(manifestPath(), manifest);
  const { withOpenapi, withDataSchemas, dataObjects, adaptors: n } = manifest.totals;
  console.log(
    `manifest.json: ${n} adaptors, ${withOpenapi} with OpenAPI, ${withDataSchemas} with data-schemas ` +
      `(${dataObjects} data objects total)`
  );
  console.log(`  by origin: ${JSON.stringify(manifest.totals.byOrigin)}`);
}

const USAGE = `Usage: pnpm specs <command>

  list [--refresh]              List adaptors from openfn/adaptors (cached).
  status [--json]               Coverage: which adaptors have openapi + data-schemas.
  missing                       Print adaptors with no OpenAPI spec (newline-separated).
  instructions <a…|--missing|--all>
                                Emit agentic work order(s) for finding/generating specs.
  data-objects <a…|--all>       Extract standalone data-object schemas into data-schemas/.
  manifest                      Rebuild specs/adaptors/manifest.json.
`;

async function main(): Promise<void> {
  const [cmd, ...argv] = process.argv.slice(2);
  switch (cmd) {
    case 'list':
      return cmdList(argv);
    case 'status':
      return cmdStatus(argv);
    case 'missing':
      return cmdMissing();
    case 'instructions':
      return cmdInstructions(argv);
    case 'data-objects':
      return cmdDataObjects(argv);
    case 'manifest':
      return cmdManifest();
    case undefined:
    case '--help':
    case '-h':
      console.log(USAGE);
      return;
    default:
      throw new Error(`Unknown command: ${cmd}\n\n${USAGE}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
