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

### Environment overrides

Environment variables take precedence over the YAML file, which makes container deployment easy:

| Variable | Effect |
|----------|--------|
| `MOCKER_CONFIG` | Path to the config file (default `mock.config.yaml`). |
| `MOCKER_LOG_LEVEL` | Override `log_level`. |
| `MOCKER_PORT` | Override the single listen port. |
| `PORT` | PaaS single-port convention (Railway etc.). Used when `MOCKER_PORT` is unset. |
| `MOCKER_SYSTEMS` | Comma-separated allowlist. Only the named systems are enabled, everything else is disabled. e.g. `MOCKER_SYSTEMS=dhis2,mailgun,http-generic`. |

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
