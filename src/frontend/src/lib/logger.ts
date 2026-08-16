import { randomUUID } from 'node:crypto';

/**
 * Structured server-side logging for the Next route handlers.
 *
 * Three things were wrong with `console.error('label:', err)`, which is what
 * all eighteen server-side call sites used to be:
 *
 *  1. **Unqueryable.** The backend already emits one JSON object per line via
 *     structlog. The frontend emitted free text, so the two halves of the same
 *     product could not be filtered, aggregated or alerted on the same way —
 *     and the frontend is the half that is actually deployed.
 *  2. **Uncorrelatable.** Nothing tied a line to a request. "Sync failed for me
 *     around 3pm" had no way to reach the log line that recorded it.
 *  3. **Unsafe.** `console.error('...', err)` serialises whatever the error
 *     carries. A fetch or firebase-admin error can hold request metadata
 *     including an `Authorization` header, and two of those call sites logged
 *     an *unbounded upstream response body from an OAuth token endpoint*.
 *     Logs outlive requests and are read by more people than the database is.
 *
 * Output is one JSON object per line on stdout/stderr, which is what Vercel's
 * log drain ingests and what the backend already produces.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Fields are values we are willing to serialise. Deliberately not `any`. */
export type LogValue = string | number | boolean | null | undefined | LogValue[] | LogFields;
export interface LogFields {
  [key: string]: LogValue;
}

/**
 * Field names whose values never belong in a log line, matched case- and
 * separator-insensitively so `access_token`, `accessToken` and `X-Strava-Token`
 * are all caught.
 *
 * Redaction is by key rather than by value pattern because a credential does
 * not reliably look like one — a Strava access token is a bare hex string,
 * indistinguishable from an id.
 */
const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|credential|authorization|auth|apikey|api_key|privatekey|private_key|client_secret|cookie|session)/i;

/** Long strings are truncated: a log line is a signal, not a payload store. */
const MAX_STRING = 512;

/** Deeply nested structures are almost always an error object we should not unwrap. */
const MAX_DEPTH = 4;

export const REDACTED = '[redacted]';

function truncate(value: string): string {
  return value.length <= MAX_STRING
    ? value
    : `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING} chars]`;
}

/**
 * Strips secrets and bounds size, recursively.
 *
 * Unknown input rather than `LogValue`, because the things most worth
 * sanitising are the ones that arrive untyped: caught errors and parsed
 * upstream JSON.
 */
/** Most values are scalars; handled separately so {@link sanitize} stays flat. */
function sanitizeScalar(value: unknown): { hit: true; value: LogValue } | { hit: false } {
  if (value === null || value === undefined) return { hit: true, value: null };
  if (typeof value === 'string') return { hit: true, value: truncate(value) };
  if (typeof value === 'number' || typeof value === 'boolean') return { hit: true, value };
  if (typeof value === 'bigint') return { hit: true, value: value.toString() };
  // A function or symbol in a log line is a mistake upstream, not data.
  if (typeof value === 'function' || typeof value === 'symbol') {
    return { hit: true, value: `[${typeof value}]` };
  }
  return { hit: false };
}

/** The redaction step proper: every key is checked before its value is walked. */
function sanitizeObject(value: object, depth: number): LogFields {
  const out: LogFields = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : sanitize(entry, depth + 1);
  }
  return out;
}

/** Maximum array entries kept — one long list must not become a long log. */
const MAX_ARRAY = 20;

export function sanitize(value: unknown, depth = 0): LogValue {
  const scalar = sanitizeScalar(value);
  if (scalar.hit) return scalar.value;

  // Past this point everything is a container, and a container can nest, cycle,
  // or carry a secret — so depth is checked before anything is walked.
  if (depth >= MAX_DEPTH) return '[depth limit]';
  if (value instanceof Error) return serializeError(value, depth);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((entry) => sanitize(entry, depth + 1));
  }
  return sanitizeObject(value as object, depth);
}

/**
 * An error as three known fields, never as the raw object.
 *
 * The stack is kept because it is the only thing that makes a 500 diagnosable,
 * but capped — and `cause` is followed, since `fetch` puts the real reason
 * there and dropping it turns every network failure into "fetch failed".
 */
export function serializeError(err: unknown, depth = 0): LogFields {
  if (!(err instanceof Error)) {
    return { name: 'NonError', message: truncate(String(err)) };
  }

  const out: LogFields = {
    name: err.name,
    message: truncate(err.message),
    stack: err.stack ? truncate(err.stack) : null,
  };

  if (err.cause !== undefined && depth < MAX_DEPTH) {
    out.cause = sanitize(err.cause, depth + 1);
  }

  return out;
}

/**
 * A stable id for one request, so a log line, a response and a user's report
 * can be joined up.
 *
 * Prefers Vercel's own `x-vercel-id`, which already appears in the platform's
 * request logs — reusing it means our line and the platform's line share a key
 * rather than each having their own.
 */
export function requestId(request?: Request): string {
  const fromPlatform = request?.headers.get('x-vercel-id') ?? request?.headers.get('x-request-id');
  if (fromPlatform) return fromPlatform.slice(0, 128);
  return randomUUID();
}

/** Minimum level to emit. Anything below is dropped before serialising. */
function activeLevel(): LogLevel {
  const configured = (process.env.LOG_LEVEL ?? '').toLowerCase();
  return configured in LEVEL_ORDER ? (configured as LogLevel) : 'info';
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  /** `error` takes the caught value directly — it is sanitised, never spread raw. */
  error(event: string, err?: unknown, fields?: LogFields): void;
  /** The request id these lines carry, for echoing back to the caller. */
  readonly requestId: string;
}

/**
 * A logger bound to one request.
 *
 * `route` is passed explicitly rather than derived from the URL: a route with a
 * dynamic segment would otherwise produce a different value per request and
 * stop being groupable, which is the whole point of having the field.
 */
export function createLogger(route: string, request?: Request, base: LogFields = {}): Logger {
  const id = requestId(request);
  const threshold = LEVEL_ORDER[activeLevel()];

  function emit(level: LogLevel, event: string, fields: LogFields): void {
    if (LEVEL_ORDER[level] < threshold) return;

    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      route,
      request_id: id,
      ...(sanitize({ ...base, ...fields }) as LogFields),
    });

    // stderr for warn/error so platforms that split streams classify correctly.
    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);
  }

  return {
    requestId: id,
    debug: (event, fields = {}) => emit('debug', event, fields),
    info: (event, fields = {}) => emit('info', event, fields),
    warn: (event, fields = {}) => emit('warn', event, fields),
    error: (event, err, fields = {}) =>
      emit('error', event, err === undefined ? fields : { ...fields, error: serializeError(err) }),
  };
}

/**
 * A bounded, redacted snippet of an upstream response body.
 *
 * `/api/strava/exchange` and `/api/strava/refresh` used to log `await
 * res.text()` verbatim — an unbounded body from an OAuth *token* endpoint, into
 * a log that is retained far longer than any token. The status and a short
 * snippet are what actually helps diagnose an upstream failure; the rest is
 * someone else's payload sitting in our logs.
 */
export function upstreamSnippet(body: string, limit = 200): string {
  const trimmed = body.trim().slice(0, limit);
  // Cheap belt-and-braces for the case the key-based redaction cannot see:
  // a token quoted inside an opaque body string.
  return trimmed.replace(/("?(?:access|refresh|id)_token"?\s*[:=]\s*"?)[\w.-]+/gi, `$1${REDACTED}`);
}
