export interface StravaToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: unknown;
}

const STORAGE_KEY = 'fri_strava_token';

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
