import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * On-disk layout for the spec registry (self-contained so it can be lifted into
 * its own repo later):
 *
 *   specs/adaptors/
 *     _adaptors.json            cached list of adaptor names from openfn/adaptors
 *     manifest.json             aggregate index + coverage status
 *     <adaptor>/
 *       openapi.json            the OpenAPI 3.x spec (found, converted, or generated)
 *       source.json             provenance: origin, source URLs, method, date, notes
 *       data-schemas/           one standalone JSON Schema per data object + index.json
 *
 * All paths resolve relative to the repo's `specs/adaptors` directory, robust to
 * being run from src/ (tsx) or dist/ (compiled).
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** Locate the repo root by walking up until a `specs/` dir is found. */
function findRepoRoot(): string {
  // Env override first (mirrors datasets.ts conventions).
  const override = process.env.MOCKER_SPECS_ROOT?.trim();
  if (override) return resolve(override, '..', '..');

  const candidates = [process.cwd()];
  let dir = HERE;
  for (let i = 0; i < 8; i++) {
    candidates.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const c of candidates) {
    if (existsSync(join(c, 'specs'))) return c;
  }
  return process.cwd();
}

/** Root dir for the registry: `<repo>/specs/adaptors` (override MOCKER_SPECS_ROOT). */
export function registryRoot(): string {
  const override = process.env.MOCKER_SPECS_ROOT?.trim();
  if (override) return resolve(override);
  return join(findRepoRoot(), 'specs', 'adaptors');
}

/** Directory holding one adaptor's spec files. */
export function adaptorDir(name: string): string {
  return join(registryRoot(), name);
}

export function openapiPath(name: string): string {
  return join(adaptorDir(name), 'openapi.json');
}

export function sourcePath(name: string): string {
  return join(adaptorDir(name), 'source.json');
}

/** Directory holding one adaptor's standalone data-object schema files. */
export function dataSchemasDir(name: string): string {
  return join(adaptorDir(name), 'data-schemas');
}

/** Index listing an adaptor's data objects (written inside data-schemas/). */
export function dataSchemasIndexPath(name: string): string {
  return join(dataSchemasDir(name), 'index.json');
}

export function manifestPath(): string {
  return join(registryRoot(), 'manifest.json');
}
