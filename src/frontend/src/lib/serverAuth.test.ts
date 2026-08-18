import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `requireUser` is the gate that decides *whose* data a route touches. Because
 * route handlers use the Admin SDK, which bypasses Firestore rules entirely, a
 * mistake here is not a degraded check — it is no check at all.
 */

const verifyIdToken = vi.fn();
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }));
vi.mock('./firebaseAdmin', () => ({ getFirebaseAdminApp: vi.fn() }));

import { deny, optionalUser, requireUser } from './serverAuth';

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://fitreadyiq.test/api/strava/sync', { headers });
}

beforeEach(() => {
  verifyIdToken.mockReset();
});

describe('requireUser', () => {
  it('refuses a request with no Authorization header', async () => {
    const result = await requireUser(req());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('refuses a non-bearer scheme', async () => {
    const result = await requireUser(req({ authorization: 'Basic abc123' }));
    expect(result.ok).toBe(false);
  });

  it('refuses a bearer header with no token after it', async () => {
    const result = await requireUser(req({ authorization: 'Bearer    ' }));
    expect(result.ok).toBe(false);
  });

  it('accepts the bearer scheme case-insensitively, per RFC 7235', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'a@b.com' });
    const result = await requireUser(req({ authorization: 'bEaReR tok' }));
    expect(result.ok).toBe(true);
  });

  it('checks revocation, so signing out takes effect immediately', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'a@b.com' });
    await requireUser(req({ authorization: 'Bearer tok' }));
    expect(verifyIdToken).toHaveBeenCalledWith('tok', true);
  });

  it('returns the uid from the token', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'real-uid', email: 'a@b.com' });
    const result = await requireUser(req({ authorization: 'Bearer tok' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user).toEqual({ uid: 'real-uid', email: 'a@b.com' });
  });

  it('tolerates a token with no email', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1' });
    const result = await requireUser(req({ authorization: 'Bearer tok' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.email).toBeNull();
  });

  it('refuses a token the SDK rejects, without saying why', async () => {
    verifyIdToken.mockRejectedValue(new Error('token expired at 12:04 for uid abc'));
    const result = await requireUser(req({ authorization: 'Bearer tok' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      // Distinguishing "expired" from "revoked" from "forged" is free
      // information for someone probing the endpoint.
      const body = await result.response.json();
      expect(body.error).not.toContain('abc');
      expect(body.error).not.toContain('12:04');
    }
  });
});

describe('optionalUser', () => {
  it('returns the caller when there is one', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'a@b.com' });
    await expect(optionalUser(req({ authorization: 'Bearer tok' }))).resolves.toEqual({
      uid: 'u1',
      email: 'a@b.com',
    });
  });

  it('returns null rather than refusing when there is no token', async () => {
    await expect(optionalUser(req())).resolves.toBeNull();
  });

  it('returns null for a bad token, since anonymous is not an error here', async () => {
    verifyIdToken.mockRejectedValue(new Error('forged'));
    await expect(optionalUser(req({ authorization: 'Bearer tok' }))).resolves.toBeNull();
  });
});

describe('deny', () => {
  it('builds a refusal carrying the status and message', async () => {
    const result = deny(403, 'Not authorised.');
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toEqual({ error: 'Not authorised.' });
  });
});
