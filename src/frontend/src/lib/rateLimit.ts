import { createHash, createHmac } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getFirestoreAdmin, isFirebaseAdminConfigured } from './firebaseAdmin';
import { createLogger } from './logger';

/**
 * Fixed-window rate limiting, backed by Firestore.
 *
 * Why not an in-memory counter: this runs on Vercel's serverless functions.
 * Each invocation may land on a different instance, instances are recycled
 * constantly, and a cold start begins with an empty map — so a per-process
 * counter would enforce a limit somewhere between "the real one" and "none at
 * all", depending on traffic shape. That is the same class of bug as the
 * backend's default `memory://` storage, and it is worse here because the
 * endpoints being protected are the ones that cost money per call.
 *
 * Firestore gives one shared counter with atomic increments. A fixed window is
 * used rather than a sliding log because it costs one document read/write per
 * request instead of one per request *in the window*, and the burst it permits
 * at a window boundary (up to 2× the limit) does not matter for spend control.
 */

/** One document per caller per window, under this collection. */
const COLLECTION = 'rate_limits';

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Distinguishes buckets for different endpoints. */
  name: string;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * A caller whose identity a route has already verified.
 *
 * Structural rather than importing `VerifiedUser`, so a test or a future gate
 * can hand one in without pulling the Admin SDK into this module's graph.
 */
export interface RateLimitCaller {
  uid: string;
}

/**
 * Hashes a bucket key, keyed by `RATE_LIMIT_SALT` when it is set.
 *
 * Keys become Firestore document ids and appear in logs, so neither a uid nor
 * an IP is stored raw. A plain SHA-256 of an IPv4 address is not much of a
 * disguise — the whole space is four billion guesses — so with a secret salt
 * the hash is an HMAC and the table cannot be rebuilt offline. Without one it
 * still hashes, and `userDataFootprint.ts` says which of the two is true.
 */
function hashKey(value: string): string {
  const salt = process.env.RATE_LIMIT_SALT;
  const digest = salt
    ? createHmac('sha256', salt).update(value).digest('hex')
    : createHash('sha256').update(value).digest('hex');
  return digest.slice(0, 32);
}

/**
 * Identifies the caller.
 *
 * The verified uid when the route has one, because it is far more precise than
 * an IP: keying only on IP puts everyone behind a corporate NAT or a mobile
 * carrier gateway into one bucket, so a single heavy user throttles an office.
 *
 * Only a *verified* uid. This used to hash whatever bearer string arrived,
 * before anything had checked it, so `Authorization: Bearer <random>` on each
 * request bought a fresh bucket every time and the limit on the paid endpoints
 * was decorative. Keying on the token rather than the uid had the same hole for
 * honest-looking callers too: `getIdToken(true)` mints a new token, and with it
 * a new budget. The Authorization header is now ignored here entirely; a route
 * that knows who is calling says so through `caller`.
 */
export function callerKey(request: Request, caller?: RateLimitCaller | null): string {
  if (caller?.uid) {
    return `u_${hashKey(caller.uid)}`;
  }

  // `x-forwarded-for` is a client-settable header everywhere except behind a
  // proxy that overwrites it. Vercel does overwrite it, and its left-most entry
  // is the real client. Off-Vercel this is spoofable, which is precisely why
  // an authenticated caller is keyed by uid instead.
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || 'unknown';
  return `ip_${hashKey(ip)}`;
}

/**
 * Consumes one unit of the caller's budget.
 *
 * Pass `caller` whenever the route has verified one — call `requireUser` or
 * `optionalUser` first. Without it the budget is per IP, which is the right
 * ceiling for an anonymous visitor and the only one that cannot be forged.
 *
 * Fails **open**: if Firestore is unreachable or unconfigured, the request is
 * allowed. A limiter that fails closed converts a degraded dependency into a
 * total outage, which is a worse failure than the overspend it prevents — but
 * it is logged, because silently not rate-limiting is how you discover the
 * limiter was broken on the invoice.
 */
