export interface StravaToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: unknown;
}

const STORAGE_KEY = 'fri_strava_token';

/**
 * CSRF protection for the Strava OAuth round trip.
 *
 * Without a `state` parameter the callback accepts any `?code=` it is handed, so
 * an attacker could send a victim a link carrying *their* authorisation code and
 * silently bind the victim's Fit Ready IQ session to the attacker's Strava
 * account — from then on the victim's training data is the attacker's, and every
 * activity the victim imports lands in an account they do not control.
 *
 * The nonce lives in `sessionStorage`: it belongs to the one tab that started
 * the flow and should not outlive it.
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

function readStoredToken(): StravaToken | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StravaToken;
  } catch {
    return null;
  }
}

/**
 * Returns a valid Strava access token, transparently refreshing it via
 * /api/strava/refresh when the stored token has expired. Returns null
 * if there is no stored connection or refresh fails (caller should treat
 * that as disconnected).
 */
export async function getValidStravaToken(): Promise<StravaToken | null> {
  const token = readStoredToken();
  if (!token) return null;
  if (token.expires_at * 1000 > Date.now()) return token;
  if (!token.refresh_token) return null;

  try {
    const res = await fetch('/api/strava/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: token.refresh_token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const updated: StravaToken = {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? token.refresh_token,
      expires_at: data.expires_at,
      athlete: token.athlete,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return null;
  }
}
