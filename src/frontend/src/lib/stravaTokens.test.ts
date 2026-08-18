import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-side custody of the Strava tokens.
 *
 * The behaviours worth pinning down are the ones whose failure is silent:
 * the rotated refresh token being persisted (get it wrong and a connection works
 * exactly once, then dies days later), and a revoked grant being *deleted* rather
 * than retried for ever.
 */

const set = vi.fn().mockResolvedValue(undefined);
const del = vi.fn().mockResolvedValue(undefined);
const get = vi.fn();
const doc = vi.fn(() => ({ set, delete: del, get }));
const collection = vi.fn(() => ({ doc }));
const isConfigured = vi.fn(() => true);

vi.mock('./firebaseAdmin', () => ({
  getFirestoreAdmin: () => ({ collection }),
  isFirebaseAdminConfigured: () => isConfigured(),
}));
vi.mock('./logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  deleteStravaTokens,
  getStravaConnection,
  getValidStravaAccessToken,
  storeStravaTokens,
} from './stravaTokens';

const UID = 'user-1';
const soon = () => Math.floor(Date.now() / 1000) + 3600;
const past = () => Math.floor(Date.now() / 1000) - 10;

function stored(overrides: Record<string, unknown> = {}) {
  get.mockResolvedValue({
    exists: true,
    data: () => ({
      access_token: 'at',
      refresh_token: 'rt',
      expires_at: soon(),
      athlete_id: 42,
      athlete_name: 'Jane Doe',
      ...overrides,
    }),
  });
}

beforeEach(() => {
  set.mockClear();
  del.mockClear();
  get.mockReset();
  collection.mockClear();
  isConfigured.mockReturnValue(true);
  vi.stubGlobal('fetch', vi.fn());
  // refreshAccessToken needs these; vitest does not load .env.local.
  process.env.STRAVA_CLIENT_ID = 'test-client';
  process.env.STRAVA_CLIENT_SECRET = 'test-secret';
});

afterEach(() => vi.unstubAllGlobals());

describe('where the tokens are kept', () => {
  it('uses a collection the security rules deny to clients', async () => {
    stored();
    await getValidStravaAccessToken(UID);
    // Not `users/{uid}` — that document is readable by the user's own browser,
    // which would put the credential back where it started.
    expect(collection).toHaveBeenCalledWith('strava_tokens');
    expect(doc).toHaveBeenCalledWith(UID);
  });
});

describe('storeStravaTokens', () => {
  it('stores a complete response and reports the athlete', async () => {
    const connection = await storeStravaTokens(UID, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_at: soon(),
      athlete: { id: 7, firstname: 'Jane', lastname: 'Doe' },
    });

    expect(connection).toMatchObject({ connected: true, athleteId: 7, athleteName: 'Jane Doe' });
    expect(set).toHaveBeenCalled();
  });

  it('refuses a response missing the refresh token rather than storing half a link', async () => {
    const connection = await storeStravaTokens(UID, { access_token: 'at', expires_at: soon() });
    expect(connection).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });

  it('tolerates an athlete with no name', async () => {
    const connection = await storeStravaTokens(UID, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_at: soon(),
      athlete: null,
    });
    expect(connection).toMatchObject({ athleteName: null, athleteId: null });
  });
});

describe('getStravaConnection', () => {
  it('reports disconnected when nothing is stored', async () => {
    get.mockResolvedValue({ exists: false });
    expect(await getStravaConnection(UID)).toMatchObject({ connected: false });
  });

  it('never returns a token, only the athlete', async () => {
    stored({
      connected_at: '2026-01-01T00:00:00.000Z',
      access_token: 'SECRET-ACCESS-TOKEN',
      refresh_token: 'SECRET-REFRESH-TOKEN',
    });
    const connection = await getStravaConnection(UID);
    expect(connection).toMatchObject({ connected: true, athleteId: 42 });
    // The whole point of the refactor: nothing secret crosses this boundary.
    const serialised = JSON.stringify(connection);
    expect(serialised).not.toContain('SECRET-ACCESS-TOKEN');
    expect(serialised).not.toContain('SECRET-REFRESH-TOKEN');
  });
});

describe('getValidStravaAccessToken', () => {
  it('returns the stored token while it is still valid, without calling Strava', async () => {
    stored();
    expect(await getValidStravaAccessToken(UID)).toBe('at');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null when there is no connection', async () => {
    get.mockResolvedValue({ exists: false });
    expect(await getValidStravaAccessToken(UID)).toBeNull();
  });

  it('refreshes an expired token', async () => {
    stored({ expires_at: past() });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-at', refresh_token: 'new-rt', expires_at: soon() }),
    } as Response);

    expect(await getValidStravaAccessToken(UID)).toBe('new-at');
  });

  it('persists the ROTATED refresh token — the failure that kills a link days later', async () => {
    stored({ expires_at: past() });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-at', refresh_token: 'new-rt', expires_at: soon() }),
    } as Response);

    await getValidStravaAccessToken(UID);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: 'new-rt' }),
      expect.anything()
    );
  });

  it('keeps the old refresh token when Strava omits a new one', async () => {
    stored({ expires_at: past() });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-at', expires_at: soon() }),
    } as Response);

    await getValidStravaAccessToken(UID);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: 'rt' }),
      expect.anything()
    );
  });

  it('deletes a revoked connection rather than retrying it for ever', async () => {
    stored({ expires_at: past() });
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 400 } as Response);

    expect(await getValidStravaAccessToken(UID)).toBeNull();
    expect(del).toHaveBeenCalled();
  });

  it('keeps the connection when the failure is only a network one', async () => {
    // A temporary outage must not destroy a working link.
    stored({ expires_at: past() });
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'));

    expect(await getValidStravaAccessToken(UID)).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });

  it('keeps the connection on a server-side Strava error', async () => {
    stored({ expires_at: past() });
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    expect(await getValidStravaAccessToken(UID)).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });

  it('refreshes slightly before expiry rather than at the boundary', async () => {
    // 60s out is inside the skew, so it must still refresh — discovering expiry
    // mid-request would fail a sync that was about to work.
    stored({ expires_at: Math.floor(Date.now() / 1000) + 60 });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-at', refresh_token: 'rt2', expires_at: soon() }),
    } as Response);

    expect(await getValidStravaAccessToken(UID)).toBe('new-at');
  });

  it('does nothing when Firestore is not configured', async () => {
    isConfigured.mockReturnValue(false);
    expect(await getValidStravaAccessToken(UID)).toBeNull();
  });
});

describe('deleteStravaTokens', () => {
  it('deletes the document', async () => {
    await deleteStravaTokens(UID);
    expect(del).toHaveBeenCalled();
  });
});
