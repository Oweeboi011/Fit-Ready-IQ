import { NextRequest, NextResponse } from 'next/server';
import { createLogger, serializeError } from '@/lib/logger';
import { getFirestoreAdmin } from '@/lib/firebaseAdmin';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { STRAVA_SYNC_RATE_LIMIT } from '@/lib/rateLimitRules';
import { requireUser } from '@/lib/serverAuth';
import {
  forgetRejectedStravaAccess,
  getValidStravaAccessToken,
  whileStravaConnected,
} from '@/lib/stravaTokens';

export const runtime = 'nodejs';

/**
 * POST /api/strava/sync
 *
 * Fetches ALL historical activities from Strava (all pages) for the calling
 * user and upserts them into Firestore under:
 *   users/{uid}/strava_activities/{strava_activity_id}
 *
 * Headers: `Authorization: Bearer <firebaseIdToken>`
 * Body: none — the Strava token is held server-side under `strava_tokens/{uid}`
 *
 * The destination `uid` comes from the verified Firebase token, never from the
 * body. It used to be a body field, which — because the Admin SDK bypasses
 * Firestore rules — let any unauthenticated caller write activity documents
 * into any user's collection just by naming their uid.
 *
 * - Uses the Strava API server-side so the token never reaches the browser network layer.
 * - Idempotent: re-running will update existing docs, not create duplicates.
 * - Returns a summary: { synced, skipped, total }
 */

interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  distance: number;
  total_elevation_gain: number;
  moving_time: number;
  elapsed_time: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number;
  max_speed?: number;
  calories?: number;
  kudos_count?: number;
  achievement_count?: number;
  start_latlng?: [number, number];
  end_latlng?: [number, number];
  map?: {
    id: string;
    summary_polyline?: string;
    resource_state: number;
  };
  type: string;
  workout_type?: number | null;
  location_city?: string | null;
  location_country?: string | null;
  visibility?: string;
  gear_id?: string | null;
  flagged?: boolean;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
}

const MAX_PAGES = 10; // cap at 300 activities (10 × 30) per sync
const PER_PAGE = 30;
const COLLECTION = 'strava_activities';
const STRAVA_TIMEOUT_MS = 10_000;

const NOT_CONNECTED = 'Strava is not connected. Connect it again to sync activities.';

/**
 * What went wrong, as a code the client and the admin dashboard can show.
 *
 * These used to be sentences built from `err.message`, returned to the browser
 * and stored on the user document — an upstream or Firestore error string is
 * not something to hand a client, and the detail belongs in the log line.
 */
type SyncErrorCode = 'strava_rejected' | 'strava_unreachable' | 'write_failed';

