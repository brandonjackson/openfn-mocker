import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildCoverageSummary, coverageSummaryJson } from '../src/conformance-ledger.js';

const SYSTEMS_DIR = fileURLToPath(new URL('../src/systems', import.meta.url));
const COVERAGE_PATH = fileURLToPath(new URL('../coverage.json', import.meta.url));

describe('coverage.json', () => {
  it('is derived from the ledgers (rebuild with pnpm test:conformance -- --update-baseline)', () => {
    expect(readFileSync(COVERAGE_PATH, 'utf8')).toBe(coverageSummaryJson(SYSTEMS_DIR));
  });

  it('gives every system a consistent percentage of its spec', () => {
    const { systems, totals } = buildCoverageSummary(SYSTEMS_DIR);
    expect(systems.length).toBeGreaterThan(0);
    for (const s of systems) {
      expect(s.exercised).toBeLessThanOrEqual(s.specOperations);
      expect(s.percent).toBe(s.specOperations ? Math.round((s.exercised / s.specOperations) * 1000) / 10 : 0);
    }
    expect(totals.exercised).toBe(systems.reduce((n, s) => n + s.exercised, 0));
  });
});
