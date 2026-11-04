import { createHash, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { sweepExpired } from '@/lib/expirySweep';
import { getFirestoreAdmin, isFirebaseAdminConfigured } from '@/lib/firebaseAdmin';
import { createLogger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * Daily expiry sweep, called by Vercel Cron (`crons` in vercel.json).
 *
 * Stands in for Firestore TTL policies, which need the Blaze plan; see
 * `lib/expirySweep.ts` and docs/guides/runbooks/expiry-sweep.md.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on every cron invocation
 * when that variable is set. Without it the route refuses everyone: an open
 * endpoint that deletes data is not one to leave reachable by default, even
 * when what it deletes has already expired.
 */

/** Stop starting new batches this long into the run; maxDuration is 60 s. */
const TIME_BUDGET_MS = 45_000;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time, and length-independent because both sides are hashed first. */
function authorised(request: Request, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  return timingSafeEqual(sha256(header), sha256(`Bearer ${secret}`));
}

export async function GET(request: Request) {
  const log = createLogger('/api/cron/expire', request);
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    log.error('expiry_sweep_unconfigured');
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 503 });
  }
  if (!authorised(request, secret)) {
    log.warn('expiry_sweep_unauthorised');
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  if (!isFirebaseAdminConfigured()) {
    log.error('expiry_sweep_no_firestore');
    return NextResponse.json({ error: 'Firestore is not configured' }, { status: 503 });
  }

  try {
    const result = await sweepExpired(getFirestoreAdmin(), {
      now: new Date(),
      deadline: Date.now() + TIME_BUDGET_MS,
    });

    const failedCount = Object.keys(result.failed).length;
    const fields = { deleted: result.deleted, failed: result.failed, complete: result.complete };
    if (failedCount > 0) log.error('expiry_sweep_partial', undefined, fields);
    else log.info('expiry_sweep_completed', fields);

    // 500 when a target failed, so the run shows red in Vercel's cron log
    // rather than passing quietly while a collection grows.
    return NextResponse.json(result, {
      status: failedCount > 0 ? 500 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    log.error('expiry_sweep_failed', err);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}
