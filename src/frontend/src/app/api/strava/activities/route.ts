import { NextRequest, NextResponse } from 'next/server';

import { createLogger } from '@/lib/logger';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { requireUser } from '@/lib/serverAuth';
import { forgetRejectedStravaAccess, getValidStravaAccessToken } from '@/lib/stravaTokens';
import { STRAVA_ACTIVITIES_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

const STRAVA_TIMEOUT_MS = 10_000;

const NOT_CONNECTED = 'Strava is not connected. Connect it again to sync activities.';

/**
 * GET /api/strava/activities?page=1
 * Header: `Authorization: Bearer <firebaseIdToken>`
 *
 * The calling athlete's activities. The Strava token is fetched server-side from
 * `strava_tokens/{uid}` and refreshed if stale — it is never accepted from, or
 * returned to, the caller.
 *
 * It used to arrive in an `X-Strava-Token` header, which was already better than
 * the query string it replaced, but still meant the browser held a credential
 * that does not expire. Now the only thing the browser presents is its Firebase
 * ID token, which we can revoke.
 */
export async function GET(request: NextRequest) {
  const log = createLogger('/api/strava/activities', request);
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  // Still metered after the identity check: one signed-in account can otherwise
  // route unlimited traffic through our origin, and Strava attributes the volume
  // to our client id rather than to them.
  const limit = await rateLimit(request, STRAVA_ACTIVITIES_RATE_LIMIT, auth.user);
  if (!limit.ok) return tooManyRequests(limit);

  const uid = auth.user.uid;
  // Strava pages are numbered; anything else is a caller bug, and interpolating
  // it unescaped would let it smuggle extra query parameters upstream.
  const pageParam = Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.min(pageParam, 100) : 1;
  const perPage = '30';

  try {
    const token = await getValidStravaAccessToken(uid, request);
    if (!token) {
      // 409 rather than 401: the caller is authenticated, it is the *Strava* link
      // that is absent or revoked. The UI offers to reconnect on this.
      return NextResponse.json({ error: NOT_CONNECTED }, { status: 409 });
    }

    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(STRAVA_TIMEOUT_MS),
        next: { revalidate: 0 }, // always fresh
      }
    );

    // Strava's 401 used to be passed straight through, where the client reads a
    // 401 as "your Firebase session expired" — the wrong fix entirely. A refused
    // unexpired token means the athlete revoked us at Strava: forget it, and say
    // so in the shape the UI already knows how to offer a reconnect for.
    if (res.status === 401) {
      await forgetRejectedStravaAccess(uid, token);
      log.warn('strava_access_revoked');
      return NextResponse.json({ error: NOT_CONNECTED }, { status: 409 });
    }

    if (!res.ok) {
      log.warn('strava_activities_rejected', { status: res.status });
      // 502: Strava's status is not ours to pass through — a 404 or 429 from
      // them is not the caller's request being wrong.
      const status = res.status === 429 ? 503 : 502;
      return NextResponse.json({ error: 'Strava did not return activities.' }, { status });
    }

    return NextResponse.json(await res.json());
  } catch (err) {
    log.error('strava_activities_failed', err);
    return NextResponse.json({ error: 'Could not reach Strava. Try again.' }, { status: 502 });
  }
}
