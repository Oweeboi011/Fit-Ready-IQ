import { NextRequest, NextResponse } from 'next/server';

import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { STRAVA_ACTIVITIES_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

/**
 * GET /api/strava/activities?page=1
 * Header: `X-Strava-Token: <access_token>`
 *
 * Fetches the calling athlete's activities from the Strava API. The token is the
 * caller's own credential rather than server config, so it travels per-request —
 * but in a header, not the query string. As a query param it was written verbatim
 * into Vercel's access logs, the browser's history and any Referer we emit, which
 * is a live OAuth token sitting in three places that outlive the request.
 */
export async function GET(request: NextRequest) {
  // An open proxy to a third-party API is worth metering even though the caller
  // supplies their own credential: unmetered, it lets anyone route unlimited
  // traffic through our origin at our egress cost, and Strava attributes the
  // volume to our client id rather than to them.
  const limit = await rateLimit(request, STRAVA_ACTIVITIES_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const token = request.headers.get('x-strava-token');
  // Strava pages are numbered; anything else is a caller bug, and interpolating
  // it unescaped would let it smuggle extra query parameters upstream.
  const pageParam = Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.min(pageParam, 100) : 1;
  const perPage = '30';

  if (!token) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
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
