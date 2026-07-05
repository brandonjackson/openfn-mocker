# 001 — Covering the long tail of API endpoints

**Status:** accepted (core mechanism implemented; rollout phased)
**Date:** 2026-07-05

## Problem

openfn-mocker promises *faithful* mocks across 40+ systems, offline. Several
adaptors are generic HTTP clients — `get(path)`, `post(path)`, `request(...)` —
so the addressable surface is the **entire** real API, not a list of functions
we can enumerate. Hand-modeling every endpoint doesn't scale to 40+ systems,
and `pnpm audit:adaptors` being green proves function coverage, not endpoint
coverage: one usage example for `get()` says nothing about the thousand paths
`get()` can reach.

Today's failure mode is worse than a 404. Plugins with generic surfaces
hand-roll wildcards (dhis2 `/api/*`, http-generic `/*`) that bake in **one**
generalized envelope guess. For DHIS2's uniform metadata CRUD that guess is
right by design; for the heterogeneous tail (`/api/dataStore/...`, `/api/me`,
Twilio subresources, Mailgun routes) the mock returns a structurally wrong
response **silently**. Nothing tells the user — or us — that fidelity just
dropped to zero.

## What "coverage" has to mean

No approach hand-models an unbounded surface. The only honest definition of
done is **graded fidelity, measured**: every request is answered at some
declared fidelity level, the level is observable, and real usage tells us
which endpoints deserve an upgrade. That reframing drives the evaluation
below.

## Options considered

### A. Adaptor-derived only (status quo, extended)

Keep mocking exactly what each adaptor calls; where adaptors are generic, keep
writing per-system wildcards with a generalized envelope.

- ✅ Highest fidelity where it applies; no new machinery.
- ✅ Right tool for *uniform-by-design* APIs (DHIS2 metadata CRUD, FHIR
  `{resourceType}` routes) — the wildcard **is** the faithful model there.
- ❌ Breaks on heterogeneous tails: one envelope guess per system, silently
  wrong everywhere it doesn't fit. This is the breakage in the pitch.
- ❌ Every system author re-solves "what do I do about unknown paths"
  differently (dhis2 wildcard ≠ openmrs wildcard ≠ http-generic echo).
- ❌ No signal for what's missing; the promise breaks invisibly.

### B. Spec-driven runtime engine (the abandoned approach, revived as-was)

Vendor each system's OpenAPI spec and derive routes/responses from it as the
primary mechanism; hand code only where the spec falls short.

- ✅ Broad coverage per unit of authoring effort; specs exist for many targets.
- ❌ **Already failed here.** Spec-derived behavior and plugin logic were
  peers answering the same endpoints — two sources of truth that drifted
  (repo history: specs were demoted to authoring references and pruned down
  to mirror the modeled surface, so they currently add no information).
- ❌ Real envelopes are exactly where specs are weakest (DHIS2 ImportSummary,
  Tastypie wrappers, OpenRosa XML) — the fidelity that is this project's
  point can't be generated from a schema.
- ❌ Full vendor specs are multi-megabyte and unreviewable.

### C. Record & replay (VCR) against live systems

Capture real request/response traffic per system; replay it offline.

- ✅ Perfect fidelity for captured exchanges.
- ❌ Requires credentialed access to 40+ live systems — the exact dependency
  this project exists to remove — and captures real PII into fixtures.
- ❌ Covers only the paths someone happened to record; the long tail is
  unbounded, so this is enumeration again, with brittler artifacts.
- Verdict: useful someday as an *authoring aid* for tricky envelopes, not an
  architecture.

### D. Universal echo catch-all

Give every system http-generic's `/*` treatment: any path works, echo-style
records, stateful CRUD keyed by path.

- ✅ Nothing 404s; trivial to apply everywhere; fully offline.
- ❌ Answers everything with a shape that is faithful to **no** system —
  institutionalizes the silent-wrongness problem instead of fixing it.
- ❌ An adaptor that checks response envelopes (`pager`, `{ meta, objects }`)
  still breaks, now with a misleading 200.

### E. LLM-generated responses

Have a model produce plausible responses, either at request time or as a
pre-generated corpus per endpoint.

- ❌ At request time: violates the offline/deterministic promise outright
  (the repo's rule — LLM at generation time only, never at serve time — is
  already established by the seed-dataset design).
- ❌ As a corpus: enumeration again (which endpoints? which variants?), plus
  hallucinated shapes with no ground truth to check against.
- Verdict: LLMs stay at *authoring* time — drafting spec subsets and seed
  data that get committed and reviewed.

### F. Tiered fidelity: modeled wins, spec answers the tail, everything tagged **(recommended)**

Keep hand-written routes as the top tier. Add an engine-provided,
**spec-backed fallback** as each system's not-found handler: requests no
route matches are matched against a committed OpenAPI *subset* and served
schema-shaped, store-backed responses with the spec's status codes. Keep
echo as an explicit bottom tier where a system opts into it. Tag **every**
response with the tier that answered it, in the request log and on the wire.

