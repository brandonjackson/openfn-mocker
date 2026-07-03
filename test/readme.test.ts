import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderReadme, README_PATH } from '../scripts/generate-readme.js';

/**
 * Drift guard for the README sections generated from plugin metadata (the
 * supported-systems table and the per-system credential examples). If a plugin
 * changes and the README was not regenerated, this fails — run `pnpm readme` and
 * commit the result.
 */
describe('README generated sections', () => {
  it('are up to date with the plugins (run `pnpm readme` to refresh)', () => {
    const readme = readFileSync(README_PATH, 'utf8');
    expect(renderReadme(readme)).toBe(readme);
  });
});