function toFirestoreActivity(act: StravaActivity) {
  return {
    strava_id: act.id,
    name: act.name,
    sport_type: act.sport_type ?? act.type,
    start_date: act.start_date,
    distance_km: act.distance / 1000,
    elevation_gain_m: Math.round(act.total_elevation_gain),
    moving_time_s: act.moving_time,
    elapsed_time_s: act.elapsed_time,
    avg_heartrate: act.average_heartrate ?? null,
    max_heartrate: act.max_heartrate ?? null,
    avg_speed_ms: act.average_speed ?? null,
    max_speed_ms: act.max_speed ?? null,
    calories: act.calories ?? null,
    kudos_count: act.kudos_count ?? 0,
    achievement_count: act.achievement_count ?? 0,
    start_latlng: act.start_latlng ?? null,
    end_latlng: act.end_latlng ?? null,
    summary_polyline: act.map?.summary_polyline ?? null,
    location_city: act.location_city ?? null,
    location_country: act.location_country ?? null,
    visibility: act.visibility ?? 'everyone',
    trainer: act.trainer ?? false,
    commute: act.commute ?? false,
    manual: act.manual ?? false,
    gear_id: act.gear_id ?? null,
    synced_at: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const log = createLogger('/api/strava/sync', request);
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { uid } = auth.user;

  // Metered *after* the identity check so an unauthenticated flood cannot
  // consume a real user's budget, and keyed on their token rather than an IP.
  // One call fans out into ten Strava round trips and up to 300 Firestore
  // writes, which makes this the largest amplification factor in the product:
  // the client self-limits to once an hour, so six is retries and nothing more.
  const limit = await rateLimit(request, STRAVA_SYNC_RATE_LIMIT, auth.user);
  if (!limit.ok) return tooManyRequests(limit);

  // No token in the body any more: it lives server-side, keyed to the verified
  // uid. Accepting one would have meant trusting the caller with a credential
  // that outlives every other thing they hold.
  let token: string | null;
  try {
    token = await getValidStravaAccessToken(uid, request);
  } catch (err) {
    log.error('strava_sync_token_lookup_failed', err);
    return NextResponse.json({ error: 'strava_unavailable' }, { status: 503 });
  }
  if (!token) return NextResponse.json({ error: NOT_CONNECTED }, { status: 409 });

  let db: ReturnType<typeof getFirestoreAdmin>;
  try {
    db = getFirestoreAdmin();
  } catch (err) {
    log.error('strava_sync_firestore_unavailable', err);
    return NextResponse.json({ error: 'Firestore unavailable' }, { status: 500 });
  }
  const collectionRef = db.collection('users').doc(uid).collection(COLLECTION);

  let totalFetched = 0;
  let synced = 0;
  const errors: { page: number; code: SyncErrorCode; status?: number }[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    let activities: StravaActivity[];

    try {
      const res = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${PER_PAGE}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(STRAVA_TIMEOUT_MS),
          next: { revalidate: 0 },
        }
      );

      // A refused, unexpired token means the athlete revoked us at Strava. This
      // used to return 401 — which the client reads as its own session expiring
      // — and left the dead tokens stored to fail the same way next hour.
      if (res.status === 401) {
        await forgetRejectedStravaAccess(uid, token);
        log.warn('strava_access_revoked');
        return NextResponse.json({ error: NOT_CONNECTED }, { status: 409 });
      }

      if (!res.ok) {
        log.warn('strava_sync_page_rejected', { page, status: res.status });
        errors.push({ page, code: 'strava_rejected', status: res.status });
        break;
      }

      activities = (await res.json()) as StravaActivity[];
    } catch (err) {
      log.warn('strava_sync_page_unreachable', { page, error: serializeError(err) });
      errors.push({ page, code: 'strava_unreachable' });
      break;
    }

    if (!activities || activities.length === 0) break;

    totalFetched += activities.length;

    // Written only while the connection still exists, checked in the same
    // transaction. A disconnect or an account erasure deletes the tokens first;
    // a check followed by a separate write left a window in which the erasure
    // finished between the two and the write put activities back into the tree
    // it had just deleted. (≤30 writes per page, well under the 500 limit.)
    try {
      const stillConnected = await whileStravaConnected(uid, (tx) => {
        for (const act of activities) {
          // Idempotent upsert: re-running updates existing docs, never duplicates.
          tx.set(collectionRef.doc(String(act.id)), toFirestoreActivity(act), { merge: true });
        }
      });
      if (!stillConnected) {
        log.info('strava_sync_stopped_disconnected', { page });
        return NextResponse.json({ error: NOT_CONNECTED, synced }, { status: 409 });
      }
      // Counted after the commit. It used to be counted while queueing, so a
      // failed write still reported every activity in it as synced.
      synced += activities.length;
    } catch (err) {
      log.error('strava_sync_batch_failed', err, { page });
      errors.push({ page, code: 'write_failed' });
      // Continue — partial sync is better than nothing
    }

    // Strava paginates 30 per page; if we got fewer, we're done
    if (activities.length < PER_PAGE) break;
  }

  // The sync manifest the admin page reports. Not the caller's problem if it
  // fails — they have their activities — but no longer silent either: a
  // manifest that stops updating is how the dashboard starts lying.
  //
  // `total_activities` is what is stored, not what this run wrote: an
  // incremental run that found nothing new used to report zero. The write is
  // guarded like the pages are, because `set(..., {merge})` on the user doc
  // after an erasure would recreate it.
  try {
    const stored = (await collectionRef.count().get()).data().count;
    await whileStravaConnected(uid, (tx) => {
      tx.set(
        db.collection('users').doc(uid),
        {
          strava_sync: {
            last_synced_at: new Date().toISOString(),
            total_activities: stored,
            errors: errors.length > 0 ? errors.slice(0, 5) : null,
          },
        },
        { merge: true }
      );
    });
  } catch (err) {
    log.warn('strava_sync_manifest_failed', { error: serializeError(err) });
  }

  return NextResponse.json({
    ok: true,
    total_fetched: totalFetched,
    synced,
    errors: errors.length > 0 ? errors : undefined,
  });
}
