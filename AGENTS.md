# Working in openfn-mocker

Mock API servers that impersonate external systems for OpenFn workflow testing.
Each system is a hand-written Fastify plugin in `src/systems/<name>/`
(`plugin.ts` + `seed.ts` + `guide.ts` + `usage.ts`). This file is the workflow
and definition of done for adding or changing one; the README has the depth
(see "Adding a new system", "Testing usage examples end to end", "Local network
aliasing", "Roadmap").

## Specs are a dev-time reference, not a runtime input

`openfn-api-specs` is **not** a dependency of this repo, and nothing fetches a
spec at runtime. `pnpm install`, the running mock server, and `pnpm test:usage`
need no GitHub access and touch no CDN. (Mailgun used to fetch its OpenAPI at
startup to "backfill" event fields, but `EventResponse` declares no required
fields, so that step backfilled nothing — it was dead weight and is gone.)

Every system's responses are built from its hand-written `seed.ts` +
`overrides`. The openfn-api-specs repo is the source of truth for API *shape*
(see below), but conforming to it is a **development workflow** you run while
authoring a system — compare `seed.ts`/`plugin.ts` against the spec by hand — not
something enforced on the runtime or usage-test critical path.

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
      (fewer than 50 per collection).
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
