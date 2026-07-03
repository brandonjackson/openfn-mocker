import type { FastifyInstance } from 'fastify';
import type { SystemConfig } from './systems/types.js';

/**
 * Stochastic-behavior knobs for a mock system. These let a mock feel like a
 * real, imperfect network service instead of an instant in-memory one, so
 * OpenFn workflows can be exercised against realistic latency and flakiness.
 *
 * Every field is optional; an absent/zeroed block means "instant, never fails"
 * (the historical behavior). Values come from the system's config block in
 * mock.config.yaml (per-system), optionally defaulted from a top-level block.
 */
export interface LatencyConfig {
  /** Mean added response delay, in milliseconds (Gaussian center). Default 0. */
  mean_ms?: number;
  /**
   * Standard deviation of the added delay, in milliseconds (Gaussian spread).
   * 0 (default) makes every response take exactly `mean_ms`.
   */
  stddev_ms?: number;
  /** Floor applied after sampling, in milliseconds. Default 0 (never negative). */
  min_ms?: number;
  /** Ceiling applied after sampling, in milliseconds. Default: no cap. */
  max_ms?: number;
}

/**
 * Deterministic request-rate ceiling: reject a request once more than `max`
 * requests have been seen within a rolling `window_ms`. Distinct from
 * `error_rate`, which fails requests at random regardless of volume — this only
 * fires under sustained load, reproducing a real API's throttling regime (the
 * failure mode a load test exists to reach).
 */
export interface RateLimitConfig {
  /** Max requests allowed per window before rejection. 0/absent disables it. */
  max?: number;
  /** Length of the counting window, in milliseconds. Default 1000. */
  window_ms?: number;
  /** HTTP status used when the limit is exceeded. Default 429. */
  status?: number;
}

export interface BehaviorConfig {
  /** Per-request latency simulation. */
  latency?: LatencyConfig;
  /**
   * Probability in [0, 1] that a request is answered with an injected failure
   * instead of the real handler. 0 (default) never fails.
   */
  error_rate?: number;
  /** HTTP status used for an injected failure. Default 500. */
  error_status?: number;
  /** Deterministic rate limiting: reject requests above a threshold. */
  rate_limit?: RateLimitConfig;
}

/** A resolved, fully-defaulted view of the behavior knobs. */
interface ResolvedBehavior {
  mean: number;
  stddev: number;
  min: number;
  max: number;
  errorRate: number;
  errorStatus: number;
  /** Rate-limit ceiling, or 0 when unlimited. */
  rateLimitMax: number;
  rateLimitWindowMs: number;
  rateLimitStatus: number;
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize a raw config block into fully-defaulted, sane numbers. */
export function resolveBehavior(config: BehaviorConfig | undefined): ResolvedBehavior {
  const latency = config?.latency ?? {};
  const min = Math.max(0, num(latency.min_ms, 0));
  const maxRaw = num(latency.max_ms, Number.POSITIVE_INFINITY);
  const rl = config?.rate_limit ?? {};
  return {
    mean: Math.max(0, num(latency.mean_ms, 0)),
    stddev: Math.max(0, num(latency.stddev_ms, 0)),
    min,
    max: Math.max(min, maxRaw),
    errorRate: Math.min(1, Math.max(0, num(config?.error_rate, 0))),
    errorStatus: Math.trunc(num(config?.error_status, 500)),
    rateLimitMax: Math.max(0, Math.trunc(num(rl.max, 0))),
    rateLimitWindowMs: Math.max(1, Math.trunc(num(rl.window_ms, 1000))),
    rateLimitStatus: Math.trunc(num(rl.status, 429)),
  };
}

/** True if the knobs would ever do anything (latency, errors, or rate limit). */
function isActive(b: ResolvedBehavior): boolean {
  return b.mean > 0 || b.stddev > 0 || b.errorRate > 0 || b.rateLimitMax > 0;
}

/**
 * Draw a standard-normal sample via the Box-Muller transform. `Math.random()`
 * is fine here (this is server runtime, not a workflow script).
 */
function standardNormal(): number {
  // Avoid log(0) by excluding exactly 0.
  const u1 = Math.random() || Number.MIN_VALUE;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Sample a per-request delay in milliseconds from N(mean, stddev), clamped to
 * [min, max]. Deterministic (returns `min`-clamped `mean`) when stddev is 0.
 */
export function sampleDelayMs(b: ResolvedBehavior): number {
  const raw = b.stddev > 0 ? b.mean + b.stddev * standardNormal() : b.mean;
  return Math.min(b.max, Math.max(b.min, Math.round(raw)));
}

/**
 * A fixed-window request counter. Returns false while the caller is within the
 * `max`-per-`window_ms` budget and true once it should be throttled. Resets the
 * count at each window boundary. Disabled (always false) when `max` is 0.
 */
export function makeRateLimiter(b: ResolvedBehavior): (now: number) => boolean {
  if (b.rateLimitMax <= 0) return () => false;
  let windowStart = 0;
  let count = 0;
  return (now: number): boolean => {
    if (now - windowStart >= b.rateLimitWindowMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count > b.rateLimitMax;
  };
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

/**
 * Attach stochastic-behavior hooks to a Fastify instance: an `onRequest` hook
 * that (1) rejects with a 429 once the rate limit is exceeded, (2) sleeps for a
 * sampled latency, and (3) with probability `error_rate` short-circuits the real
 * handler with an injected failure response. No-ops (registers nothing) when the
 * config leaves every knob at its default, so systems without a behavior block
 * keep answering instantly.
 */
export function registerBehavior(app: FastifyInstance, config: SystemConfig): void {
  const b = resolveBehavior(config as BehaviorConfig);
  if (!isActive(b)) return;

  const overLimit = makeRateLimiter(b);

  app.addHook('onRequest', async (request, reply) => {
    // Never delay/fail the admin API — you still want to inspect a "slow" system.
    if ((request.url ?? '').includes('/_admin')) return;

    // Rate limiting happens before latency so a throttled request is rejected
    // promptly, the way a real load balancer sheds excess traffic.
    if (b.rateLimitMax > 0 && overLimit(Date.now())) {
      reply.code(b.rateLimitStatus).send({
        error: 'rate_limited',
        message: `openfn-mocker rejected this request: over ${b.rateLimitMax} requests per ${b.rateLimitWindowMs}ms`,
        injected: true,
      });
      return;
    }

    await sleep(sampleDelayMs(b));

    if (b.errorRate > 0 && Math.random() < b.errorRate) {
      reply.code(b.errorStatus).send({
        error: 'injected_failure',
        message: `openfn-mocker injected a synthetic ${b.errorStatus} (error_rate=${b.errorRate})`,
        injected: true,
      });
    }
  });
}
