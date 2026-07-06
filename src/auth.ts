import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Parsed auth info attached to every request as `request.mockAuth`. Parsing is
 * best-effort and never throws; whether a missing credential is *rejected* is a
 * separate, per-system decision (see `AuthRequirement` / `enforceAuth`).
 */
export interface AuthInfo {
  type: 'basic' | 'bearer' | 'apikey' | 'token' | 'none';
  username?: string;
  token?: string;
  key?: string;
  raw?: string;
}

/** Credential schemes a system can advertise it accepts. */
export type AuthScheme = 'basic' | 'bearer' | 'token' | 'apikey';

/**
 * How a system treats auth. Declared on each plugin (see `MockSystemPlugin.auth`)
 * and enforced by `enforceAuth`. The mock never validates the *value* of a
 * credential (any username/password/token works) — it only decides whether a
 * credential must be *present*.
 *
 *  - `required: false` (or omitted): the system is open. Some real systems don't
 *    require auth (generic http) or make it optional (FHIR: none / Bearer), so
 *    those stay accept-all — don't assume every system needs credentials.
 *  - `required: true`: a request with no credentials gets 401 Unauthorized.
 *    `schemes` documents which credential styles the real system expects and
 *    drives the `WWW-Authenticate` header; `exemptPaths` lists system-relative
 *    paths that must stay open even when auth is required (e.g. a token-exchange
 *    endpoint you have to call *before* you have a token).
 */
export interface AuthRequirement {
  required?: boolean;
  schemes?: AuthScheme[];
  /** System-relative paths (matched by prefix) that skip enforcement. */
  exemptPaths?: string[];
}

/* -------------------------------------------------------------------------- */
/* Credential shape                                                           */
/*                                                                            */
/* `AuthRequirement` says whether the *mock* rejects anonymous requests.      */
/* `CredentialSpec` is the companion: it describes the OpenFn credential a    */
/* user pastes into OpenFn to reach this system — the field names (matching   */
/* the adaptor's configuration-schema.json), which fields are secrets, and    */
/* how to shape a generated suggestion for each. It is declared per-plugin    */
/* (see `MockSystemPlugin.credential`) so the plugin is the single source of  */
/* truth for its auth; the browser sandbox only *reads* it to visualise the   */
/* credential and generate ready-to-paste suggestions.                        */
/* -------------------------------------------------------------------------- */

/**
 * The kind of credential a system expects, used to label it in the UI and to
 * decide what to suggest. Derived from the adaptor's real credential fields:
 *  - `userpass`  username/email + password (Basic-style login)
 *  - `apikey`    an API key / token / auth-token secret (no user login)
 *  - `oauth`     OAuth client credentials (clientId + clientSecret)
 *  - `none`      no credential needed (open systems: FHIR, generic http)
 */
export type CredentialType = 'userpass' | 'apikey' | 'oauth' | 'none';

/** How a single credential field is treated by the sandbox. */
export type CredentialFieldRole =
  | 'url' // the mock origin + mount path; the adaptor targets this. Value is filled in by the sandbox.
  | 'host' // like `url`, but the bare host[:port] with no scheme or mount path — for
  // adaptors that build their own scheme and derive per-service hosts from it
  // (e.g. OpenCRVS's `https://<service>.<domain>`), where a mount path would
  // land inside the hostname. See README's "Local network aliasing" section for
  // what actually resolving those derived hosts against this mock requires.
  | 'static' // a fixed, non-secret config value (domain, appId, apiVersion, database, …).
  | 'username' // an identifier the user picks; suggested, not generated as a secret.
  | 'email' // like `username`, but email-shaped.
  | 'secret'; // a secret (password / api key / token / client secret) — generated as a suggestion.

/** How to shape a generated secret suggestion for a `secret` field. */
export interface CredentialSecretShape {
  /** Character set of the random body (default `alnum`). */
  charset?: 'hex' | 'alnum';
  /** Number of random characters in the body (default 16). */
  length?: number;
  /** Literal prefix prepended to the generated body (e.g. `key-` for Mailgun). */
  prefix?: string;
}

