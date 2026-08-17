/**
 * The browser's half of the Strava connection — which no longer includes any
 * credential.
 *
 * This module used to keep `{ access_token, refresh_token, expires_at }` in
 * `localStorage` under `fri_strava_token`. Any XSS on the origin could read it,
 * and a Strava **refresh** token does not expire, so a single injected script
 * meant permanent access to someone's training history: survivable across
 * password changes, invisible to the user, and revocable only from Strava's own
 * settings page. The access token alone would have been a six-hour problem.
 *
 * The tokens now live server-side in `strava_tokens/{uid}`, reachable only
 * through the Admin SDK. What is left here is the CSRF nonce for the OAuth round
 * trip, which is not a credential and genuinely belongs to the tab that started
 * the flow.
 */

/** Whether this account is linked, and to whom. Carries nothing secret. */
export interface StravaConnection {
  connected: boolean;
  athleteId: number | null;
  athleteName: string | null;
  connectedAt: string | null;
}

export const DISCONNECTED: StravaConnection = {
  connected: false,
  athleteId: null,
  athleteName: null,
  connectedAt: null,
};

/**
 * CSRF protection for the Strava OAuth round trip.
 *
 * Without a `state` parameter the callback accepts any `?code=` it is handed, so
 * an attacker could send a victim a link carrying *their* authorisation code and
 * silently bind the victim's Fit Ready IQ account to the attacker's Strava
 * account — from then on the victim's training data is the attacker's.
 *
 * The nonce lives in `sessionStorage`: it belongs to the one tab that started the
 * flow and should not outlive it.
 */
const STATE_KEY = 'fri_strava_oauth_state';

/** Mints and stores a one-shot nonce. Returns null if storage is unavailable. */
export function createStravaOAuthState(): string | null {
  try {
    const state = crypto.randomUUID();
    sessionStorage.setItem(STATE_KEY, state);
    return state;
  } catch {
    return null;
  }
}

/**
 * Checks the `state` Strava echoed back against the stored nonce and clears it,
 * so a replay of the same callback URL fails the second time.
 */
export function consumeStravaOAuthState(received: string | null): boolean {
  try {
    const expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    return Boolean(expected) && Boolean(received) && expected === received;
  } catch {
    return false;
  }
}

/**
 * The key tokens used to be stored under.
 *
 * Kept only so {@link clearLegacyStravaToken} can remove it. Deleting the
 * constant would leave the old value sitting in every existing user's browser
 * for ever — an expired access token is harmless, but the refresh token beside
 * it is not.
 */
const LEGACY_TOKEN_KEY = 'fri_strava_token';

/**
 * Deletes any token left in `localStorage` by an earlier version.
 *
 * Called on app start. Migration by deletion is safe here because the value is
 * no longer needed for anything: the server holds its own copy from the moment
 * the user next connects, and until then the app simply reports Strava as
 * disconnected — which is preferable to keeping a live refresh token around to
 * avoid one reconnection.
 */
export function clearLegacyStravaToken(): void {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* private mode, or storage disabled — nothing to clear */
  }
}
