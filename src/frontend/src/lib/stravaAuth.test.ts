import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearLegacyStravaToken,
  consumeStravaOAuthState,
  createStravaOAuthState,
} from './stravaAuth';

/**
 * The token-custody tests that used to live here are gone with the behaviour:
 * access and refresh tokens are held server-side in `strava_tokens/{uid}` now,
 * because a Strava refresh token does not expire and localStorage is readable by
 * any XSS on the origin.
 *
 * What remains is the OAuth nonce, which is not a credential, plus the migration
 * that removes the token earlier versions left behind.
 */
const LEGACY_TOKEN_KEY = 'fri_strava_token';

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

describe('clearing the legacy token', () => {
  it('removes a token left in localStorage by an earlier version', () => {
    // The reason this exists: without it, every existing user keeps a live,
    // non-expiring refresh token in their browser for ever.
    localStorage.setItem(LEGACY_TOKEN_KEY, JSON.stringify({ refresh_token: 'never-expires' }));
    clearLegacyStravaToken();
    expect(localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
  });

  it('is a no-op when there is nothing to clear', () => {
    expect(() => clearLegacyStravaToken()).not.toThrow();
    expect(localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => clearLegacyStravaToken()).not.toThrow();
  });

  it('leaves other stored values alone', () => {
    localStorage.setItem('fri_activities', '[]');
    localStorage.setItem(LEGACY_TOKEN_KEY, '{}');
    clearLegacyStravaToken();
    expect(localStorage.getItem('fri_activities')).toBe('[]');
  });
});
