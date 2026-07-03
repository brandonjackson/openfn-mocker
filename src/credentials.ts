import { randomBytes } from 'node:crypto';
import type { CredentialSecretShape, CredentialSpec } from './auth.js';
import type { SystemGuide } from './systems/types.js';

/**
 * Shared credential/interpolation helpers. A plugin's `CredentialSpec` is
 * consumed in three places — the browser sandbox (src/sandbox.ts), the
 * end-to-end usage runner (scripts/test-usage-examples.ts), and the README
 * generator (scripts/generate-readme.ts) — and they must all resolve
 * `{{token}}` placeholders, build the `{{token}}` var map, and shape generated
 * secrets identically. This module is the single implementation they share
 * (the sandbox's in-browser secret generator is the one deliberate exception:
 * it mirrors generateSecret in client JS so secrets are minted per page view).
 */

/**
 * Replace `{{key}}` tokens from `vars`; unknown tokens are left as-is. The
 * sandbox leaves `{{ORIGIN}}` unresolved for the browser by simply not putting
 * ORIGIN in its var map; callers that know the origin (the usage runner) pass
 * it as an ordinary var.
 */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

/**
 * Build the `{{token}}` var map for a system: the guide's declared defaults,
 * overridden by any string/number keys in the system's live config (so e.g.
 * `{{domain}}` resolves to the configured domain).
 */
export function systemVars(
  guide: SystemGuide | undefined,
  config: Record<string, unknown> | undefined
): Record<string, string> {
  const vars: Record<string, string> = { ...(guide?.vars ?? {}) };
  for (const [k, v] of Object.entries(config ?? {})) {
    if (typeof v === 'string' || typeof v === 'number') vars[k] = String(v);
  }
  return vars;
}

/** Generate a random secret suggestion matching a field's declared shape. */
export function generateSecret(shape: CredentialSecretShape | undefined): string {
  const length = shape?.length ?? 16;
  const prefix = shape?.prefix ?? '';
  const alphabet =
    shape?.charset === 'hex'
      ? '0123456789abcdef'
      : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let body = '';
  for (let i = 0; i < length; i++) body += alphabet[bytes[i] % alphabet.length];
  return prefix + body;
}

export interface ResolveCredentialValuesOptions {
  /** Value for the credential's `url` field (mock origin, plus mount when prefixed). */
  url: string;
  /** `{{token}}` vars for non-secret field values (see systemVars). */
  vars?: Record<string, string>;
  /** Secret supplier; defaults to generateSecret. The README generator passes a placeholder. */
  secret?: (shape: CredentialSecretShape | undefined) => string;
}

/**
 * Resolve a plugin's credential spec into a concrete `{ field: value }` object
 * — the shape a user pastes into OpenFn as `state.configuration`. Systems with
 * no credential get a bare `baseUrl`.
 */
export function resolveCredentialValues(
  spec: CredentialSpec | undefined,
  opts: ResolveCredentialValuesOptions
): Record<string, string> {
  const vars = opts.vars ?? {};
  const secret = opts.secret ?? generateSecret;
  if (!spec) return { baseUrl: opts.url };
  const out: Record<string, string> = {};
  for (const f of spec.fields) {
    if (f.role === 'url') out[f.name] = opts.url;
    else if (f.role === 'secret') out[f.name] = secret(f.secret);
    else out[f.name] = interpolate(f.value ?? '', vars);
  }
  return out;
}

/**
 * Human label for a credential spec, used in generated docs. `userpass`
 * distinguishes email-login systems (the identifier field is literally named
 * `email`, e.g. Go.Data, ODK Central) from username ones.
 */
export function credentialTypeLabel(spec: CredentialSpec | undefined): string {
  if (!spec || spec.type === 'none') return 'none';
  if (spec.type === 'apikey') return 'API key';
  if (spec.type === 'oauth') return 'OAuth client credentials';
  const emailLogin = spec.fields.some((f) => f.role === 'email' && f.name === 'email');
  return emailLogin ? 'email & password' : 'username & password';
}