- ✅ **Drift cannot recur, by construction.** The old approach failed because
  spec-derived behavior was a peer of plugin code. Here the spec is strictly
  subordinate: the router always prefers registered routes; the fallback only
  speaks when nothing matched; there is no generated code to drift.
- ✅ Structural fidelity on the documented tail (real status codes, real field
  names from per-property `example`s), stateful enough for create-then-read
  workflows, fully offline and deterministic.
- ✅ Turns "unknowable surface" into a measured quantity — the fidelity tag is
  the demand signal that closes the loop (see below).
- ✅ Baked into system creation: authors write handlers only for what needs
  real semantics, commit a spec subset, set one flag. Nobody re-solves the
  unknown-path question per system.
- ⚠️ Costs: spec subsets must be authored/pruned per system (tooling can
  pull-and-prune published specs); tier-2 answers are shape-faithful, not
  semantics-faithful (documented, tagged, and that's the honest ceiling for
  an unbounded surface).

## Decision

**Option F**, with A retained where it's genuinely right: uniform-by-design
APIs keep their hand wildcards as *modeled* coverage; heterogeneous documented
tails go to the spec fallback; echo survives only as a declared bottom tier.

The fidelity ladder every system sits on:

| Tier | Answered by | Fidelity claim | Tagged as |
|------|-------------|----------------|-----------|
| 1 | hand-written route (incl. deliberate wildcards) | semantic: envelopes, state, quirks | `modeled` |
| 2 | spec-backed fallback (`specFallback: true` + `specFile`) | structural: paths, fields, status codes | `spec` |
| 3 | catch-all echo (explicit, e.g. http-generic) | liveness only | `generic` |
| — | nothing | honest 404 | `none` |

### Closing the loop

1. **Runtime telemetry (implemented):** every logged request carries
   `fidelity`; spec-served responses also carry an `x-mock-fidelity: spec`
   header. Real traffic landing on tier 2/3 is the exact, prioritized list of
   endpoints worth promoting to tier 1 — demand-driven, not
   spec-completionist.
2. **Static audit (phase 2):** `pnpm audit:endpoints` boots each system,
   replays every spec operation, and reports which tier answers each — the
   endpoint-level sibling of `audit:adaptors`, CI-gateable ("no documented
   operation may 404").
3. **Existing loops unchanged:** `audit:adaptors` (function surface) and
   `test:usage` (end-to-end through real adaptors) keep doing their jobs.

### Spec acquisition policy

- Specs are **committed, pruned subsets** (paths, methods, success status,
  response schemas with `example`s) — reviewable, bounded, offline at runtime.
  This reverses the earlier prune-to-modeled-surface trajectory: specs should
  now grow *past* the modeled surface, because that's the only place they add
  information.
- Phase 2 tooling (`pnpm spec:pull`) mechanically fetches and prunes published
  vendor OpenAPI where it exists (DHIS2, Twilio, Mailgun, FHIR, DRF/Tastypie
  introspection). Where none exists, subsets are hand-authored, optionally
  LLM-drafted at authoring time and reviewed like any code.
- Authoring rule: give identity and envelope fields good `example` values —
  the fallback's payloads are only as faithful as the spec's examples.

### Known limitations (accepted, documented)

- Fallback state is path-keyed and **not shared** with modeled routes'
  collections. When a tail endpoint must share state with modeled semantics,
  that is the promotion trigger — model it.
- Query params are ignored for matching/filtering; error bodies are generic;
  form-PascalCase APIs echo request casing imperfectly. All tier-2 ceilings,
  all visible in the tags.

## Implemented in this change (proof of mechanism)

- `src/engine/spec-fallback.ts` — operation matching (most-specific wins),
  schema-shaped responses via the existing `exampleFromSchema`, path-keyed
  stateful CRUD (http-generic's convention), id uniquification in the
  example's format.
- `registerSystem` wires it as the system's not-found handler when a plugin
  sets `specFallback: true`; auth enforcement, stochastic behavior, and
  request logging all apply to fallback-served requests (test-verified).
- `fidelity` on every request-log entry (`/_admin/requests` and the sandbox
  log get it for free) + `x-mock-fidelity` header on spec-served responses.
- Twilio opted in as the reference: its spec grew three real documented
  endpoints the plugin never modeled (Account fetch, Balance, call
  Recordings) and they now serve correctly-shaped responses, tagged.
- http-generic tags itself `generic`.

## Rollout

1. **Phase 1 (this change):** mechanism + tagging + twilio as reference.
2. **Phase 2:** `spec:pull` + `audit:endpoints`; grow specs and opt in the
   systems with the most generic surface (commcare, kobotoolbox, openmrs,
   godata — their `.schema.json` references become OpenAPI subsets); dhis2's
   wildcard delegates its unknown-resource default branch to the fallback
   (the callable form exists for exactly this).
3. **Phase 3:** sandbox coverage view over the fidelity telemetry; promote
   tier-2/3 hotspots to modeled routes as real usage surfaces them.