export async function rateLimit(
  request: Request,
  rule: RateLimitRule,
  caller?: RateLimitCaller | null
): Promise<RateLimitResult> {
  const allowed: RateLimitResult = {
    ok: true,
    remaining: rule.limit,
    retryAfterSeconds: 0,
  };

  if (!isFirebaseAdminConfigured()) {
    warnOnce('rate_limiter_unconfigured', request);
    return allowed;
  }
  if (!process.env.RATE_LIMIT_SALT) warnOnce('rate_limit_salt_missing', request);

  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const windowEnd = windowStart + windowMs;
  // The window index is part of the id, so a new window is a new document and
  // there is no reset step that could race with an increment.
  const docId = `${rule.name}_${callerKey(request, caller)}_${windowStart}`;

  // Already refused in this window by this instance: answer without Firestore.
  if ((exhausted.get(docId) ?? 0) > Date.now()) return refusal(windowEnd);

  try {
    const db = getFirestoreAdmin();
    const ref = db.collection(COLLECTION).doc(docId);

    const count = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = (snapshot.exists ? (snapshot.data()?.count as number) : 0) ?? 0;
      const next = current + 1;
      // A spent budget is not written again. Counting refusals cost a write
      // per rejected request, so a flood being refused still ran up the bill
      // it was being refused to protect.
      if (current >= rule.limit) return next;
      tx.set(ref, {
        count: next,
        // Firestore TTL policies delete on a timestamp field. Configure one on
        // `expiresAt` for this collection, or these documents accumulate for
        // ever — one per caller per window is a lot of garbage over a year.
        expiresAt: new Date(windowStart + windowMs * 2),
      });
      return next;
    });

    if (count > rule.limit) {
      rememberExhausted(docId, windowEnd);
      return refusal(windowEnd);
    }

    return { ok: true, remaining: Math.max(0, rule.limit - count), retryAfterSeconds: 0 };
  } catch (err) {
    // Structured and redacted: a Firestore error can carry request metadata,
    // and this is the line that tells you the limiter was down when the bill
    // arrives — it needs to be findable, not just present.
    createLogger('lib/rateLimit', request).error('rate_limiter_unavailable', err, {
      rule: rule.name,
    });
    return allowed;
  }
}

function refusal(windowEnd: number): RateLimitResult {
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - Date.now()) / 1000));
  return { ok: false, remaining: 0, retryAfterSeconds };
}

/**
 * Buckets this instance has already refused, until their window ends.
 *
 * Per instance and best-effort — another instance still asks Firestore once —
 * but it turns a sustained flood from one read per request into none. Bounded
 * so a spray of distinct callers cannot grow it without limit.
 */
const exhausted = new Map<string, number>();
const MAX_EXHAUSTED = 5_000;

function rememberExhausted(docId: string, until: number): void {
  if (exhausted.size >= MAX_EXHAUSTED) {
    const now = Date.now();
    for (const [key, expiry] of exhausted) if (expiry <= now) exhausted.delete(key);
    if (exhausted.size >= MAX_EXHAUSTED) exhausted.clear();
  }
  exhausted.set(docId, until);
}

/**
 * Logs a configuration fault once per instance. Both are silent otherwise:
 * with Firebase unconfigured every request is allowed, and without a salt the
 * keys are a plain hash of an IP — reversible by enumerating the address space.
 */
const warned = new Set<string>();

function warnOnce(event: string, request: Request): void {
  if (warned.has(event)) return;
  warned.add(event);
  createLogger('lib/rateLimit', request).error(event);
}

/** Test hook: forget per-instance state between cases. */
export function resetRateLimitMemory(): void {
  exhausted.clear();
  warned.clear();
}

/** The 429 to return when {@link rateLimit} refuses. */
export function tooManyRequests(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please slow down and try again shortly.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'Cache-Control': 'no-store',
      },
    }
  );
}
