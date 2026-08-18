import { createLogger } from './logger';
import { getFirestoreAdmin, isFirebaseAdminConfigured } from './firebaseAdmin';

/**
 * Server-side custody of Strava OAuth tokens.
 *
 * These used to live in `localStorage` under `fri_strava_token`, which meant any
 * XSS on the origin could read them — and a Strava **refresh** token does not
 * expire. One injected script was therefore permanent access to a user's
 * training history, survivable across password changes and invisible to them.
 * The access token alone would have been a six-hour problem; the refresh token
 * made it forever.
 *
 * So the browser no longer holds either. It authenticates to us with its Firebase
 * ID token, and we hold the Strava credentials.
 *
 * WHERE THEY LIVE, and why not on the user document: `firestore.rules` grants
 * `allow read, write: if isOwner(userId)` on `users/{userId}`, so anything stored
 * there is readable by that user's browser — which would defeat the entire point.
 * They live in `strava_tokens/{uid}`, which denies all client access and is
 * reachable only through the Admin SDK.
 */

const COLLECTION = 'strava_tokens';

/** Refresh this early rather than discovering expiry mid-request. */
const EXPIRY_SKEW_SECONDS = 120;

const STRAVA_TIMEOUT_MS = 10_000;

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  /** Epoch seconds, as Strava reports it. */
  expires_at: number;
  athlete_id: number | null;
  athlete_name: string | null;
  updated_at: string;
}

/** What the browser is allowed to know: that it worked, and whose account it is. */
export interface StravaConnection {
  connected: boolean;
  athleteId: number | null;
  athleteName: string | null;
  connectedAt: string | null;
}

const DISCONNECTED: StravaConnection = {
  connected: false,
  athleteId: null,
  athleteName: null,
  connectedAt: null,
};

/** Strava's token response, of which we keep only the fields above. */
export interface StravaTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  athlete?: { id?: number; firstname?: string; lastname?: string } | null;
}

function docRef(uid: string) {
  return getFirestoreAdmin().collection(COLLECTION).doc(uid);
}

function athleteNameOf(athlete: StravaTokenResponse['athlete']): string | null {
  const name = [athlete?.firstname, athlete?.lastname].filter(Boolean).join(' ').trim();
  return name || null;
}

/**
 * Persists a token response. Returns what the browser may see.
 *
 * Rejects a response missing either token rather than storing half a connection
 * that fails later with no explanation.
 */
export async function storeStravaTokens(
  uid: string,
  response: StravaTokenResponse
): Promise<StravaConnection | null> {
  if (!response.access_token || !response.refresh_token || !response.expires_at) return null;

  const now = new Date().toISOString();
  const tokens: StoredTokens = {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    expires_at: response.expires_at,
    athlete_id: response.athlete?.id ?? null,
    athlete_name: athleteNameOf(response.athlete),
    updated_at: now,
  };

  // `connected_at` is set once, so reconnecting does not reset the history the
  // admin console reports.
  await docRef(uid).set({ ...tokens, connected_at: now }, { merge: true });

  return {
    connected: true,
    athleteId: tokens.athlete_id,
    athleteName: tokens.athlete_name,
    connectedAt: now,
  };
}

/** Whether this user has a Strava connection, without revealing the tokens. */
export async function getStravaConnection(uid: string): Promise<StravaConnection> {
  if (!isFirebaseAdminConfigured()) return DISCONNECTED;

  const snapshot = await docRef(uid).get();
  if (!snapshot.exists) return DISCONNECTED;

  const data = snapshot.data() as (StoredTokens & { connected_at?: string }) | undefined;
  if (!data?.refresh_token) return DISCONNECTED;

  return {
    connected: true,
    athleteId: data.athlete_id ?? null,
    athleteName: data.athlete_name ?? null,
    connectedAt: data.connected_at ?? data.updated_at ?? null,
  };
}

/** Forgets the connection. Erasure and an explicit disconnect both land here. */
export async function deleteStravaTokens(uid: string): Promise<void> {
  if (!isFirebaseAdminConfigured()) return;
  await docRef(uid).delete();
}

function isExpired(expiresAt: number): boolean {
  return expiresAt - EXPIRY_SKEW_SECONDS <= Math.floor(Date.now() / 1000);
}

/**
 * Trades a refresh token for a fresh access token.
 *
 * Split out to keep {@link getValidStravaAccessToken} readable: this half is all
 * network and error handling, that half is the decision about whether to call it.
 *
 * Returns `'revoked'` distinctly from `null`. Strava answers 400/401 when the
 * user has withdrawn the grant or the token was rotated elsewhere, and that
 * stored credential is dead — worth deleting rather than retrying on every
 * request for ever. A network failure is temporary and must not delete anything.
 */
async function refreshAccessToken(
  refreshToken: string,
  log: ReturnType<typeof createLogger>
): Promise<StravaTokenResponse | 'revoked' | null> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    log.error('strava_refresh_unconfigured');
    return null;
  }

  let response: Response;
  try {
    response = await fetch('https://www.strava.com/oauth/token', {
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
    log.error('strava_refresh_unreachable', err);
    return null;
  }

  if (!response.ok) {
    log.warn('strava_refresh_rejected', { status: response.status });
    return response.status === 400 || response.status === 401 ? 'revoked' : null;
  }

  const refreshed = (await response.json()) as StravaTokenResponse;
  return refreshed.access_token && refreshed.expires_at ? refreshed : null;
}

/**
 * A usable access token for this user, refreshing if the stored one has expired.
 *
 * Returns null when there is no connection or the refresh was refused — the
 * caller answers 409 so the UI can offer to reconnect, rather than reporting a
 * generic failure the user cannot act on.
 *
 * Strava **rotates** the refresh token on every refresh, so the new one must be
 * persisted. Keeping the old one is how a connection works once and then dies.
 */
export async function getValidStravaAccessToken(
  uid: string,
  request?: Request
): Promise<string | null> {
  if (!isFirebaseAdminConfigured()) return null;

  const log = createLogger('lib/stravaTokens', request);
  const snapshot = await docRef(uid).get();
  if (!snapshot.exists) return null;

  const stored = snapshot.data() as StoredTokens | undefined;
  if (!stored?.refresh_token) return null;

  if (stored.access_token && !isExpired(stored.expires_at)) return stored.access_token;

  const refreshed = await refreshAccessToken(stored.refresh_token, log);

  if (refreshed === 'revoked') {
    await deleteStravaTokens(uid);
    return null;
  }
  if (!refreshed) return null;

  await docRef(uid).set(
    {
      access_token: refreshed.access_token,
      // Strava rotates this; fall back only if it omitted one.
      refresh_token: refreshed.refresh_token ?? stored.refresh_token,
      expires_at: refreshed.expires_at,
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );

  log.info('strava_token_refreshed');
  return refreshed.access_token ?? null;
}
