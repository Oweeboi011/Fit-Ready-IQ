import { createHash } from 'node:crypto';

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
 * Identifies the caller.
 *
 * A bearer token when there is one, because it is far more precise than an IP:
 * keying only on IP puts everyone behind a corporate NAT or a mobile carrier
 * gateway into one bucket, so a single heavy user throttles a whole office.
 *
 * The token is hashed, never used raw. Bucket keys become Firestore document
 * ids and appear in logs; a live credential must not ride along. Hashing also
 * guarantees the key is a safe document id, with no "/" to change its path.
 */
export function callerKey(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, ...rest] = header.split(' ');
  const token = rest.join(' ').trim();

  if (scheme.toLowerCase() === 'bearer' && token) {
    return `u_${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
  }

  // `x-forwarded-for` is a client-settable header everywhere except behind a
  // proxy that overwrites it. Vercel does overwrite it, and its left-most entry
  // is the real client. Off-Vercel this is spoofable, which is precisely why
  // an authenticated caller is keyed by token instead.
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || 'unknown';
  return `ip_${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;
}

/**
 * Consumes one unit of the caller's budget.
 *
 * Fails **open**: if Firestore is unreachable or unconfigured, the request is
 * allowed. A limiter that fails closed converts a degraded dependency into a
 * total outage, which is a worse failure than the overspend it prevents — but
 * it is logged, because silently not rate-limiting is how you discover the
 * limiter was broken on the invoice.
 */
export async function rateLimit(request: Request, rule: RateLimitRule): Promise<RateLimitResult> {
  const allowed: RateLimitResult = {
    ok: true,
    remaining: rule.limit,
    retryAfterSeconds: 0,
  };

  if (!isFirebaseAdminConfigured()) return allowed;

  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  // The window index is part of the id, so a new window is a new document and
  // there is no reset step that could race with an increment.
  const docId = `${rule.name}_${callerKey(request)}_${windowStart}`;

  try {
    const db = getFirestoreAdmin();
    const ref = db.collection(COLLECTION).doc(docId);

    const count = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = (snapshot.exists ? (snapshot.data()?.count as number) : 0) ?? 0;
      const next = current + 1;
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
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowStart + windowMs - Date.now()) / 1000)
      );
      return { ok: false, remaining: 0, retryAfterSeconds };
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
