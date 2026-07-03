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
