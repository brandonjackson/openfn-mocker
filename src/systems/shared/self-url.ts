import type { FastifyRequest } from 'fastify';

/** First value of a header that may arrive as a string, a comma-joined list, or an array. */
function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const first = raw.split(',')[0].trim();
  return first || undefined;
}

/** True when this request reached us through a reverse proxy (Railway, Render, ...). */
export function isProxied(req: FastifyRequest): boolean {
  return firstHeaderValue(req.headers['x-forwarded-host']) != null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite every internal self-referential URL in `text` so it is reachable from
 * outside the box.
 *
 * Mocks build self-URLs rooted at `http://localhost:<port>` (the only origin
 * they know at seed/handler time) and, historically, sometimes omitted the
 * mount prefix (`/dhis2`, `/fhir`, ...). Behind a public proxy both are wrong:
 * the client gets an unreachable `localhost` URL, possibly without the prefix.
 * This swaps the internal origin for the request's public origin and inserts
 * the mount prefix when it is missing — without double-prefixing URLs that
 * already carry it (e.g. those built from `req.url`).
 *
 * Only the exact `internalOrigin` token is matched, so non-URL text is
 * untouched; it is safe to run over a whole JSON response body or a single
 * header value.
 */
export function rewriteToExternalOrigin(
  text: string,
  internalOrigin: string,
  externalOrigin: string,
  mountPath: string
): string {
  // Capture the path/query that follows the origin, up to a JSON/whitespace
  // boundary, so we can tell whether the mount prefix is already present.
  const re = new RegExp(`${escapeRegExp(internalOrigin)}([^"'\\s\\\\]*)`, 'g');
  return text.replace(re, (_match, rest: string) => {
    const alreadyPrefixed =
      !mountPath ||
      rest === mountPath ||
      rest.startsWith(`${mountPath}/`) ||
      rest.startsWith(`${mountPath}?`) ||
      rest.startsWith(`${mountPath}#`);
    return `${externalOrigin}${alreadyPrefixed ? '' : mountPath}${rest}`;
  });
}

/**
 * The external origin (`scheme://host[:port]`) a request arrived on, as the
 * client sees it.
 *
 * Mocks are usually reached through a public URL (Railway, Render, Fly, ...)
 * while the process itself only listens on localhost, so self-referential URLs
 * — events paging links, FHIR `fullUrl`s, `Location` headers — must be derived
 * from the incoming request, not from the local listen port. Building them from
 * `localhost:<port>` hands the client back a URL it cannot reach.
 *
 * Preference order:
 *  1. `X-Forwarded-Proto` / `X-Forwarded-Host` — set by the proxy that
 *     terminated TLS and rewrote Host, so we echo the public `https://<domain>`.
 *  2. The request's own `Host` header — direct local runs (`localhost:4000`).
 *  3. `http://localhost:<fallbackPort>` — no Host header at all (rare).
 */
export function externalOrigin(req: FastifyRequest, fallbackPort: number): string {
  const forwardedHost = firstHeaderValue(req.headers['x-forwarded-host']);
  const host = forwardedHost ?? firstHeaderValue(req.headers.host);
  if (!host) return `http://localhost:${fallbackPort}`;
  const proto = firstHeaderValue(req.headers['x-forwarded-proto']) ?? req.protocol ?? 'http';
  return `${proto}://${host}`;
}

/**
 * A fully-qualified self URL for the current request: `externalOrigin` joined
 * with the request path (mount prefix included, since Fastify keeps the full
 * path on `req.url`), with the original query string dropped. Callers append
 * their own query params.
 */
export function selfUrlBase(req: FastifyRequest, fallbackPort: number): string {
  const path = (req.url ?? '/').split('?')[0];
  return `${externalOrigin(req, fallbackPort)}${path}`;
}