/** One field of an OpenFn credential. `name` matches the adaptor schema exactly. */
export interface CredentialFieldSpec {
  /** Exact field name as it appears in the OpenFn credential (case-sensitive). */
  name: string;
  role: CredentialFieldRole;
  /**
   * Literal value for `url`/`static`/`username`/`email` fields. May contain
   * `{{ORIGIN}}` (resolved in the browser) and `{{token}}` placeholders
   * (resolved from the system config, e.g. `{{domain}}`). A `url` field may omit
   * this — the sandbox fills it with the mock origin + mount path. Ignored for
   * `secret` fields, which are generated per `secret`.
   */
  value?: string;
  /** For `role: 'secret'` — how to shape the generated suggestion. */
  secret?: CredentialSecretShape;
}

/**
 * How the sandbox builds an `Authorization` header for the live example
 * requests it fires at this system. Present only for systems whose mock
 * enforces auth; the mock validates presence, not value, so the exact value
 * never matters — this just keeps the header shape realistic and consistent
 * with the displayed credential.
 */
export interface AuthHeaderSpec {
  scheme: 'basic' | 'bearer' | 'token';
  /** Basic: a fixed username literal (e.g. Mailgun's `api`). */
  user?: string;
  /** Basic: credential field to use as the username. */
  userField?: string;
  /** Basic: credential field to use as the password/secret. */
  passField?: string;
  /** Bearer/Token: a fixed token value (e.g. Primero's exchanged token). */
  value?: string;
}

/**
 * The OpenFn credential a system expects, declared on its plugin. Lets the
 * sandbox render the credential, classify it (username/password vs API key vs
 * OAuth), and generate ready-to-paste suggestions — all from one place.
 */
export interface CredentialSpec {
  type: CredentialType;
  /** Credential fields in display order (include the `url` field). */
  fields: CredentialFieldSpec[];
  /** How to authenticate the sandbox's live example requests (auth-required systems only). */
  authHeader?: AuthHeaderSpec;
}

function headerValue(headers: Record<string, any>, name: string): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? String(v[0]) : String(v);
}

/** Split a `user:secret` pair, tolerating a missing colon. */
function splitPair(value: string): { username?: string; secret?: string } {
  const idx = value.indexOf(':');
  if (idx < 0) return { username: value || undefined };
  return { username: value.slice(0, idx) || undefined, secret: value.slice(idx + 1) };
}

/**
 * Best-effort parse of the incoming auth headers. Never throws.
 *  - `Authorization: Basic <base64 user:pass>` -> { type:'basic', username }
 *  - `Authorization: Bearer <t>`               -> { type:'bearer', token }
 *  - `Authorization: Token <t>`                -> { type:'token', token }
 *  - `Authorization: ApiKey <user:key>`        -> { type:'apikey', username, key }
 *  - `apiKey` / `x-api-key` / `api_key` header -> { type:'apikey', key }
 *  - otherwise                                 -> { type:'none' }
 */
export function parseAuth(headers: Record<string, any>): AuthInfo {
  const authorization = headerValue(headers, 'authorization');
  if (authorization) {
    const spaceIdx = authorization.indexOf(' ');
    const scheme = (spaceIdx >= 0 ? authorization.slice(0, spaceIdx) : authorization).toLowerCase();
    const value = spaceIdx >= 0 ? authorization.slice(spaceIdx + 1).trim() : '';

    if (scheme === 'basic') {
      let username: string | undefined;
      try {
        const decoded = Buffer.from(value, 'base64').toString('utf8');
        username = splitPair(decoded).username;
      } catch {
        username = undefined;
      }
      return { type: 'basic', username, raw: authorization };
    }
    if (scheme === 'bearer') return { type: 'bearer', token: value, raw: authorization };
    if (scheme === 'token') return { type: 'token', token: value, raw: authorization };
    // CommCare's `Authorization: ApiKey <email>:<apikey>` style.
    if (scheme === 'apikey') {
      const { username, secret } = splitPair(value);
      return { type: 'apikey', username, key: secret ?? value, raw: authorization };
    }
    return { type: 'none', raw: authorization };
  }

  const apiKey =
    headerValue(headers, 'apikey') ??
    headerValue(headers, 'x-api-key') ??
    headerValue(headers, 'api_key') ??
    headerValue(headers, 'api-key');
  if (apiKey) return { type: 'apikey', key: apiKey, raw: apiKey };

  return { type: 'none' };
}

