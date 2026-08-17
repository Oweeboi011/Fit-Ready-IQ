import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/auditLog';
import { createLogger } from '@/lib/logger';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { STRAVA_CONNECTION_RATE_LIMIT } from '@/lib/rateLimitRules';
import { requireUser } from '@/lib/serverAuth';
import { deleteStravaTokens, getStravaConnection } from '@/lib/stravaTokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The Strava connection, without the credentials.
 *
 *   GET    — is this account connected, and to which athlete?
 *   DELETE — disconnect, forgetting the tokens.
 *
 * This exists because the browser no longer holds the tokens and therefore can no
 * longer answer "am I connected?" by looking in `localStorage`. It has to ask.
 *
 * The response deliberately carries no token, not even a truncated one: an
 * identifier is enough to render "connected as Jane", and anything more would
 * put back the credential-in-the-browser problem this change removed.
 */

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await rateLimit(request, STRAVA_CONNECTION_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const connection = await getStravaConnection(auth.user.uid);
  return NextResponse.json(connection, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Disconnect.
 *
 * Deletes our copy of the tokens. It does **not** revoke the grant at Strava —
 * only the user can do that, from their Strava settings — so the response says
 * so rather than implying a completeness we cannot deliver. Reconnecting will
 * succeed without a fresh consent prompt until they revoke it there.
 *
 * Synced activities are left alone: they are the user's training history, and
 * deleting them because a token was withdrawn would be destroying data to
 * express a preference about a credential. Account erasure removes them.
 */
export async function DELETE(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const limit = await rateLimit(request, STRAVA_CONNECTION_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const log = createLogger('/api/strava/connection', request);

  await deleteStravaTokens(auth.user.uid);
  log.info('strava_disconnected');

  await recordAudit(request, {
    action: 'strava.disconnect',
    actor: auth.user,
    target: auth.user.uid,
    outcome: 'success',
  });

  return NextResponse.json(
    {
      connected: false,
      athleteId: null,
      athleteName: null,
      connectedAt: null,
      note: 'Disconnected here. To revoke the permission entirely, remove Fit Ready IQ from your Strava settings.',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
