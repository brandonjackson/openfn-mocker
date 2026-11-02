# Working in openfn-mocker

Mock API servers that impersonate external systems for OpenFn workflow testing.
Each system is a hand-written Fastify plugin in `src/systems/<name>/`
(`plugin.ts` + `seed.ts` + `guide.ts` + `usage.ts`). This file is the workflow
and definition of done for adding or changing one; the README has the depth
(see "Adding a new system", "Testing usage examples end to end", "Local network
aliasing", "Roadmap").

## Specs are a dev-time reference, not a runtime input

`openfn-api-specs` is a **dev dependency** of this repo (installed from GitHub
by `pnpm install`), and nothing fetches a spec at runtime: the running mock
server, the Docker image (dev dependencies are pruned before the runtime
stage), and `pnpm test:usage` need no GitHub access and touch no CDN. (Mailgun
used to fetch its OpenAPI at startup to "backfill" event fields, but
`EventResponse` declares no required fields, so that step backfilled nothing —
it was dead weight and is gone.)

Every system's responses are built from its hand-written `seed.ts` +
`overrides`. The openfn-api-specs repo is the source of truth for API *shape*
(see below). Conformance to it is measured by a **yardstick**: of the routes
each mock serves, how many are verified against the spec. Each system's
result lives in its ledger, `src/systems/<name>/conformance.json`; CI keeps
the ledgers current and stops verified routes regressing; and the running
mock shows them all at `/status`. See "Conformance work order" below.

## The two sources of truth that govern correctness

Two references are authoritative — each ground truth for a different concern,
and neither the vendor's HTTP docs nor intuition substitutes for either:

- **The [`openfn-api-specs`](https://github.com/brandonjackson/openfn-api-specs)
  repo is authoritative for the *shape* of the APIs you impersonate** — their
  request/response envelopes, field names, data-object schemas, and status
  codes. The mock's response bodies and seeded record shapes must match the
  spec. Consult them directly in that repo (or its jsDelivr mirror) while
  authoring; they are maintained there, not vendored or fetched here.
- **The published OpenFn adaptor is ground truth for how it *engages* those
  APIs** — for both the request paths/methods it calls *and* the argument shape
  of every function. The mock's routes and the `usage.ts` snippets must match
  the adaptor.

A green `pnpm test` is **necessary but not sufficient.** The unit tests assert
the mock against *your own* assumptions, and the README table is generated from
the plugin's *own* metadata — so a wrong path or a wrong signature sails through
both. (This has happened: several systems shipped green unit tests that
hard-coded the same wrong paths their plugins used.) The only check that
compares against ground truth is `pnpm test:usage`, because it runs the real
published adaptor. **No system is done until `test:usage` is green for it.**

## Before writing anything: read the adaptor

```
npm pack @openfn/language-<name>   # then untar and read dist/*.js + configuration-schema.json
```

For each function the system exposes, write down:

1. **Method + exact path** it builds — including any `/api`, version prefix
   (`/v1`, `/api/v2`), colon-verbs (`:append`, `:batchUpdate`,
   `createUploadSession`), or hardcoded host.
2. **Argument shape** — positional args vs a single options object; base64-string
   content vs an object; arrays that get *spread* (so the arg must be an array);
   stateful prerequisites (e.g. msgraph `getFolder` needs a prior `getDrive`).
3. **How it gets its base URL** — does it read a `baseUrl` / `apiUrl` / `host` /
   `instanceUrl` field from the credential (→ set that field with `role: 'url'`
   or `'host'`), or does it hardcode / derive the host (→ add `hostAliases`)?

## Attachments: reuse the shared dummy fixtures

If the adaptor has a function that **returns file bytes** (downloads an
attachment, media, document, or rendered file), serve a real dummy file rather
than inventing bytes inline. `src/systems/shared/attachments.ts` provides tiny
but genuinely valid fixtures — `exampleCsv`, `exampleXlsx`, `examplePng`,
`examplePdf`, `exampleJpg`, `exampleTxt` — each exposing
`{ filename, mimeType, size, base64, base64url, bytes() }`. The bytes are carried
inline (pure TS, so they compile into `dist/` and ship in the Docker image; no
runtime `fs`), mirrored as real files under `test/fixtures/attachments/`, and
`test/attachments-fixtures.test.ts` asserts the two never drift.

- **Pick a fixture that matches the content type the adaptor decodes.** Several
  adaptors read a downloaded file as **text** (msgraph `getFile`, an
  azure-storage `downloadAs: 'string'`), so hand those a text fixture (`exampleCsv`
  / `exampleTxt`) — a binary one would come back corrupted. Binary-safe download
  paths (raw bytes → base64, e.g. gmail, googledrive, odk, kobotoolbox) can use any.
- **Seed the bytes and serve them at the exact route the adaptor's download
  function hits** (see `src/systems/gmail/seed.ts` + `plugin.ts` for the canonical
  example: an `attachments` collection + a route returning the base64url/bytes).
- **Only do this where a *published adaptor function* actually fetches the
  bytes.** Send-only (twilio, mailgun) or upload-only (commcare) adaptors, or ones
  with no file op at all (maximo), get no downloadable seed — it would be dead
  content no `test:usage` run could reach.
- **Need a type that isn't there yet?** Add it to `shared/attachments.ts` *and*
  `test/fixtures/attachments/`, extend the array + the anti-drift test, and prefer
  a real, valid file of that type.

## Checklist — adding or changing a system

- [ ] Read the adaptor source (above); record path/method, arg shape, and
      base-URL handling per function.
- [ ] `plugin.ts` `overrides` routes match the adaptor's real paths and methods,
      and their response envelopes/field shapes match the `openfn-api-specs`
      spec (lean on `registerCrud` / `paginate` / shared helpers).
- [ ] `credential` matches the adaptor's `configuration-schema.json`; the
      url/host field is set for configurable adaptors; `hostAliases` is set for
      adaptors that hardcode or derive their host.
- [ ] `seed.ts` has records whose ids/names the usage snippets reference
      (fewer than 50 per collection). If a function returns file bytes, seed a
      shared dummy fixture (see "Attachments" above), not ad-hoc inline bytes.
- [ ] `usage.ts` snippets call each function with the adaptor's **real
      signature** (from the source, not the HTTP docs).
- [ ] `guide.ts` API examples use the same paths the adaptor actually calls.
- [ ] Registered in `src/systems/index.ts` (registry key == `plugin.name`).
- [ ] `pnpm test` green — add/keep `test/<name>.test.ts`. Remember these can't
      catch a wrong path; they are not adaptor-fidelity checks.
- [ ] `pnpm readme` run (regenerates the supported-systems table + credential
      examples; `pnpm readme:check` gates it in CI).
- [ ] **`pnpm test:usage --system <name>` green** — every usage example runs end
      to end through the real adaptor, *or* each remaining failure is a
      documented Roadmap blocker (see below). **This is the definition of done.**
- [ ] `pnpm test:conformance -- --system <name>` run and read, worked per the
      "Conformance work order" below, and the ledger updated with
      `--update-baseline` (CI's `--check-baseline` fails otherwise).

## Conformance work order

The goal is every mock route **verified**: exercised by a guide example, and
either passing the spec or failing only where the spec is provably wrong.

**The yardstick.** `pnpm test:conformance` (10s, offline) puts every route a
mock serves in one state, and the headline is verified / routes:

| state | meaning |
|-------|---------|
| `conforming` | a guide example hits it; every request and response passes the spec |
| `deviating` | hit; its only violations are accepted entries in the ledger, and its response was still schema-checked |
| `unchecked` | hit; nothing failed, but an accepted `unknown-operation`, `unknown-status` or `content-type` means its response was **never** schema-checked. Not verified. |
| `failing` | hit; at least one violation not accepted |
| `unexercised` | no guide example reaches it, so nothing is known |

Only `conforming` and `deviating` count as verified. The engine is strict on
purpose: a 2xx the spec doesn't list is `unknown-status` (it never falls back to
the spec's `default` error shape), and a response whose media type the spec
doesn't document for that status is `content-type`.

**The ledger.** `src/systems/<name>/conformance.json` holds a snapshot of
that system's states (`routes`, `failures`, `unrouted`, written by
`--update-baseline`, never by hand) and the hand-written `deviations`. One file
per system, so agents on different systems never conflict. CI runs
`--check-baseline`, which fails if a route recorded as verified regresses, the
snapshot is out of date, or a deviation no longer matches anything (stale).

**Spec coverage.** The snapshot also records `coverage`: how many of the
operations in the adaptor's whole `openapi.json` the guide traffic exercised.
It is a second number, separate from the yardstick (whose denominator is the
mock's own routes), and answers "how much of the real API does this mock
cover?". `--update-baseline` also rebuilds the repo-root `coverage.json`, every
system's coverage in one file, which adaptors-storybook reads; `--check-baseline`
and `pnpm test` fail if it drifts from the ledgers. Adding a guide example that
reaches a new spec operation raises coverage.

**Working one system** (one agent, one system, one PR):

1. `pnpm test:conformance -- --system <name> --routes`. Read the failing and
   unexercised routes (also at `/status#sys-<name>` on a running mock).
2. **Unexercised route:** add a guide example to `guide.ts` that reaches it,
   using the path the adaptor really calls. Examples show on the sandbox page,
   so they should be ones a person would want to run.
3. **Failing route: decide whose bug it is before changing anything.**
   - *The mock's* (a missing required field, a wrong type, `201` where the API
     returns `200`, a wrong envelope): fix `seed.ts` / `plugin.ts`. This is
     the usual case, especially when the spec is a vendor OpenAPI.
   - *The spec's*: only when you have evidence from the **real system**, such as
     its source code, a captured live exchange, or the vendor's changelog. Two
     documents disagreeing is not evidence. Add a ledger deviation with that
     evidence (format below). If the spec is missing an endpoint or status
     (`spec-gap`), also fix it in `openfn-api-specs` and remove the deviation
     once the lockfile picks the fix up.
   - Never loosen the mock to fit a spec you believe is wrong, and never add a
     deviation to make a number go up.
4. **Unrouted guide request** (the mock 404'd its own example): the example
   path or the route is wrong; check the adaptor source.
5. `pnpm test:conformance -- --system <name> --update-baseline`, then `pnpm
   test`, `pnpm test:usage --system <name>` (a conformance fix must not break
   the real adaptor), and commit the ledger with the fix. The PR description
   gives the system's yardstick before and after.

A deviation entry:

```json
{
  "route": "GET /api/v2/assets/:uid/",
  "kind": "response-schema",
  "pointer": "/settings/country/*",
  "category": "vendor-spec-wrong",
  "reason": "KPI returns country as [{label, value}]; the OpenAPI annotation says string[]",
  "evidence": "https://github.com/kobotoolbox/kpi/blob/<sha>/kpi/serializers/v2/asset.py#L..."
}
```

`route` and `kind` must match the report exactly; `pointer` uses `*` for array
indices and may be omitted to accept every violation of that kind on the
route. `message` is a substring the violation's message must contain; it is
**required** for a request- or response-schema deviation at the body root (no
pointer, or `/`), which would otherwise excuse any future violation of the
whole body, and `--check-baseline` fails on one without it. Use it anywhere a
pointer alone is broader than the problem. `category` is one of
`vendor-spec-wrong`, `spec-gap`, `modelling` (mock and spec model the same
system through different APIs) or `mock-only`.

Two more hand-written ledger fields, for surfaces one spec doesn't cover:

- `specMounts: [{ "prefix": "/ws/fhir2/R4", "adaptor": "fhir" }]` checks
  traffic under `prefix` against another adaptor's spec, so a FHIR facade is
  validated as FHIR instead of excused as `unknown-operation`.
- `routeAliases: [{ "prefix": "/", "canonical": "/api/" }]` declares routes
  under `prefix` to be the same endpoints as those under `canonical` (a mock that
  serves both `/products` and `/api/products`). Aliases don't count as separate
  routes, and their traffic is scored against the canonical route.

## When `test:usage` fails, classify before fixing

- Error URL is `http://127.0.0.1:PORT/...` → the request **reached the mock**;
  the mock's route is wrong or missing → fix `plugin.ts` (path/method/response).
- Error is a **client-side throw** ("Missing required parameter…", `X is not
  iterable`, a `TypeError` from `Buffer.from`, a URL with `/undefined`) → the
  snippet passed the **wrong argument shape** → fix `usage.ts` to the real
  signature.
- Error hits a **real external host** (not 127.0.0.1) → the adaptor ignored the
  base URL because it hardcodes/derives its host → add `hostAliases`
  (see README "Local network aliasing").
- Error **reproduces with the adaptor outside this repo** (e.g. `node -e`, or an
  import-time crash) → it's an **upstream adaptor/packaging bug** → add it to the
  README "Roadmap" with the reproduction; do not try to paper over it in the mock.

## Definition of done (summary)

`pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm readme:check` pass, **and**
`pnpm test:usage --system <name>` is green — or every remaining usage failure is a
documented Roadmap blocker. Green unit tests alone are not "done."
