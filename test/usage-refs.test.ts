import { describe, it, expect } from 'vitest';
import { plugins } from '../src/systems/index.js';
import { SYSTEM_GUIDES } from '../src/sandbox.js';

/**
 * Usage examples live per-adaptor on the plugin (`MockSystemPlugin.usage`, in each
 * system's usage.ts), but their `apiRef` cross-links to an example on the guide's
 * "API" tab, which lives in SYSTEM_GUIDES. Nothing in the type system ties the two
 * together, and the end-to-end `pnpm test:usage` that would exercise them is
 * network-gated and not part of this suite. This offline guard catches the common
 * rot — a usage snippet pointing at an example id that doesn't exist (a renamed or
 * reordered example) — so it fails in CI, cheaply, the moment the link breaks.
 *
 * The set of valid targets mirrors resolveExamples() in sandbox.ts: each example's
 * explicit `id`, or its positional `ex<index>` when it declares none.
 */

/** Valid apiRef targets for a system: explicit ids + positional `ex<index>`. */
function exampleIds(system: string): Set<string> {
  const examples = SYSTEM_GUIDES[system]?.examples ?? [];
  return new Set(examples.map((ex, i) => ex.id ?? 'ex' + i));
}

const systemsWithUsage = Object.keys(plugins)
  .filter((name) => (plugins[name].usage?.length ?? 0) > 0)
  .sort();

describe('usage example apiRefs resolve to real API examples', () => {
  it('covers every system that authored usage examples', () => {
    // Guards the guard: if this ever hits zero, the discovery below is vacuous.
    expect(systemsWithUsage.length).toBeGreaterThan(0);
  });

  for (const system of systemsWithUsage) {
    it(`${system}: every usage apiRef points at an existing example`, () => {
      const ids = exampleIds(system);
      const usage = plugins[system].usage ?? [];
      for (const u of usage) {
        if (u.apiRef == null) continue; // apiRef is optional
        expect(
          ids.has(u.apiRef),
          `${system} usage "${u.fn}" references apiRef "${u.apiRef}", ` +
            `which is not an example id (have: ${[...ids].join(', ') || 'none'})`
        ).toBe(true);
      }
    });
  }
});
