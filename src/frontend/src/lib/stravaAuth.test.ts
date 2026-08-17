import { beforeEach, describe, expect, it, vi } from 'vitest';

import { consumeStravaOAuthState, createStravaOAuthState, getValidStravaToken } from './stravaAuth';

const TOKEN_KEY = 'fri_strava_token';

/** Seconds-since-epoch, the unit Strava's `expires_at` uses. */
function epochSecondsFromNow(offsetSeconds: number): number {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}

function storeToken(token: Record<string, unknown>) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Strava OAuth state', () => {
  it('accepts the nonce it just minted', () => {
    const state = createStravaOAuthState();
    expect(state).toBeTruthy();
    expect(consumeStravaOAuthState(state)).toBe(true);
  });

  it('rejects a nonce this browser never minted', () => {
    createStravaOAuthState();
    // The attack: a crafted callback link carrying the attacker's code and a
    // state value they chose. It must not match.
    expect(consumeStravaOAuthState('attacker-supplied-state')).toBe(false);
  });

  it('rejects a replay of the same callback', () => {
    const state = createStravaOAuthState();
    expect(consumeStravaOAuthState(state)).toBe(true);
    // Consuming clears it, so re-opening the same URL cannot exchange again.
    expect(consumeStravaOAuthState(state)).toBe(false);
  });

  it('rejects a callback with no state at all', () => {
    createStravaOAuthState();
    expect(consumeStravaOAuthState(null)).toBe(false);
  });

  it('rejects when no flow was started, rather than waving it through', () => {
    expect(consumeStravaOAuthState('anything')).toBe(false);
  });

  it('does not treat two absent values as a match', () => {
    // Both sides empty is the shape a naive `expected === received` would pass.
    expect(consumeStravaOAuthState('')).toBe(false);
  });

  it('reports failure instead of throwing when storage is blocked', () => {
    // Private browsing and locked-down enterprise profiles both do this.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(createStravaOAuthState()).toBeNull();
  });

  it('fails closed when storage is blocked at verification time', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(consumeStravaOAuthState('anything')).toBe(false);
  });
});

describe('getValidStravaToken', () => {
  it('returns null when no connection was ever stored', async () => {
    await expect(getValidStravaToken()).resolves.toBeNull();
  });

  it('returns null rather than throwing on corrupt stored JSON', async () => {
    localStorage.setItem(TOKEN_KEY, 'not json');
    await expect(getValidStravaToken()).resolves.toBeNull();
  });

  it('uses a still-valid token without calling the refresh endpoint', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    storeToken({
      access_token: 'live',
      refresh_token: 'r1',
      expires_at: epochSecondsFromNow(3600),
    });

    const token = await getValidStravaToken();

    expect(token?.access_token).toBe('live');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes an expired token and persists the new one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'fresh',
          refresh_token: 'r2',
          expires_at: epochSecondsFromNow(3600),
        }),
      })
    );
    storeToken({
      access_token: 'stale',
      refresh_token: 'r1',
      expires_at: epochSecondsFromNow(-60),
    });

    const token = await getValidStravaToken();

    expect(token?.access_token).toBe('fresh');
    // Persisted, so the next call does not have to refresh again.
    expect(JSON.parse(localStorage.getItem(TOKEN_KEY)!).access_token).toBe('fresh');
  });

  it('keeps the old refresh token when Strava does not rotate it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'fresh', expires_at: epochSecondsFromNow(3600) }),
      })
    );
    storeToken({
      access_token: 'stale',
      refresh_token: 'r1',
      expires_at: epochSecondsFromNow(-60),
    });

    const token = await getValidStravaToken();

    // Dropping it here would strand the user: the next expiry has nothing to
    // refresh with, and the connection dies silently an hour later.
    expect(token?.refresh_token).toBe('r1');
  });

  it('reports disconnected when the refresh is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    storeToken({
      access_token: 'stale',
      refresh_token: 'r1',
      expires_at: epochSecondsFromNow(-60),
    });

    await expect(getValidStravaToken()).resolves.toBeNull();
  });

  it('reports disconnected when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    storeToken({
      access_token: 'stale',
      refresh_token: 'r1',
      expires_at: epochSecondsFromNow(-60),
    });

    await expect(getValidStravaToken()).resolves.toBeNull();
  });

  it('does not attempt a refresh it has no refresh token for', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    storeToken({ access_token: 'stale', expires_at: epochSecondsFromNow(-60) });

    await expect(getValidStravaToken()).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
