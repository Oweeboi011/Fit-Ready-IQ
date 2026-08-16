import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const add = vi.fn();
const collection = vi.fn(() => ({ add }));
const isConfigured = vi.fn(() => true);

vi.mock('./firebaseAdmin', () => ({
  getFirestoreAdmin: () => ({ collection }),
  isFirebaseAdminConfigured: () => isConfigured(),
}));

import { AUDIT_RETENTION_DAYS, recordAudit } from './auditLog';

const actor = { uid: 'u1', email: 'owner@fitreadyiq.com' };

function request(): Request {
  return new Request('https://fitreadyiq.test/api/admin/cache', {
    headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Mozilla/5.0' },
  });
}

beforeEach(() => {
  add.mockReset().mockResolvedValue({ id: 'entry' });
  collection.mockClear();
  isConfigured.mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recordAudit', () => {
  it('writes to the audit_logs collection', async () => {
    await recordAudit(request(), { action: 'admin.cache.purge', actor, outcome: 'success' });
    expect(collection).toHaveBeenCalledWith('audit_logs');
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('records who, what and the outcome', async () => {
    await recordAudit(request(), {
      action: 'admin.cache.purge',
      actor,
      target: '14_121',
      outcome: 'success',
      detail: { deleted: 3 },
    });
    expect(add.mock.calls[0][0]).toMatchObject({
      action: 'admin.cache.purge',
      actor,
      target: '14_121',
      outcome: 'success',
      detail: { deleted: 3 },
    });
  });

  it('takes the left-most forwarded IP, which is the real client', async () => {
    await recordAudit(request(), { action: 'account.delete', actor, outcome: 'success' });
    expect(add.mock.calls[0][0].ip).toBe('203.0.113.7');
  });

  it('stamps an expiry so the TTL policy can age records out', async () => {
    const before = Date.now();
    await recordAudit(request(), { action: 'account.export', actor, outcome: 'success' });
    const { expiresAt } = add.mock.calls[0][0];
    const expectedMs = AUDIT_RETENTION_DAYS * 86_400_000;
    expect(expiresAt.getTime() - before).toBeGreaterThan(expectedMs - 60_000);
    expect(expiresAt.getTime() - before).toBeLessThan(expectedMs + 60_000);
  });

  it('truncates a long user agent rather than storing it whole', async () => {
    const req = new Request('https://fitreadyiq.test/x', {
      headers: { 'user-agent': 'A'.repeat(1000) },
    });
    await recordAudit(req, { action: 'account.export', actor, outcome: 'success' });
    expect(add.mock.calls[0][0].userAgent).toHaveLength(256);
  });

  it('never throws when the write fails, so auditing cannot break the request', async () => {
    add.mockRejectedValue(new Error('firestore down'));
    await expect(
      recordAudit(request(), { action: 'account.delete', actor, outcome: 'success' })
    ).resolves.toBeUndefined();
  });

  it('logs loudly when a record is dropped, so the gap is discoverable', async () => {
    add.mockRejectedValue(new Error('firestore down'));
    await recordAudit(request(), { action: 'account.delete', actor, outcome: 'success' });
    expect(console.error).toHaveBeenCalled();
  });

  it('does not attempt a write when Firestore is not configured', async () => {
    isConfigured.mockReturnValue(false);
    await recordAudit(request(), { action: 'account.export', actor, outcome: 'success' });
    expect(add).not.toHaveBeenCalled();
    // Through the structured logger now, which sends warn to stderr so log
    // platforms classify it correctly — hence console.error, not console.warn.
    expect(console.error).toHaveBeenCalled();
  });

  it('emits the dropped record as a structured, queryable line', async () => {
    isConfigured.mockReturnValue(false);
    await recordAudit(request(), {
      action: 'account.delete',
      actor,
      target: 'uid-1',
      outcome: 'success',
    });

    const line = JSON.parse((console.error as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
    expect(line).toMatchObject({
      level: 'warn',
      event: 'audit_not_persisted',
      action: 'account.delete',
      actor_uid: 'u1',
      target: 'uid-1',
    });
  });
});
