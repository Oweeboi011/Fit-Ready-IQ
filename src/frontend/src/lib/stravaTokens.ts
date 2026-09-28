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
 * `allow read: if isOwner(userId)` on `users/{userId}`, so anything stored
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
  /** Epoch ms until which one request holds the right to refresh. */
  refresh_lease_until?: number;
}

/** Long enough to cover one refresh round trip, so a live holder never loses it. */
const REFRESH_LEASE_MS = STRAVA_TIMEOUT_MS + 5_000;

const LEASE_POLL_MS = 500;

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
  // admin console reports. It used to be written on every store, which is the
  // opposite; a transaction keeps the first value.
  const ref = docRef(uid);
  const connectedAt = await getFirestoreAdmin().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const first = (existing.data()?.connected_at as string | undefined) ?? now;
    tx.set(ref, { ...tokens, connected_at: first });
    return first;
  });

  return {
    connected: true,
    athleteId: tokens.athlete_id,
    athleteName: tokens.athlete_name,
    connectedAt,
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

/**
 * Deletes the stored tokens only if `field` still holds `expected`.
 *
 * Two requests can refresh at once with the same refresh token; Strava honours
 * one and may refuse the other. An unconditional delete on that refusal threw
 * away the connection the first request had just renewed. Compare-and-delete
 * means a credential is only forgotten if it is still the one that failed.
 *
 * Returns the tokens now stored when someone else replaced them, else null.
 */
async function forgetIfUnchanged(
  uid: string,
  field: 'refresh_token' | 'access_token',
  expected: string
): Promise<StoredTokens | null> {
  const ref = docRef(uid);
  return getFirestoreAdmin().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = snapshot.data() as StoredTokens | undefined;
    if (!current) return null;
    if (current[field] !== expected) return current;
    tx.delete(ref);
    return null;
  });
}

/**
 * Forgets a connection whose access token Strava has refused.
 *
 * A 401 from the Strava API on a token we believe is unexpired means the
 * athlete withdrew our access from their Strava settings. Keeping the tokens
 * would retry that refusal on every sync for ever, and tell the user they are
 * connected when they are not.
 */
export async function forgetRejectedStravaAccess(uid: string, accessToken: string): Promise<void> {
  if (!isFirebaseAdminConfigured()) return;
  await forgetIfUnchanged(uid, 'access_token', accessToken);
}

/**
 * Runs `write` only while the connection still exists, atomically with that check.
 *
 * Erasure and disconnect delete the tokens before anything else, so "tokens
 * present" means "still allowed to write this user's Strava data". Checking
 * and then writing separately leaves a window in which an erasure completes
 * between the two and the write recreates what it just removed; inside one
 * transaction a concurrent delete forces a retry that sees the doc gone.
 *
 * Returns false, having written nothing, when the connection is gone.
 */
export async function whileStravaConnected(
  uid: string,
  write: (tx: FirebaseFirestore.Transaction) => void
): Promise<boolean> {
  const ref = docRef(uid);
  return getFirestoreAdmin().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return false;
    write(tx);
    return true;
  });
}

/**
 * Withdraws our access at Strava itself, then forgets the tokens.
 *
 * Deleting our copy alone leaves the grant standing in the athlete's Strava
 * settings, listed as an app with access to their training history. Erasure is
 * supposed to mean we can no longer reach their data, not merely that we have
 * stopped holding the key. Best-effort at Strava — a network failure there
 * must not stop the erasure — but it is logged, because it is a promise.
 */
export async function revokeStravaGrant(uid: string, request?: Request): Promise<void> {
  if (!isFirebaseAdminConfigured()) return;
  const log = createLogger('lib/stravaTokens', request);

  const accessToken = await getValidStravaAccessToken(uid, request).catch(() => null);
  if (accessToken) {
    try {
      const res = await fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(STRAVA_TIMEOUT_MS),
      });
      if (!res.ok) log.warn('strava_deauthorize_rejected', { status: res.status });
    } catch (err) {
      log.warn('strava_deauthorize_unreachable', {
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }

  await deleteStravaTokens(uid);
}

/**
 * Whether a refused refresh means the refresh token itself is dead.
 *
 * Strava answers 400 for several unrelated faults. Only an error naming the
 * refresh token says the grant is gone; a bad `client_id` or `client_secret`
 * is also a 400 (or 401), and treating that as revocation meant one
 * misconfigured deploy silently disconnected every user whose token came up
 * for refresh.
 */
function isRefreshTokenRejection(body: unknown): boolean {
  const errors = (body as { errors?: { resource?: string; field?: string }[] } | null)?.errors;
  return (
    Array.isArray(errors) &&
    errors.some((e) => e?.field === 'refresh_token' || e?.resource === 'RefreshToken')
  );
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
 * Returns `'revoked'` distinctly from `null`. When Strava says the refresh
 * token itself is invalid, that stored credential is dead — worth deleting
 * rather than retrying on every request for ever. Anything else (network,
 * our own misconfiguration, Strava having a bad day) is temporary and must
 * not delete anything.
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
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // An error body that is not JSON cannot name the refresh token, so it is
      // not a revocation — which is the safe reading.
    }
    const revoked = response.status === 400 && isRefreshTokenRejection(body);
    // A rejection that is *not* about the refresh token is almost always ours —
    // an unset or wrong client id or secret — so it is an error, not a warning.
    if (revoked) log.warn('strava_refresh_rejected', { status: response.status });
    else log.error('strava_refresh_failed', undefined, { status: response.status });
    return revoked ? 'revoked' : null;
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

  const claim = await claimRefresh(uid, stored.refresh_token);
  if (claim.kind === 'gone') return null;
  if (claim.kind === 'current') return usable(claim.tokens);
  if (claim.kind === 'busy') return waitForRefresh(uid, stored.refresh_token);

  return refreshUnderLease(uid, stored, log);
}

