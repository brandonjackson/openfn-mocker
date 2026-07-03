/**
 * Regenerate the README sections that are pure projections of plugin metadata,
 * so they can never drift from the code:
 *
 *   - the "Supported systems" table (name, mount, credential URL field + type)
 *   - the "Using with OpenFn" per-system credential examples
 *
 * Everything is read from the same single sources of truth the sandbox renders:
 * each plugin's `credential` spec (+ `guide.title`) and the shipped
 * mock.config.yaml (for `{{token}}` values like the CommCare domain). Sections
 * are replaced between HTML marker comments; all other README prose is left
 * untouched.
 *
 * Usage:
 *   pnpm readme           # rewrite README.md in place
 *   pnpm readme:check     # exit 1 if README.md is stale (CI drift guard;
 *                         # test/readme.test.ts enforces the same in `pnpm test`)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { plugins } from '../src/systems/index.js';
import { loadConfig } from '../src/config.js';
import { credentialTypeLabel, resolveCredentialValues, systemVars } from '../src/credentials.js';

/** Origin shown in all examples (matches the shipped default port). */
const ORIGIN = 'http://localhost:4000';

export const README_PATH = resolve(fileURLToPath(new URL('../README.md', import.meta.url)));

function marker(section: string): { begin: string; end: string } {
  return {
    begin: `<!-- BEGIN GENERATED: ${section} (edit plugins + run \`pnpm readme\`, do not edit by hand) -->`,
    end: `<!-- END GENERATED: ${section} -->`,
  };
}

/** Replace the content between a section's markers (markers themselves kept). */
function replaceSection(readme: string, section: string, content: string): string {
  const { begin, end } = marker(section);
  const beginIdx = readme.indexOf(begin);
  const endIdx = readme.indexOf(end);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    throw new Error(`README.md is missing the "${section}" generated-section markers.`);
  }
  return readme.slice(0, beginIdx + begin.length) + '\n' + content + '\n' + readme.slice(endIdx);
}

/** The credential's URL field name, or an em dash when there is none. */
function urlFieldOf(name: string): string {
  const spec = plugins[name]?.credential;
  const url = spec?.fields.find((f) => f.role === 'url');
  return url ? `\`${url.name}\`` : '—';
}

/** "Supported systems" table: one row per registered plugin, then placeholders. */
export function supportedSystemsTable(): string {
  const config = loadConfig();
  const rows: string[] = [
    '| System | Mount path | Credential URL field | Credential type | Status |',
    '|--------|------------|-----------------------|------|--------|',
  ];
  for (const name of Object.keys(plugins)) {
    rows.push(
      `| ${name} | \`/${name}\` | ${urlFieldOf(name)} | ${credentialTypeLabel(plugins[name].credential)} | stable |`
    );
  }
  // Config blocks with no plugin are declared placeholders (e.g. salesforce).
  for (const name of Object.keys(config.systems)) {
    if (!plugins[name]) rows.push(`| ${name} | \`/${name}\` | — | — | planned |`);
  }
  return rows.join('\n');
}

/** One `{ "field": "value", ... }` line, formatted like the README's examples. */
function credentialJson(name: string): string {
  const plugin = plugins[name];
  const vars = systemVars(plugin.guide, loadConfig().systems[name]);
  const values = resolveCredentialValues(plugin.credential, {
    url: `${ORIGIN}/${name}`,
    vars,
    secret: () => '<generated>',
  });
  const entries = Object.entries(values).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`);
  return `{ ${entries.join(', ')} }`;
}

/** "Using with OpenFn" credential examples: one commented JSON line per system. */
export function credentialExamples(): string {
  const blocks: string[] = [];
  for (const name of Object.keys(plugins)) {
    const plugin = plugins[name];
    const title = plugin.guide?.title ?? name;
    const label = credentialTypeLabel(plugin.credential);
    blocks.push(`// ${title}  (${label === 'none' ? 'no credential' : label})`);
    blocks.push(credentialJson(name));
    blocks.push('');
  }
  return ['```json', ...blocks.slice(0, -1), '```'].join('\n');
}

/** Apply every generated section to a README string. */
export function renderReadme(readme: string): string {
  let out = readme;
  out = replaceSection(out, 'supported-systems', supportedSystemsTable());
  out = replaceSection(out, 'credentials', credentialExamples());
  return out;
}

function main(): void {
  const check = process.argv.includes('--check');
  const current = readFileSync(README_PATH, 'utf8');
  const next = renderReadme(current);
  if (next === current) {
    console.log('README.md generated sections are up to date.');
    return;
  }
  if (check) {
    console.error('README.md generated sections are stale. Run `pnpm readme` and commit the result.');
    process.exit(1);
  }
  writeFileSync(README_PATH, next);
  console.log('README.md generated sections rewritten.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
