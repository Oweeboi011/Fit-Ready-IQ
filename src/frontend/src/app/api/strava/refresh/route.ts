import { NextRequest, NextResponse } from 'next/server';

import { createLogger, upstreamSnippet } from '@/lib/logger';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { STRAVA_REFRESH_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

/** Strava's token endpoint is normally sub-second; past this it is not coming. */
const STRAVA_TIMEOUT_MS = 10_000;

/**
 * POST /api/strava/refresh
 * Exchanges a stored Strava refresh token for a new access token.
 * Keeps STRAVA_CLIENT_SECRET server-side only.
 *
 * The refresh token in the body is the caller's own credential, so this is not
 * an identity gate we can enforce — but it does mean an attacker holding a
 * stolen refresh token can mint access tokens through us indefinitely, and
 * unmetered it doubles as an oracle for testing harvested tokens in bulk. The
 * limit bounds both.
 */
export async function POST(request: NextRequest) {
  const log = createLogger('/api/strava/refresh', request);

  const limit = await rateLimit(request, STRAVA_REFRESH_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Strava credentials are not configured on the server' },
      { status: 500 }
    );
  }

  let refreshToken: string;
  try {
    const body = await request.json();
    refreshToken = body.refresh_token;
    if (!refreshToken || typeof refreshToken !== 'string') throw new Error();
  } catch {
    return NextResponse.json({ error: 'Missing or invalid refresh token' }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(STRAVA_TIMEOUT_MS),
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
  } catch (err) {
    // Was a bare `catch {}` — see the matching note in ../exchange/route.ts.
    log.error('strava_refresh_unreachable', err);
    return NextResponse.json({ error: 'Could not reach Strava' }, { status: 504 });
  }

  if (!res.ok) {
    // Logged, not returned — see the note in ../exchange/route.ts. Bounded and
    // redacted: this is a token endpoint and the body is not ours.
    log.warn('strava_refresh_rejected', {
      status: res.status,
      upstream: upstreamSnippet(await res.text()),
    });
    return NextResponse.json({ error: 'Strava token refresh failed' }, { status: 400 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
