/**
 * Which tier of the mock answered a request:
 *  - 'modeled' — a hand-written route (full semantic fidelity, stateful)
 *  - 'spec'    — the spec-backed fallback (structurally faithful, schema-shaped)
 *  - 'generic' — a catch-all echo (liveness only, no fidelity claim)
 *  - 'none'    — nothing claimed the path (a 404)
 * Requests that land on 'spec'/'generic' in real usage are exactly the
 * endpoints worth promoting to hand-modeled routes next.
 */
export type Fidelity = 'modeled' | 'spec' | 'generic' | 'none';

/** A single recorded request/response for the /_admin/requests inspector. */
export interface LoggedRequest {
  /**
   * Process-wide monotonic sequence number; a higher id is strictly more recent.
   * Lets the aggregated (cross-system) log impose a total order and lets the
   * live sandbox view dedupe entries it has already rendered.
   */
  id: number;
  /** Name of the mounted system that served the request (e.g. 'dhis2'). */
  system: string;
  method: string;
  path: string;
  statusCode: number;
  /** Server-side response time in milliseconds. */
  durationMs: number;
  auth: any;
  /** Truncated summary of the request body. */
  bodySummary: string;
  /** Truncated summary of the response body. */
  responseSummary: string;
  /** Which tier of the mock answered (modeled / spec / generic / none). */
  fidelity: Fidelity;
  timestamp: string;
}

/**
 * Process-wide monotonic counter shared by every RequestLog instance, so the
 * aggregated root `/_admin/requests` view can merge per-system buffers into one
 * strictly-ordered timeline (ids never collide the way millisecond timestamps
 * can). Assigned by `record`, so callers never supply an id.
 */
let globalSeq = 0;

/**
 * Fixed-size ring buffer of recent requests. `list()` returns entries in
 * chronological order (oldest first, most-recent LAST).
 */
export class RequestLog {
  private entries: LoggedRequest[] = [];
  private readonly max: number;

  constructor(max = 100) {
    this.max = max > 0 ? max : 100;
  }

  /** Record a response. The caller supplies everything but the sequence `id`. */
  record(entry: Omit<LoggedRequest, 'id'>): void {
    this.entries.push({ id: ++globalSeq, ...entry });
    if (this.entries.length > this.max) {
      this.entries.splice(0, this.entries.length - this.max);
    }
  }

  /** Oldest-first, most-recent-last. */
  list(): LoggedRequest[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

const VALID_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

/** Normalize a log level string to a valid pino level (defaults to 'info'). */
export function makeLogLevel(level?: string): string {
  return level && VALID_LEVELS.has(level) ? level : 'info';
}

/** Compact, truncated (<=200 char) summary of a request body for logging. */
export function summarizeBody(body: unknown, maxLen = 200): string {
  if (body === undefined || body === null) return '';
  let s: string;
  if (typeof body === 'string') {
    s = body;
  } else {
    try {
      s = JSON.stringify(body);
    } catch {
      s = String(body);
    }
  }
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

/**
 * Truncated summary of a response body for the request log. Handles the payload
 * shapes an `onSend` hook sees: an already-serialized string, a Buffer, or a
 * stream (which we can't read without consuming it). Kept larger than the
 * request-body cap because the response is usually what you inspect to
 * troubleshoot.
 */
export function summarizeResponse(payload: unknown, maxLen = 2000): string {
  if (payload === undefined || payload === null) return '';
  let s: string;
  if (typeof payload === 'string') {
    s = payload;
  } else if (Buffer.isBuffer(payload)) {
    s = payload.toString('utf8');
  } else if (typeof payload === 'object' && typeof (payload as { pipe?: unknown }).pipe === 'function') {
    return '[stream]';
  } else {
    try {
      s = JSON.stringify(payload);
    } catch {
      s = String(payload);
    }
  }
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}
