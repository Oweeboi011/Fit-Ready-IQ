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

// Transactions run against the same stubs, so a test can pose "what is stored
// now" with `get` and read back what was written or deleted.
const runTransaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    get: () => get(),
    set: (_ref: unknown, data: unknown, options?: unknown) =>
      options === undefined ? set(data) : set(data, options),
    delete: () => del(),
  })
);

vi.mock('./firebaseAdmin', () => ({
  getFirestoreAdmin: () => ({ collection, runTransaction }),
  isFirebaseAdminConfigured: () => isConfigured(),
}));
vi.mock('./logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  deleteStravaTokens,
  forgetRejectedStravaAccess,
  getStravaConnection,
  getValidStravaAccessToken,
  revokeStravaGrant,
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
  runTransaction.mockClear();
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

/** Strava's answer when the refresh token itself is dead. */
const REFRESH_TOKEN_INVALID = {
  message: 'Bad Request',
  errors: [{ resource: 'RefreshToken', field: 'refresh_token', code: 'invalid' }],
};

/** Strava's answer when *our* client id is wrong — nothing to do with the user. */
const CLIENT_ID_INVALID = {
  message: 'Bad Request',
  errors: [{ resource: 'Application', field: 'client_id', code: 'invalid' }],
};

describe('storeStravaTokens', () => {
  it('keeps the first connected_at when a user reconnects', async () => {
    get.mockResolvedValue({
      exists: true,
      data: () => ({ connected_at: '2026-01-01T00:00:00.000Z' }),
    });
    const connection = await storeStravaTokens(UID, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_at: soon(),
    });
    expect(connection?.connectedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ connected_at: '2026-01-01T00:00:00.000Z' })
    );
  });

  it('stores a complete response and reports the athlete', async () => {
    get.mockResolvedValue({ exists: false, data: () => undefined });
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
    get.mockResolvedValue({ exists: false, data: () => undefined });
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
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => REFRESH_TOKEN_INVALID,
    } as Response);

    expect(await getValidStravaAccessToken(UID)).toBeNull();
    expect(del).toHaveBeenCalled();
  });

  it('keeps every connection when the rejection is about our client, not their token', async () => {
    // One misconfigured deploy used to disconnect every user as their token
    // came up for refresh.
    stored({ expires_at: past() });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => CLIENT_ID_INVALID,
    } as Response);

    expect(await getValidStravaAccessToken(UID)).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });

  it('keeps a connection another request rotated while this one was refreshing', async () => {
    // First read: the old, expired token. By the time Strava refuses it, a
    // concurrent request has stored a fresh pair.
    get
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ access_token: 'old-at', refresh_token: 'old-rt', expires_at: past() }),
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ access_token: 'fresh-at', refresh_token: 'fresh-rt', expires_at: soon() }),
      });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => REFRESH_TOKEN_INVALID,
    } as Response);

    expect(await getValidStravaAccessToken(UID)).toBe('fresh-at');
    expect(del).not.toHaveBeenCalled();
  });

  it('keeps a connection rotated between our refused refresh and the forget', async () => {
    const old = { access_token: 'old-at', refresh_token: 'old-rt', expires_at: past() };
    get
      .mockResolvedValueOnce({ exists: true, data: () => old })
      .mockResolvedValueOnce({ exists: true, data: () => old })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ access_token: 'fresh-at', refresh_token: 'fresh-rt', expires_at: soon() }),
      });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => REFRESH_TOKEN_INVALID,
    } as Response);

    expect(await getValidStravaAccessToken(UID)).toBe('fresh-at');
    expect(del).not.toHaveBeenCalled();
  });

  it('does not resurrect a connection deleted while the refresh was in flight', async () => {
    // Disconnect or account erasure lands between our read and our write. An
    // unconditional write would bring the tokens back.
    const old = { access_token: 'old-at', refresh_token: 'rt', expires_at: past() };
    get
      .mockResolvedValueOnce({ exists: true, data: () => old })
      .mockResolvedValueOnce({ exists: true, data: () => old })
      .mockResolvedValueOnce({ exists: false, data: () => undefined });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-at', refresh_token: 'new-rt', expires_at: soon() }),
    } as Response);

    expect(await getValidStravaAccessToken(UID)).toBeNull();
    expect(set).not.toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'new-at' }),
      expect.anything()
    );
  });

  it('waits for a refresh already in progress instead of spending the token twice', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const leased = {
        access_token: 'old-at',
        refresh_token: 'rt',
        expires_at: past(),
        refresh_lease_until: Date.now() + 10_000,
      };
      get
        .mockResolvedValueOnce({ exists: true, data: () => leased })
        .mockResolvedValueOnce({ exists: true, data: () => leased })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ access_token: 'their-at', refresh_token: 'their-rt', expires_at: soon() }),
        });

      const pending = getValidStravaAccessToken(UID);
      await vi.advanceTimersByTimeAsync(600);

      expect(await pending).toBe('their-at');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes the lease before calling Strava, and releases it after', async () => {
    stored({ expires_at: past() });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-at', refresh_token: 'rt', expires_at: soon() }),
    } as Response);

    await getValidStravaAccessToken(UID);
    expect(set).toHaveBeenNthCalledWith(
      1,
      { refresh_lease_until: expect.any(Number) },
      { merge: true }
    );
    expect(set).toHaveBeenLastCalledWith(
      expect.objectContaining({ access_token: 'new-at', refresh_lease_until: 0 }),
      { merge: true }
    );
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

describe('forgetRejectedStravaAccess', () => {
  it('forgets the tokens when the refused access token is still the stored one', async () => {
    stored({ access_token: 'refused' });
    await forgetRejectedStravaAccess(UID, 'refused');
    expect(del).toHaveBeenCalled();
  });

  it('leaves newer tokens alone', async () => {
    stored({ access_token: 'newer' });
    await forgetRejectedStravaAccess(UID, 'refused');
    expect(del).not.toHaveBeenCalled();
  });
});

describe('revokeStravaGrant', () => {
  it('withdraws our access at Strava, then forgets the tokens', async () => {
    stored();
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await revokeStravaGrant(UID);

    expect(fetch).toHaveBeenCalledWith(
      'https://www.strava.com/oauth/deauthorize',
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer at' } })
    );
    expect(del).toHaveBeenCalled();
  });

  it('still forgets the tokens when Strava cannot be reached', async () => {
    stored();
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'));
    await revokeStravaGrant(UID);
    expect(del).toHaveBeenCalled();
  });
});

describe('deleteStravaTokens', () => {
  it('deletes the document', async () => {
    await deleteStravaTokens(UID);
    expect(del).toHaveBeenCalled();
  });
});