/** The refresh itself, once this request holds the lease. */
async function refreshUnderLease(
  uid: string,
  stored: StoredTokens,
  log: ReturnType<typeof createLogger>
): Promise<string | null> {
  const refreshed = await refreshAccessToken(stored.refresh_token, log);

  if (refreshed === 'revoked') {
    const replaced = await forgetIfUnchanged(uid, 'refresh_token', stored.refresh_token);
    // Another request rotated the token while ours was in flight; theirs won.
    return replaced ? usable(replaced) : null;
  }

  const written = await settleRefresh(
    uid,
    stored.refresh_token,
    refreshed && {
      access_token: refreshed.access_token,
      // Strava rotates this; fall back only if it omitted one.
      refresh_token: refreshed.refresh_token ?? stored.refresh_token,
      expires_at: refreshed.expires_at,
      updated_at: new Date().toISOString(),
    }
  );
  if (!refreshed) return null;
  if (!written) {
    // Disconnected or erased while the refresh was in flight. Writing now would
    // resurrect a connection the user has just removed.
    log.info('strava_refresh_discarded');
    return null;
  }

  log.info('strava_token_refreshed');
  return refreshed.access_token ?? null;
}

function usable(tokens: StoredTokens): string | null {
  return tokens.access_token && !isExpired(tokens.expires_at) ? tokens.access_token : null;
}

type RefreshClaim =
  | { kind: 'acquired' }
  | { kind: 'busy' }
  | { kind: 'gone' }
  | { kind: 'current'; tokens: StoredTokens };

/**
 * Takes the right to refresh, so only one request spends the refresh token.
 *
 * Strava rotates the refresh token and may refuse the old one once it has been
 * used. Two requests refreshing at once therefore race: one wins, the other is
 * told the token is invalid — and if the loser forgets the connection before
 * the winner has saved, the user is disconnected for nothing. A lease stops
 * the second request calling Strava at all; it waits for the first instead.
 * The lease expires on its own, so a holder that dies does not wedge the link.
 */
async function claimRefresh(uid: string, expectedRefresh: string): Promise<RefreshClaim> {
  const ref = docRef(uid);
  return getFirestoreAdmin().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = snapshot.data() as StoredTokens | undefined;
    if (!snapshot.exists || !current) return { kind: 'gone' };
    if (current.refresh_token !== expectedRefresh) return { kind: 'current', tokens: current };
    if ((current.refresh_lease_until ?? 0) > Date.now()) return { kind: 'busy' };
    tx.set(ref, { refresh_lease_until: Date.now() + REFRESH_LEASE_MS }, { merge: true });
    return { kind: 'acquired' };
  });
}

/**
 * Saves a refresh and releases the lease — but only onto the connection it
 * refreshed. A deleted document stays deleted, and a token someone else has
 * since stored is not overwritten. Pass null to release without saving.
 *
 * Returns whether the tokens were written.
 */
async function settleRefresh(
  uid: string,
  expectedRefresh: string,
  tokens: Partial<StoredTokens> | null
): Promise<boolean> {
  const ref = docRef(uid);
  return getFirestoreAdmin().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = snapshot.data() as StoredTokens | undefined;
    if (!snapshot.exists || current?.refresh_token !== expectedRefresh) return false;
    tx.set(ref, { ...(tokens ?? {}), refresh_lease_until: 0 }, { merge: true });
    return tokens !== null;
  });
}

/** Waits out another request's refresh and uses its result. */
async function waitForRefresh(uid: string, expectedRefresh: string): Promise<string | null> {
  const deadline = Date.now() + REFRESH_LEASE_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LEASE_POLL_MS));
    const snapshot = await docRef(uid).get();
    const current = snapshot.data() as StoredTokens | undefined;
    if (!snapshot.exists || !current) return null;
    // Rotated, or the lease released: the holder is done either way, and the
    // stored token is either fresh or still expired (the holder failed).
    const released = (current.refresh_lease_until ?? 0) <= Date.now();
    if (current.refresh_token !== expectedRefresh || released) return usable(current);
  }
  return null;
}
