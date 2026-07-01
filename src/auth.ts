import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Parsed auth info. This mock NEVER rejects a request; auth is parsed purely
 * for logging / inspection via `request.mockAuth`.
 */
export interface AuthInfo {
  type: 'basic' | 'bearer' | 'apikey' | 'token' | 'none';
  username?: string;
  token?: string;
  key?: string;
  raw?: string;
}

function headerValue(headers: Record<string, any>, name: string): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? String(v[0]) : String(v);
}

/**
 * Best-effort parse of the incoming auth headers. Never throws.
 *  - `Authorization: Basic <base64 user:pass>` -> { type:'basic', username }
 *  - `Authorization: Bearer <t>`               -> { type:'bearer', token }
 *  - `Authorization: Token <t>`                -> { type:'token', token }
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
        const idx = decoded.indexOf(':');
        username = idx >= 0 ? decoded.slice(0, idx) : decoded;
      } catch {
        username = undefined;
      }
      return { type: 'basic', username, raw: authorization };
    }
    if (scheme === 'bearer') return { type: 'bearer', token: value, raw: authorization };
    if (scheme === 'token') return { type: 'token', token: value, raw: authorization };
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

/**
 * Fastify "plugin" (plain async function) that attaches `request.mockAuth` on
 * every request and never rejects. Apply it DIRECTLY to the root instance
 * (`await authPlugin(app)`) rather than via `app.register(...)`, so the hook is
 * not encapsulated and applies to all routes. createSystemServer does this for
 * you — per-system plugins do not need to call it.
 */
export const authPlugin = async (app: FastifyInstance): Promise<void> => {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    request.mockAuth = parseAuth(request.headers as Record<string, any>);
  });
};

declare module 'fastify' {
  interface FastifyRequest {
    mockAuth: AuthInfo;
  }
}
