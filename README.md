# openfn-mocker

A configurable mock API server that impersonates the external systems OpenFn integrates with (DHIS2, CommCare, OpenMRS, FHIR, generic HTTP, Kobotoolbox, Primero, Mailgun, Twilio, Airtable) so you can develop and test OpenFn workflows end-to-end without touching a production instance. Every OpenFn adaptor reads a base URL from its credential and fires requests at it; openfn-mocker runs a realistic mock of each system, stores writes in memory so a create is readable in a later step, ships seed data so queries work on first boot, and exposes an admin API for inspecting traffic and state. The whole mock listens on **one port** and mounts each system under a path (`/dhis2`, `/fhir`, ...), so it works behind a single public domain (Railway, Render, Fly, etc.). Point your credential's URL field at `http://localhost:<port>/<system>` and your workflow runs against a fake-but-faithful API.

## Quick start

### Docker

```bash
docker build -t openfn-mocker .
docker run --rm -p 4000:4000 openfn-mocker
```

### docker-compose

```bash
docker compose up
```

The bundled `docker-compose.yml` publishes port `4000` and shows how to set the `MOCKER_PORT` and `MOCKER_SYSTEMS` environment overrides.

### Local (pnpm)

Requires Node.js 20+ and pnpm.

```bash
pnpm install
pnpm build      # compile TypeScript to dist/
pnpm start      # node dist/index.js

# or run from source with hot reload:
pnpm dev

# run the test suite:
pnpm test
```

On boot you will see each enabled system and the path it is mounted at:

```
  openfn-mocker running on http://localhost:4000
  ────────────────────────────────────────────
  dhis2            http://localhost:4000/dhis2
  commcare         http://localhost:4000/commcare
  ...
  admin            http://localhost:4000/_admin/systems
  ────────────────────────────────────────────
```

## Browser sandbox

Open the base URL (`http://localhost:4000`) in a browser and you get an
interactive **API sandbox** instead of raw JSON: one card per enabled system
with its OpenFn credential, a set of ready-to-run example requests (edit the
path or body, hit **Run**, see the live response inline), and a free-form
request console for anything else. It is a single self-contained page served
from the mock itself, so every request runs against the real in-memory data.

The root path content-negotiates: browsers (`Accept: text/html`) get the
sandbox; API clients (`curl`, the OpenFn adaptors) still get the documented
JSON index, so nothing about programmatic use changes.

## Deploying (Railway / single public domain)

Because everything listens on one port, a PaaS that exposes a single port per
service works out of the box. On Railway, add a public domain and pick the one
port the server listens on; the platform injects `$PORT`, which the server
honors automatically. Each system is then reachable at
`https://<your-app>.up.railway.app/<system>` (e.g. `.../dhis2/api/...`,
`.../fhir/Patient`). No wildcard DNS or per-system service is needed.

## Configuration

Configuration is read from `mock.config.yaml` (override the path with the `MOCKER_CONFIG` environment variable). A top-level `port` sets the single listen port; each system has its own block under `systems:` and is mounted at `/<name>`.

```yaml
log_level: info
port: 4000

systems:
  dhis2:
    enabled: true
    version: "2.39"

  commcare:
    enabled: true
    domain: test-project
    app_id: abc123

  fhir:
    enabled: true
    # Empty apiPath: the /fhir mount is the FHIR base, so resources are served
    # at /fhir/Patient (not /fhir/fhir/Patient).
    apiPath: ""

  # Salesforce is a disabled placeholder (no plugin in v1).
  salesforce:
    enabled: false
```

A system is enabled unless it sets `enabled: false`. Any extra keys in a system block (for example `domain`, `apiPath`, `account_sid`, `base_id`, `version`) are passed straight through to that system's plugin.

### Configuration terms

Each block under `systems:` accepts a small set of framework-level keys plus any
plugin-specific keys. The framework keys are understood by every system:

