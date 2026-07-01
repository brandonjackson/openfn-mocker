# openfn-mocker

A configurable mock API server that impersonates the external systems OpenFn integrates with (DHIS2, CommCare, OpenMRS, FHIR, generic HTTP, Kobotoolbox, Primero, Mailgun, Twilio, Airtable) so you can develop and test OpenFn workflows end-to-end without touching a production instance. Every OpenFn adaptor reads a base URL from its credential and fires requests at it; openfn-mocker runs a realistic mock of each system on its own port, stores writes in memory so a create is readable in a later step, ships seed data so queries work on first boot, and exposes an admin API for inspecting traffic and state. Point your credential's URL field at `http://localhost:<port>` and your workflow runs against a fake-but-faithful API.

## Quick start

### Docker

```bash
docker build -t openfn-mocker .
docker run --rm -p 4000-4020:4000-4020 openfn-mocker
```

### docker-compose

```bash
docker compose up
```

The bundled `docker-compose.yml` publishes ports `4000-4020` and shows how to set the `MOCKER_SYSTEMS` and `MOCKER_<SYS>_PORT` environment overrides.

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

On boot you will see each enabled system's server come up:

```
  openfn-mocker running
  ──────────────────────────────────
  admin              http://localhost:4000
  dhis2              http://localhost:4010
  commcare           http://localhost:4011
  ...
  ──────────────────────────────────
```

## Configuration

Configuration is read from `mock.config.yaml` (override the path with the `MOCKER_CONFIG` environment variable). Each system has its own block under `systems:`.

```yaml
log_level: info
admin_port: 4000

systems:
  dhis2:
    enabled: true
    port: 4010
    version: "2.39"

  commcare:
    enabled: true
    port: 4011
    domain: test-project
    app_id: abc123

  fhir:
    enabled: true
    port: 4013
    apiPath: fhir

  # Salesforce is a disabled placeholder (no plugin in v1).
  salesforce:
    enabled: false
    port: 4015
```

A system is enabled unless it sets `enabled: false`. Any extra keys in a system block (for example `domain`, `apiPath`, `account_sid`, `base_id`, `version`) are passed straight through to that system's plugin.

### Environment overrides

Environment variables take precedence over the YAML file, which makes container deployment easy:

| Variable | Effect |
|----------|--------|
| `MOCKER_CONFIG` | Path to the config file (default `mock.config.yaml`). |
| `MOCKER_LOG_LEVEL` | Override `log_level`. |
| `MOCKER_ADMIN_PORT` | Override the root admin port. |
| `MOCKER_SYSTEMS` | Comma-separated allowlist. Only the named systems are enabled, everything else is disabled. e.g. `MOCKER_SYSTEMS=dhis2,mailgun,http-generic`. |
| `MOCKER_<SYS>_PORT` | Override one system's port. `SYS` is the system name uppercased with dashes turned into underscores, so http-generic becomes `MOCKER_HTTP_GENERIC_PORT`. |
| `PORT` | PaaS single-port convention (Railway etc.): if exactly one system is enabled, it listens on `$PORT`. |

## Supported systems

| System | Port | Credential URL field | Auth | Status |
|--------|------|-----------------------|------|--------|
| dhis2 | 4010 | `hostUrl` | Basic | stable |
| commcare | 4011 | `hostURL` | Basic or apiKey header | stable |
| openmrs | 4012 | `instanceUrl` | Basic | stable |
| fhir | 4013 | `baseUrl` | none / Bearer | stable |
| http-generic | 4014 | `baseUrl` | any | stable |
| salesforce | 4015 | — | — | planned |
| kobotoolbox | 4016 | `baseURL` | Token | stable |
| primero | 4017 | `baseUrl` | Token via `POST /api/v2/tokens` | stable |
| mailgun | 4018 | `baseUrl` | Basic (`api:key`) | stable |
| twilio | 4019 | `baseUrl` | Basic (`sid:token`) | stable |
| airtable | 4020 | `baseUrl` | Bearer | stable |

The root admin server runs on port 4000.

### Auth is accept-all

In v1 the server never rejects a request for auth reasons. It parses the `Authorization` header for logging only (recording `{ type, username | token | key }`) and always proceeds. Primero has a real token-exchange endpoint (`POST /api/v2/tokens` returns `{ "token": "mock_primero_token" }`), but subsequent calls are still accept-all. Data is stored in memory and resets on restart (or via the admin reset endpoints).

## Using with OpenFn

Create (or edit) the credential for each adaptor and point its URL field at the mock. Any username/password/token works. The fixtures below match the seed data and defaults shipped in `mock.config.yaml`.

```json
// DHIS2
{ "hostUrl": "http://localhost:4010", "username": "admin", "password": "mock" }

// CommCare
{ "hostURL": "http://localhost:4011", "domain": "test-project", "appId": "abc123", "username": "user@test.com", "password": "mock" }

// OpenMRS
{ "instanceUrl": "http://localhost:4012", "username": "admin", "password": "mock" }

// FHIR
{ "baseUrl": "http://localhost:4013", "apiPath": "fhir" }

// Generic HTTP
{ "baseUrl": "http://localhost:4014" }

// Kobotoolbox
{ "baseURL": "http://localhost:4016", "apiToken": "mock-kobo-token" }

// Primero
{ "baseUrl": "http://localhost:4017", "username": "primero", "password": "mock" }

// Mailgun
{ "baseUrl": "http://localhost:4018", "domain": "sandbox-test.mailgun.org", "apiKey": "mock-api-key" }

// Twilio
{ "baseUrl": "http://localhost:4019", "accountSid": "ACtest123456", "authToken": "mock-auth-token" }

// Airtable
{ "baseUrl": "http://localhost:4020", "apiKey": "mock-airtable-token", "baseId": "appABC123" }
```

Each system implements the API slice OpenFn adaptors actually call (list, get, create, update, upsert, destroy) with the real envelope shapes, status codes, and ID formats, so responses are structurally indistinguishable from the live system.

## Admin API

Every system server mounts an admin API under `/_admin`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/_admin/status` | `{ system, port, uptime, recordCounts }`. |
| GET | `/_admin/requests` | Last 100 requests (method, path, status, auth, body summary, timestamp). |
| GET | `/_admin/store` | Full in-memory store dump. |
| POST | `/_admin/reset` | Clear the store and re-seed. |
| POST | `/_admin/seed` | Re-seed without clearing. |

The root admin server (port 4000) aggregates across systems:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/_admin/systems` | `[{ name, port, status }]` for every configured system. |
| POST | `/_admin/reset-all` | Reset every enabled system's store. |

Examples:

```bash
curl http://localhost:4000/_admin/systems
curl http://localhost:4010/_admin/status
curl http://localhost:4010/_admin/requests
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
     defaultPort: 4021,
     specFile: 'mysystem.openapi.json', // optional
     seed,                               // populates the store at boot / reset
     overrides(app, store, config) {
       // Register custom / non-CRUD routes on `app` here.
       // Auth parsing, admin routes and request logging are already attached,
       // so request.mockAuth is available in every handler.
       // Call the engine helpers (route-registrar, response-generator,
       // spec-parser) for CRUD wiring and envelope generation.
     },
   };

   export default plugin;
   ```

3. Add `src/systems/<name>/seed.ts` exporting a `seed(store, config)` function that writes a small set of realistic records (fewer than 50 per collection).
4. Register the plugin in `src/systems/index.ts` and add a block to `mock.config.yaml`.
5. Add `test/<name>.test.ts` exercising the endpoints, and run `pnpm test`.

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
</content>
