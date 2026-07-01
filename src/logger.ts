/** A single recorded request for the /_admin/requests inspector. */
export interface LoggedRequest {
  method: string;
  path: string;
  statusCode: number;
  auth: any;
  bodySummary: string;
  timestamp: string;
}

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

  record(entry: LoggedRequest): void {
    this.entries.push(entry);
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