| Term | Type | Default | Meaning |
|------|------|---------|---------|
| `enabled` | bool | `true` | Mount this system. `false` leaves it out (and is how `salesforce` ships as a placeholder). |
| `seed` | string | — | Reserved per-system seed selector; normally you pick data with the top-level `dataset` / `MOCKER_DATASET` instead. |
| `latency` | map | — | Per-request response-time simulation. See [Simulating stochastic behavior](#simulating-stochastic-behavior). |
| `error_rate` | number | `0` | Probability in `[0, 1]` that a request gets an injected failure instead of the real response. |
| `error_status` | number | `500` | HTTP status used for an injected failure. |

Everything else in a block is **plugin-specific** and passed straight through to
that system's plugin as its `SystemConfig`. The plugin keys in the shipped
config are:

| System | Plugin keys | Meaning |
|--------|-------------|---------|
| `dhis2` | `version` | Value reported by `GET /api/system/info`. |
| `commcare` | `domain`, `app_id` | Project space and app id used in Tastypie paths / envelopes. |
| `fhir` | `variant`, `apiPath` | FHIR release (`r4`) and the sub-path of the FHIR base (empty because `/fhir` is already the base). |
| `mailgun` | `domain` | Sending domain in `POST /v3/{domain}/messages`. |
| `twilio` | `account_sid` | Account SID echoed in message/call resources. |
| `airtable` | `base_id` | Base id in `/{base_id}/{table}` paths. |

The single shared listen `port` is also copied onto every system's config so
plugins that build self-referential URLs (fhir, openmrs, kobotoolbox, mailgun,
dhis2) resolve the right origin; you do not set it per system.

### Simulating stochastic behavior

By default every mock answers instantly and never fails, which is convenient but
unrealistic. Two optional, per-system blocks let a mock behave like a real,
imperfect remote service so you can test how an OpenFn workflow copes with
latency, timeouts, and transient errors.

```yaml
systems:
  dhis2:
    enabled: true
    latency:
      mean_ms: 200      # average added delay per request (Gaussian center)
      stddev_ms: 60     # standard deviation of the delay (Gaussian spread)
      min_ms: 20        # floor applied after sampling (never negative)
      max_ms: 1500      # ceiling applied after sampling
    error_rate: 0.02    # 2% of requests get an injected failure
    error_status: 503   # status for that failure (default 500)
```

**Latency** (`latency:` block) — each request sleeps for a delay drawn from a
normal distribution `N(mean_ms, stddev_ms)`, clamped to `[min_ms, max_ms]`,
before the real handler runs:

| Term | Type | Default | Meaning |
|------|------|---------|---------|
| `mean_ms` | number | `0` | Mean added delay in milliseconds (center of the distribution). |
| `stddev_ms` | number | `0` | Standard deviation in milliseconds. `0` makes every response take exactly `mean_ms`. |
| `min_ms` | number | `0` | Lower clamp after sampling. Negative samples are floored to this (never below 0). |
| `max_ms` | number | ∞ | Upper clamp after sampling. |

**Error injection** (`error_rate` / `error_status`) — independently of latency,
each request has an `error_rate` probability of being answered with a synthetic
failure (`{ "error": "injected_failure", "injected": true, ... }`) at
`error_status` instead of reaching the handler.

Both features are **off unless configured**, so existing configs are unchanged.
The per-system `/_admin` API is always exempt — it never sleeps and never gets
an injected error, so you can still inspect a system you have made slow or flaky.

You can also set `latency` and `error_rate` at the **top level** of the config
as defaults for every system. A per-system block overrides the default, and the
`latency` map is merged key-by-key, so a system can override just `mean_ms`
while inheriting the shared `stddev_ms`:

```yaml
# Slow the whole mock down, then make one system flakier than the rest.
latency:
  mean_ms: 150
  stddev_ms: 40
error_rate: 0.0

systems:
  dhis2:
    latency: { mean_ms: 400 }   # inherits stddev_ms: 40
    error_rate: 0.05            # overrides the 0.0 default
```

### Environment overrides

Environment variables take precedence over the YAML file, which makes container deployment easy:

| Variable | Effect |
|----------|--------|
| `MOCKER_CONFIG` | Path to the config file (default `mock.config.yaml`). |
| `MOCKER_LOG_LEVEL` | Override `log_level`. |
| `MOCKER_PORT` | Override the single listen port. |
| `PORT` | PaaS single-port convention (Railway etc.). Used when `MOCKER_PORT` is unset. |
| `MOCKER_SYSTEMS` | Comma-separated allowlist. Only the named systems are enabled, everything else is disabled. e.g. `MOCKER_SYSTEMS=dhis2,mailgun,http-generic`. |
| `MOCKER_DATASET` | Which seed dataset to load (folder under `datasets/`). Default `default`. See [Seed datasets](#seed-datasets). |
| `MOCKER_DATASETS_DIR` | Directory holding datasets (default `datasets`). |

## Seed datasets

The data each system returns comes from a **dataset**: a folder under `datasets/`
holding one JSON dump per system plus a copy of the config that generated it. The
server loads one dataset at boot, chosen by `MOCKER_DATASET` (default `default`).

- **`default`** is committed to the repo, covers every system with one coherent
  imaginary scenario (a Sierra Leone public-health program), and is what the test
  suite runs against and the Docker image ships with. It is served straight from
  the built-in TypeScript seeds (`src/systems/<name>/seed.ts`) — no API key, no
  network, fully deterministic — so CI and the Railway deploy never depend on an
  LLM. Change it by editing the seed files.
- **Custom datasets** are generated on demand with an LLM, stored locally, and
  **git-ignored** (only `default` is committed). Use them for a demo flavoured for
  a specific context — say a Dominican Republic rollout with Spanish names, DR
  facilities, and `+1-809` phone numbers.

The LLM runs **only at generation time**, never at server boot: `pnpm generate-seed`
freezes the output to JSON on disk, and the running server just loads that JSON.

### Generating a custom dataset

1. Put your Anthropic token in the environment (override the model with
   `ANTHROPIC_MODEL` if you like; the default is `claude-opus-4-8`):

   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

2. Write a generation config. It describes the project at a high level and, if you
   want, per system and per table. Save it as e.g. `dr.yaml`:

   ```yaml
   name: dominican-republic
   description: >
     A maternal-health demo set in the Dominican Republic. Patients and staff have
     Dominican Spanish names; facilities are real DR provinces and municipios; phone
     numbers use the +1-809 area code; SMS and email are in Spanish.
   systems:
     dhis2:
       description: Org-unit hierarchy country -> province -> municipio using real DR names.
       collections:
         organisationUnits: "Use Distrito Nacional, Santiago, Santo Domingo."
     twilio:
       description: Appointment-reminder SMS in Spanish, +1-809 numbers.
   ```

3. Generate. Each system's `default` data is shown to the model as the shape to
   match, so the result stays structurally faithful (same fields, id formats, and
   cross-references) while the content is re-flavoured:

   ```bash
   pnpm generate-seed --name dominican-republic --config dr.yaml
   # limit to some systems:   --systems dhis2,fhir,twilio
   # preview without calling the API: --dry-run
   ```

   This writes `datasets/dominican-republic/<system>.json` plus a copy of the
   config as `datasets/dominican-republic/dataset.yaml`.

### Running against a dataset

```bash
MOCKER_DATASET=dominican-republic pnpm start
# or generate-if-missing then serve, in one step:
MOCKER_DATASET=dominican-republic MOCKER_DATASET_CONFIG=dr.yaml pnpm setup
```

`pnpm setup` serves the named dataset, generating it first if the folder doesn't
exist yet (it does nothing special for `default`, so Docker/CI are unaffected).

### Test example

The commands below generate a dataset, serve it, and confirm the returned data is
actually re-flavoured — no API key needed for the preview or the built-in default:

```bash
# 1. Preview what would be generated (offline, no API call):
pnpm generate-seed --name dominican-republic --config dr.yaml --dry-run

# 2. Generate it (needs ANTHROPIC_API_KEY), then serve on port 4000:
pnpm generate-seed --name dominican-republic --config dr.yaml
MOCKER_DATASET=dominican-republic MOCKER_SYSTEMS=dhis2,fhir pnpm start &

# 3. See the DR-flavoured data come back through the real API envelopes:
curl -s localhost:4000/dhis2/api/organisationUnits | jq '.organisationUnits[].name'
curl -s localhost:4000/fhir/Patient | jq '.entry[].resource.name'
```

The default dataset and the dataset loader are covered by the test suite:

```bash
pnpm test            # 121 tests, including test/datasets.test.ts
pnpm snapshot-default # regenerate datasets/default/ from the seed files
```

## Supported systems

Every system is mounted at `/<name>` on the shared port. The credential URL field is the mock's origin plus that path (e.g. `http://localhost:4000/dhis2`).

| System | Mount path | Credential URL field | Auth | Status |
|--------|------------|-----------------------|------|--------|
| dhis2 | `/dhis2` | `hostUrl` | Basic | stable |
| commcare | `/commcare` | `hostURL` | Basic or apiKey header | stable |
| openmrs | `/openmrs` | `instanceUrl` | Basic | stable |
| fhir | `/fhir` | `baseUrl` | none / Bearer | stable |
| http-generic | `/http-generic` | `baseUrl` | any | stable |
| salesforce | `/salesforce` | — | — | planned |
| kobotoolbox | `/kobotoolbox` | `baseURL` | Token | stable |
| primero | `/primero` | `baseUrl` | Token via `POST /api/v2/tokens` | stable |
| mailgun | `/mailgun` | `baseUrl` | Basic (`api:key`) | stable |
| twilio | `/twilio` | `baseUrl` | Basic (`sid:token`) | stable |
| airtable | `/airtable` | `baseUrl` | Bearer | stable |

Root admin routes (`/_admin/systems`, `/_admin/reset-all`) and a `GET /` index live on the shared port. Hitting `GET /` from a browser serves an interactive [API sandbox](#browser-sandbox); API clients get JSON.

### Auth is accept-all

In v1 the server never rejects a request for auth reasons. It parses the `Authorization` header for logging only (recording `{ type, username | token | key }`) and always proceeds. Primero has a real token-exchange endpoint (`POST /primero/api/v2/tokens` returns `{ "token": "mock_primero_token" }`), but subsequent calls are still accept-all. Data is stored in memory and resets on restart (or via the admin reset endpoints).

## Using with OpenFn

Create (or edit) the credential for each adaptor and point its URL field at the mock's origin plus the system's mount path. Any username/password/token works. The fixtures below match the seed data and defaults shipped in `mock.config.yaml`. Replace `http://localhost:4000` with your deployed origin as needed.

```json
// DHIS2
{ "hostUrl": "http://localhost:4000/dhis2", "username": "admin", "password": "mock" }

// CommCare
{ "hostURL": "http://localhost:4000/commcare", "domain": "test-project", "appId": "abc123", "username": "user@test.com", "password": "mock" }

// OpenMRS
{ "instanceUrl": "http://localhost:4000/openmrs", "username": "admin", "password": "mock" }

// FHIR  (the /fhir mount is the FHIR base, so apiPath is empty)
{ "baseUrl": "http://localhost:4000/fhir", "apiPath": "" }

// Generic HTTP
{ "baseUrl": "http://localhost:4000/http-generic" }

// Kobotoolbox
{ "baseURL": "http://localhost:4000/kobotoolbox", "apiToken": "mock-kobo-token" }

// Primero
{ "baseUrl": "http://localhost:4000/primero", "username": "primero", "password": "mock" }

// Mailgun
{ "baseUrl": "http://localhost:4000/mailgun", "domain": "sandbox-test.mailgun.org", "apiKey": "mock-api-key" }

// Twilio
{ "baseUrl": "http://localhost:4000/twilio", "accountSid": "ACtest123456", "authToken": "mock-auth-token" }

// Airtable
{ "baseUrl": "http://localhost:4000/airtable", "apiKey": "mock-airtable-token", "baseId": "appABC123" }
```

Each system implements the API surface its OpenFn adaptor actually calls (see [`openfn/adaptors`](https://github.com/OpenFn/adaptors)) with the real envelope shapes, status codes, and ID formats, so responses are structurally indistinguishable from the live system. Because several adaptors are *generic* clients (they build arbitrary paths rather than exposing one function per endpoint), those mocks cover a correspondingly broad surface:

- **dhis2** — the new Tracker API (`POST/GET /api/tracker`), `/api/analytics`, `/api/schemas`, `/api/resourceTypes`, an optional `/api/{version}/` segment, and CRUD (list/get/create/PUT/PATCH/DELETE) for any resource type, alongside the classic tracker/metadata/dataValueSets endpoints.
- **fhir** — searchset Bundles, reads, transaction/batch Bundles, plus the `/metadata` CapabilityStatement, resource `_history`, and a `Claim` for `getClaim()`.
- **openmrs** — a generic REST API (any resource name, subresources like `patient/{uuid}/identifier`, POST-to-uuid updates, `?purge` delete, `startIndex`/`limit` paging), `/ws/rest/v1/session`, and a FHIR R4 module (Patient/Encounter/Observation/Condition).
- **commcare** — the Tastypie `{ meta, objects }` Data API for any v0.5 resource (case/form/user/application/location), the configurable-report endpoint, the OpenRosa receiver, and the Excel/lookup-table bulk-upload endpoints.
- **kobotoolbox** — `getForms` (`?asset_type=`), `getSubmissions` (`?query=`/`?sort=`), `getDeploymentInfo`, and generic `http.*` asset/data operations (create/update/delete, deploy, bulk data PATCH).
- **primero** — token exchange, cases, case referrals (`GET/POST/PATCH .../referrals`), and the forms/lookups/locations reference data.
- **airtable** — Airtable's Web API (used in OpenFn via the generic `http` adaptor): list (GET or `POST .../listRecords`), single/batch create, update, upsert (`performUpsert`), and delete.
- **twilio / mailgun** — the single send operation each adaptor exposes (`POST .../Messages.json`, `POST /v3/{domain}/messages`), plus extra read endpoints (Twilio messages/calls, Mailgun events/stats) for convenience.
- **http-generic** — a spec-less catch-all that answers any method/path, matching the generic `http` (`common`) adaptor.

## Admin API

Every system mounts an admin API under its own path at `/<system>/_admin`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/<system>/_admin/status` | `{ system, mountPath, uptime, recordCounts }`. |
| GET | `/<system>/_admin/requests` | Last 100 requests (method, path, status, auth, body summary, timestamp). |
| GET | `/<system>/_admin/store` | Full in-memory store dump. |
| POST | `/<system>/_admin/reset` | Clear the store and re-seed. |
| POST | `/<system>/_admin/seed` | Re-seed without clearing. |

Root routes on the shared port aggregate across systems:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Browser (`Accept: text/html`): interactive API sandbox. API clients: `{ name, systems: [{ name, path }] }`. |
| GET | `/_admin/systems` | `[{ name, path, status }]` for every mounted system. |
| POST | `/_admin/reset-all` | Reset every enabled system's store. |

Examples:

```bash
curl http://localhost:4000/_admin/systems
curl http://localhost:4000/dhis2/_admin/status
curl http://localhost:4000/dhis2/_admin/requests
curl -X POST http://localhost:4000/_admin/reset-all
```

## Adding a new system

Systems are spec-driven. Each is backed by an OpenAPI or JSON-schema document in `specs/` that is the source of truth for routes and response shapes, plus a thin plugin. A shared engine (`src/engine/`) turns specs and plugin declarations into Fastify routes and correctly-shaped responses, so plugins stay small.

1. Drop a spec in `specs/` covering just the endpoints the adaptor calls (a faithful subset is fine; you do not need the whole API surface). Spec-less catch-all systems like http-generic omit this.
2. Create `src/systems/<name>/plugin.ts` implementing `MockSystemPlugin`:

   ```ts
   import type { MockSystemPlugin } from '../types.js';
   import { seed } from './seed.js';

   const plugin: MockSystemPlugin = {
     name: 'mysystem',
     specFile: 'mysystem.openapi.json', // optional
     seed,                               // populates the store at boot / reset
     overrides(app, store, config) {
       // Register custom / non-CRUD routes on `app` here. The system is mounted
       // at /mysystem, so a route '/api/things' is served at /mysystem/api/things.
       // Auth parsing, admin routes and request logging are already attached,
       // so request.mockAuth is available in every handler.
       // Call the engine helpers (route-registrar, response-generator,
       // spec-parser) for CRUD wiring and envelope generation.
     },
   };

   export default plugin;
   ```

3. Add `src/systems/<name>/seed.ts` exporting a `seed(store, config)` function that writes a small set of realistic records (fewer than 50 per collection).
4. Register the plugin in `src/systems/index.ts` (the registry key is the mount path) and add a block to `mock.config.yaml`.
5. Add `test/<name>.test.ts` exercising the endpoints, and run `pnpm test`. Tests build a single system with `createSystemServer`, so they use unprefixed paths (e.g. `/api/things`); the running server mounts the same routes under `/<name>`.

The engine provides CRUD wiring, envelope shaping, and seeding; a plugin only needs to declare its identity and spec, register any non-CRUD routes in `overrides`, and supply seed data. Where an API's envelopes do not fit plain CRUD (DHIS2 import summaries, FHIR Bundles, Tastypie/DRF wrappers, Twilio's `.json` snake_case shapes), plugins register custom Fastify handlers and use engine helpers such as `paginate()` for the parts that do fit.

### Plugin API reference

A plugin is a plain object implementing `MockSystemPlugin` (`src/systems/types.ts`).
It is deliberately small — identity, an optional spec, and two lifecycle hooks:

```ts
interface MockSystemPlugin {
  name: string;                 // stable key, matches the registry + config block (e.g. 'dhis2')
  specFile?: string;            // filename in specs/ (omit for spec-less catch-alls like http-generic)
  overrides?(app, store, config): void | Promise<void>;  // register custom / non-CRUD routes
  seed(store, config): void;    // populate the store at boot and on /_admin/reset|seed
}
```

**`config` (`SystemConfig`)** is the system's block from `mock.config.yaml`,
after env overrides and cascaded defaults are applied. It always carries:

- `port` — the shared listen port (for building self-referential URLs);
- the framework keys from [Configuration terms](#configuration-terms)
  (`enabled`, `latency`, `error_rate`, `error_status`, `seed`);
- every plugin-specific key from the block (typed as `[key: string]: any`),
  e.g. `config.version` for dhis2 or `config.domain` for commcare.

**Registration lifecycle.** When a system is mounted, `registerSystem`
(`src/server.ts`) wires the following onto the (possibly path-prefixed) Fastify
instance, in order, *before* your plugin runs:

1. Body parsing — JSON, form-urlencoded, and raw-string for `text/xml` /
   `application/xml` / `text/plain`.
2. Accept-all auth — sets `request.mockAuth` (parsed for logging; never rejects).
3. Stochastic behavior — the `latency` / `error_rate` hooks from
   [Simulating stochastic behavior](#simulating-stochastic-behavior)
   (no-op unless configured).
4. Request logging — every response is recorded into a 100-entry ring buffer for
   `/_admin/requests`.
5. Admin routes — `/_admin/status|requests|store|reset|seed` relative to the
   instance (so `/<name>/_admin/*` when prefixed).

Then it calls `plugin.overrides?.(app, store, config)` and finally
`plugin.seed(store, config)`. Because every system is registered as an
encapsulated Fastify plugin under its own prefix, routes and hooks are scoped to
that instance and never collide with other systems on the shared port. Inside
`overrides` a route path is relative to the mount, so registering `/api/things`
on the `mysystem` plugin serves it at `/mysystem/api/things`, and
`request.mockAuth` is already available in every handler.

Register the finished plugin in `src/systems/index.ts` under its `name` (the
registry key is the mount path) and add a matching block to `mock.config.yaml`.

### Notable per-system shapes

Some systems are custom-shaped on purpose to match reality:

- DHIS2 list responses use `{ pager, "<resourceType>": [...] }`; writes return an ImportSummary envelope.
- CommCare uses the Tastypie `{ meta, objects }` envelope on domain-scoped paths and an OpenRosa XML receiver.
- OpenMRS mirrors each seed patient as both a REST record and a FHIR R4 resource sharing the same UUID.
- FHIR returns searchset Bundles and OperationOutcome errors, with transaction/batch support on `POST /fhir`.
- Kobotoolbox and Primero use DRF-style `{ count, next, previous, results }` and Primero's `{ data, metadata }` envelopes respectively; Primero nests business fields under `data`.
- Twilio uses PascalCase form input, snake_case JSON output, and auto-advances message status queued -> sent -> delivered on each read.
- Airtable nests fields under `fields`, enforces the 10-record batch limit, and returns HTTP 422 on overflow.

## Contributing

- Stack: Node.js 20+, TypeScript (ESM, `NodeNext`), Fastify, Vitest, built with `tsc` to `dist/`. Package manager is pnpm.
- IDs use Node's built-in `crypto.randomUUID()` (or a system-specific format where the real API differs).
- Before opening a PR: `pnpm build` must exit clean and `pnpm test` must pass. Add tests for any new endpoint or system.
- Keep plugins thin and specs faithful. Match real field names, envelopes, and status codes. Prefer building a focused subset spec over vendoring a multi-megabyte one.
- Please do not commit secrets or real PII; seed data should be synthetic.
