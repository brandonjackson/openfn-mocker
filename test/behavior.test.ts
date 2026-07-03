import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createSystemServer } from '../src/server.js';
import { resolveBehavior, sampleDelayMs } from '../src/behavior.js';
import httpGeneric from '../src/systems/http-generic/plugin.js';

const openServers: FastifyInstance[] = [];

async function boot(extra: Record<string, any> = {}) {
  const { app } = await createSystemServer(httpGeneric, { port: 0, ...extra }, { logLevel: 'silent' });
  openServers.push(app);
  return app;
}

afterAll(async () => {
  await Promise.all(openServers.map((a) => a.close()));
});

describe('behavior config resolution', () => {
  it('defaults every knob to a no-op', () => {
    const b = resolveBehavior(undefined);
    expect(b).toMatchObject({ mean: 0, stddev: 0, min: 0, errorRate: 0, errorStatus: 500 });
    expect(b.max).toBe(Number.POSITIVE_INFINITY);
  });

  it('clamps error_rate into [0,1] and floors min at 0', () => {
    expect(resolveBehavior({ error_rate: 5 }).errorRate).toBe(1);
    expect(resolveBehavior({ error_rate: -1 }).errorRate).toBe(0);
    expect(resolveBehavior({ latency: { min_ms: -100 } }).min).toBe(0);
  });

  it('ensures max is never below min', () => {
    const b = resolveBehavior({ latency: { min_ms: 500, max_ms: 100 } });
    expect(b.max).toBeGreaterThanOrEqual(b.min);
  });
});

describe('sampleDelayMs', () => {
  it('returns exactly the mean when stddev is 0', () => {
    const b = resolveBehavior({ latency: { mean_ms: 250 } });
    expect(sampleDelayMs(b)).toBe(250);
  });

  it('stays within [min, max] across many draws', () => {
    const b = resolveBehavior({ latency: { mean_ms: 100, stddev_ms: 500, min_ms: 10, max_ms: 200 } });
    for (let i = 0; i < 1000; i++) {
      const d = sampleDelayMs(b);
      expect(d).toBeGreaterThanOrEqual(10);
      expect(d).toBeLessThanOrEqual(200);
    }
  });

  it('has a sample mean close to the configured mean', () => {
    const b = resolveBehavior({ latency: { mean_ms: 100, stddev_ms: 20 } });
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += sampleDelayMs(b);
    expect(Math.abs(sum / n - 100)).toBeLessThan(5);
  });
});

describe('behavior applied to a running system', () => {
  it('adds latency before responding', async () => {
    const app = await boot({ latency: { mean_ms: 120 } });
    const start = Date.now();
    const res = await app.inject({ method: 'GET', url: '/anything' });
    expect(res.statusCode).toBe(200);
    expect(Date.now() - start).toBeGreaterThanOrEqual(100);
  });

  it('injects failures at error_rate=1', async () => {
    const app = await boot({ error_rate: 1, error_status: 503 });
    const res = await app.inject({ method: 'GET', url: '/anything' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ injected: true, error: 'injected_failure' });
  });

  it('never delays or fails the admin API', async () => {
    const app = await boot({ error_rate: 1, latency: { mean_ms: 500 } });
    const start = Date.now();
    const res = await app.inject({ method: 'GET', url: '/_admin/status' });
    expect(res.statusCode).toBe(200);
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('is a no-op when no knobs are set', async () => {
    const app = await boot();
    const start = Date.now();
    const res = await app.inject({ method: 'GET', url: '/anything' });
    expect(res.statusCode).toBe(200);
    expect(Date.now() - start).toBeLessThan(50);
  });
});
