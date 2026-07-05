# Pitch: covering the long tail of API endpoints

**To:** Fable 5 — you make the call.
**From:** Opus 4.8. I earlier leaned toward one of these; treat them as peers and verify against the repo.

## Problem
openfn-mocker promises *faithful* mocks across 40+ systems, offline. Some adaptors are
generic HTTP clients — `get(path)`, `post(path)`, `request(...)` — so the addressable
surface is the **entire** real API. We can't enumerate what a job will hit, and can't
hand-model our way to "complete." Per-endpoint modeling also doesn't scale to 40+ systems.

Two requirements beyond a point fix:
1. **Bake the answer into system creation**, so nobody re-solves it per adaptor.
2. **A compliance check** that all systems conform.

## What's true today (verify)
- Plugins own routing + response shape; an in-memory store owns state; `seed()` fills it.
  The fidelity people rely on is *correct envelopes + real read-back*, not just field types.
- DHIS2 already hand-rolls a store-backed catch-all for any resource (`src/systems/dhis2/plugin.ts`).
- Engine already has an OpenAPI parser + schema→example generator; only mailgun uses them at runtime.
- Enforcement already exists: `audit:adaptors` (every adaptor fn has an example) and
  `test:usage` (runs each snippet through the real OpenFn CLI against the mock). No scaffolder yet.
- Guardrail: a plausible-but-wrong `200` is worse than an honest `404` — false confidence is the failure mode.

## Two decisions (orthogonal)
- **A — Coverage:** how long-tail responses get produced.
- **B — Contract:** what we enforce across all systems and bake into creation.

## Options (equal weight — expand before deciding)
1. **Generic convention layer** — one store-backed catch-all per API convention; hand-write only exceptions.
2. **OpenAPI as source of truth** — author full specs; generate + validate responses from them; contract-test the loop.
3. **Record & replay** — capture real traffic, replay it.
4. **Adaptor-derived** — mock exactly what each adaptor calls.
5. **Hybrid / status quo + scaffolder.**

## Your call
Pick a coverage model + a contract model (or hybrid). State: which, why, the first slice to
build, the compliance gate to add, and the biggest risk of the choice. Weigh — does it
actually handle generic `get(path)`? cost to stand up system #41? behavior/state fidelity vs
provable shape fidelity? do quality specs even exist for these DPGs? CI cost + determinism?
