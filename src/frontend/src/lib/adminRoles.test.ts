import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `requireRole` is the gate every admin endpoint sits behind, so these exercise
 * the whole path — token verification, the email-verified check, the allowlist
 * bootstrap and the claim — rather than the pure helpers alone. The Admin SDK
 * is stubbed at the boundary so a decoded token can be posed directly.
 */

const verifyIdToken = vi.fn();
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }));
vi.mock('./firebaseAdmin', () => ({ getFirebaseAdminApp: vi.fn() }));
// The gate writes denial records; that path has its own tests. Silence it here
// so a failed audit write cannot be mistaken for a failed authorisation check.
vi.mock('./auditLog', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { requireAdmin, requireRole, satisfies } from './adminAuth';

const originalAllowlist = process.env.ADMIN_EMAILS;

function requestWithToken(token = 'any-token'): Request {
  return new Request('https://fitreadyiq.test/api/admin/cache', {
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  verifyIdToken.mockReset();
  delete process.env.ADMIN_EMAILS;
});

afterEach(() => {
  process.env.ADMIN_EMAILS = originalAllowlist;
});

describe('satisfies', () => {
  it('lets a role meet its own requirement', () => {
    expect(satisfies('viewer', 'viewer')).toBe(true);
    expect(satisfies('admin', 'admin')).toBe(true);
  });

  it('lets admin stand in for viewer, but never the reverse', () => {
    expect(satisfies('admin', 'viewer')).toBe(true);
    expect(satisfies('viewer', 'admin')).toBe(false);
  });
});

describe('requireRole', () => {
  it('refuses a request with no bearer token', async () => {
    const result = await requireRole(new Request('https://fitreadyiq.test/x'), 'viewer');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('refuses a token the Admin SDK will not verify', async () => {
    verifyIdToken.mockRejectedValue(new Error('forged'));
    const result = await requireRole(requestWithToken(), 'viewer');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('checks revocation, so a signed-out admin loses access at once', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'u1',
      email: 'owner@fitreadyiq.com',
      email_verified: true,
    });
    process.env.ADMIN_EMAILS = 'owner@fitreadyiq.com';
    await requireRole(requestWithToken('tok'), 'admin');
    expect(verifyIdToken).toHaveBeenCalledWith('tok', true);
  });

  it('refuses an allowlisted address whose email is unverified', async () => {
    // The case that matters if a password provider is ever enabled: an attacker
    // self-registers an admin's address and never proves they own it.
    process.env.ADMIN_EMAILS = 'owner@fitreadyiq.com';
    verifyIdToken.mockResolvedValue({
      uid: 'u1',
      email: 'owner@fitreadyiq.com',
      email_verified: false,
    });
    const result = await requireRole(requestWithToken(), 'viewer');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('grants admin from the allowlist, ignoring any claim', async () => {
    process.env.ADMIN_EMAILS = 'owner@fitreadyiq.com';
    verifyIdToken.mockResolvedValue({
      uid: 'u1',
      email: 'owner@fitreadyiq.com',
      email_verified: true,
      fri_role: 'viewer',
    });
    const result = await requireRole(requestWithToken(), 'admin');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.admin.role).toBe('admin');
  });

  it('grants viewer from a custom claim when the allowlist does not cover them', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'u2',
      email: 'oncall@fitreadyiq.com',
      email_verified: true,
      fri_role: 'viewer',
    });
    const result = await requireRole(requestWithToken(), 'viewer');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.admin.role).toBe('viewer');
  });

  it('refuses a viewer reaching for an admin-only action', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'u2',
      email: 'oncall@fitreadyiq.com',
      email_verified: true,
      fri_role: 'viewer',
    });
    const result = await requireRole(requestWithToken(), 'admin');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('refuses a caller with no allowlist entry and no claim', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'u3',
      email: 'stranger@example.com',
      email_verified: true,
    });
    const result = await requireRole(requestWithToken(), 'viewer');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('ignores a claim that is not a known role, rather than trusting it', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'u4',
      email: 'stranger@example.com',
      email_verified: true,
      fri_role: 'superuser',
    });
    const result = await requireRole(requestWithToken(), 'viewer');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('still fails closed when the allowlist is empty and no claims are set', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'u5',
      email: 'owner@fitreadyiq.com',
      email_verified: true,
    });
    const result = await requireAdmin(requestWithToken());
    expect(result.ok).toBe(false);
  });
});

describe('requireAdmin', () => {
  it('is requireRole at the admin level', async () => {
    process.env.ADMIN_EMAILS = 'owner@fitreadyiq.com';
    verifyIdToken.mockResolvedValue({
      uid: 'u1',
      email: 'owner@fitreadyiq.com',
      email_verified: true,
    });
    const result = await requireAdmin(requestWithToken());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.admin).toMatchObject({ uid: 'u1', role: 'admin' });
  });
});
