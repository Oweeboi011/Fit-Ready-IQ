import { NextRequest, NextResponse } from 'next/server';

import { createLogger, upstreamSnippet } from '@/lib/logger';
import { requireUser } from '@/lib/serverAuth';
import { storeStravaTokens } from '@/lib/stravaTokens';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { STRAVA_EXCHANGE_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

/** Strava's token endpoint is normally sub-second; past this it is not coming. */
const STRAVA_TIMEOUT_MS = 10_000;

/**
 * POST /api/strava/exchange
 * Exchanges a Strava OAuth authorization code for an access token.
 * Keeps STRAVA_CLIENT_SECRET server-side only.
 *
 * Requires a signed-in user, and the tokens never leave the server.
 *
 * They used to be returned to the browser and kept in localStorage, where any
 * XSS on the origin could read them — and a Strava refresh token does not expire,
 * so that was permanent access to someone's training history. Now the exchange
 * result is stored under `strava_tokens/{uid}` (Admin SDK only) and the response
 * carries nothing secret: whether it worked, and which athlete it is.
 *
 * The consequence is deliberate: connecting Strava now needs an account. The
 * tokens have to belong to someone for us to hold them, and `/api/strava/sync`
 * already required a Firebase token to know whose activities it was writing.
 *
 * The rate limit stays the tightest in the table. Strava throttles the *client*
 * rather than the caller, so abuse here locks out every real user at once.
 */
export async function POST(request: NextRequest) {
  const log = createLogger('/api/strava/exchange', request);

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await rateLimit(request, STRAVA_EXCHANGE_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Strava credentials are not configured on the server' },
      { status: 500 }
    );
  }

  let code: string;
  try {
    const body = await request.json();
    code = body.code;
    if (!code || typeof code !== 'string') throw new Error();
  } catch {
    return NextResponse.json({ error: 'Missing or invalid authorization code' }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Without a deadline a slow Strava holds this function open until the
      // platform kills it, and the user watches a spinner the whole time.
      signal: AbortSignal.timeout(STRAVA_TIMEOUT_MS),
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });
  } catch (err) {
    // Was a bare `catch {}`: the caller got a 504 and we kept no record, so a
    // timeout, a DNS failure and a TLS error were indistinguishable after the
    // fact — including during an outage, when telling them apart is the job.
    log.error('strava_exchange_unreachable', err);
    return NextResponse.json({ error: 'Could not reach Strava' }, { status: 504 });
  }

  if (!res.ok) {
    // Logged, not returned. Strava's body on a failed exchange quotes the
    // request back — including the client_id — and the caller can do nothing
    // with it except learn about our configuration.
    //
    // Bounded and redacted rather than logged verbatim: this is an OAuth token
    // endpoint, and a log line outlives the credential it might quote.
    log.warn('strava_exchange_rejected', {
      status: res.status,
      upstream: upstreamSnippet(await res.text()),
    });
    return NextResponse.json({ error: 'Strava token exchange failed' }, { status: 400 });
  }

  const connection = await storeStravaTokens(auth.user.uid, await res.json());

  if (!connection) {
    // Strava answered 200 without the fields we need. Storing half a connection
    // would fail later with nothing to point at.
    log.error('strava_exchange_incomplete');
    return NextResponse.json(
      { error: 'Strava did not return a usable connection. Try connecting again.' },
      { status: 502 }
    );
  }

  log.info('strava_connected', { athlete_id: connection.athleteId });

  // Deliberately not the token payload. The browser gets what it needs to render
  // "connected as X" and nothing it could leak.
  return NextResponse.json(connection, { headers: { 'Cache-Control': 'no-store' } });
}
