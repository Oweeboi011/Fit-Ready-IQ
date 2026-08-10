import { afterEach, describe, expect, it, vi } from 'vitest';

// The module pulls in the Admin SDK at import time; the allowlist logic under
// test never touches it, so a stub keeps this a pure unit test.
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('./firebaseAdmin', () => ({ getFirebaseAdminApp: vi.fn() }));

import { isAdminEmail } from './adminAuth';

const originalAllowlist = process.env.ADMIN_EMAILS;

afterEach(() => {
  process.env.ADMIN_EMAILS = originalAllowlist;
});

describe('isAdminEmail', () => {
  it('fails closed when no allowlist is configured', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail('anyone@example.com')).toBe(false);
  });

  it('fails closed when the allowlist is blank or only separators', () => {
    process.env.ADMIN_EMAILS = ' , , ';
    expect(isAdminEmail('anyone@example.com')).toBe(false);
  });

  it('admits an allowlisted address', () => {
    process.env.ADMIN_EMAILS = 'owner@fitreadyiq.com';
    expect(isAdminEmail('owner@fitreadyiq.com')).toBe(true);
  });

  it('ignores case and surrounding whitespace on both sides', () => {
    process.env.ADMIN_EMAILS = '  Owner@FitReadyIQ.com , ops@fitreadyiq.com ';
    expect(isAdminEmail('OWNER@fitreadyiq.com')).toBe(true);
    expect(isAdminEmail('ops@fitreadyiq.com')).toBe(true);
  });

  it('rejects an address that merely contains an allowlisted one', () => {
    process.env.ADMIN_EMAILS = 'owner@fitreadyiq.com';
    expect(isAdminEmail('owner@fitreadyiq.com.attacker.dev')).toBe(false);
    expect(isAdminEmail('notowner@fitreadyiq.com')).toBe(false);
  });

  it('rejects a missing email, which is what an anonymous caller presents', () => {
    process.env.ADMIN_EMAILS = 'owner@fitreadyiq.com';
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail('')).toBe(false);
  });
});