/** True when the request carried *some* credential (any scheme or api-key header). */
export function hasCredentials(auth: AuthInfo | undefined): boolean {
  if (!auth) return false;
  return auth.type !== 'none' || Boolean(auth.raw);
}

/**
 * Fastify "plugin" (plain async function) that attaches `request.mockAuth` on
 * every request and never rejects. Apply it DIRECTLY to the instance
 * (`await authPlugin(app)`) rather than via `app.register(...)`, so the hook
 * applies to all routes on that instance. registerSystem does this for you —
 * per-system plugins do not need to call it.
 */
export const authPlugin = async (app: FastifyInstance): Promise<void> => {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    request.mockAuth = parseAuth(request.headers as Record<string, any>);
  });
};

/** Path of a request without its query string. */
function pathname(url: string | undefined): string {
  const u = url ?? '/';
  const q = u.indexOf('?');
  return q === -1 ? u : u.slice(0, q);
}

/** Strip the system's mount prefix so paths can be matched system-relatively. */
function relativePath(path: string, mountPath: string): string {
  if (mountPath && path.startsWith(mountPath)) {
    const rest = path.slice(mountPath.length);
    return rest.startsWith('/') || rest === '' ? rest || '/' : path;
  }
  return path;
}

/** `WWW-Authenticate` value advertising the first accepted scheme. */
function wwwAuthenticate(schemes: AuthScheme[] | undefined, system: string): string {
  const scheme = schemes?.[0] ?? 'basic';
  const label = scheme === 'apikey' ? 'ApiKey' : scheme.charAt(0).toUpperCase() + scheme.slice(1);
  // Only Basic/Bearer carry a realm in practice; a realm is harmless on others.
  return `${label} realm="${system}"`;
}

/**
 * Install auth enforcement for a system. When `requirement.required` is true,
 * any request that arrives without credentials gets a 401 with a realistic
 * `WWW-Authenticate` header. The mocker's own admin routes (`/_admin/...`) and
 * any `exemptPaths` (e.g. a token-exchange endpoint) are always allowed through.
 *
 * Applied directly to the (possibly prefixed) system instance by registerSystem
 * AFTER authPlugin, so `request.mockAuth` is already populated when it runs.
 * When `requirement` is undefined or not required, this is a no-op — open
 * systems stay accept-all.
 */
export function enforceAuth(
  app: FastifyInstance,
  requirement: AuthRequirement | undefined,
  opts: { system: string; mountPath?: string }
): void {
  if (!requirement?.required) return;
  const mountPath = opts.mountPath ?? '';
  const exempt = requirement.exemptPaths ?? [];

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const rel = relativePath(pathname(request.url), mountPath);

    // The mocker's own admin API is never gated — it inspects/controls the mock,
    // it is not part of the impersonated system's surface.
    if (rel === '/_admin' || rel.startsWith('/_admin/')) return;
    // Endpoints you must reach before you can hold a credential (token exchange).
    if (exempt.some((p) => rel === p || rel.startsWith(p.endsWith('/') ? p : p + '/') || rel.startsWith(p))) {
      return;
    }

    if (hasCredentials(request.mockAuth)) return;

    reply.header('WWW-Authenticate', wwwAuthenticate(requirement.schemes, opts.system));
    reply.code(401);
    return reply.send({
      error: 'Unauthorized',
      message: `Missing credentials. The ${opts.system} mock requires authentication; send an Authorization header (any value works).`,
    });
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    mockAuth: AuthInfo;
  }
}
