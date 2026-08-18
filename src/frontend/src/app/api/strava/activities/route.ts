import { NextRequest, NextResponse } from 'next/server';

import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { requireUser } from '@/lib/serverAuth';
import { getValidStravaAccessToken } from '@/lib/stravaTokens';
import { STRAVA_ACTIVITIES_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

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
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  // Still metered after the identity check: one signed-in account can otherwise
  // route unlimited traffic through our origin, and Strava attributes the volume
  // to our client id rather than to them.
  const limit = await rateLimit(request, STRAVA_ACTIVITIES_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const token = await getValidStravaAccessToken(auth.user.uid, request);
  // Strava pages are numbered; anything else is a caller bug, and interpolating
  // it unescaped would let it smuggle extra query parameters upstream.
  const pageParam = Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.min(pageParam, 100) : 1;
  const perPage = '30';

  if (!token) {
    // 409 rather than 401: the caller is authenticated, it is the *Strava* link
    // that is absent or revoked. The UI offers to reconnect on this.
    return NextResponse.json(
      { error: 'Strava is not connected. Connect it again to sync activities.' },
      { status: 409 }
    );
  }

  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 }, // always fresh
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch activities from Strava' },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
