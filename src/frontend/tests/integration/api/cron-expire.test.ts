import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/cron/expire/route';

/**
 * The sweep deletes data, so what matters most is who can start it: Vercel
 * Cron holding the secret, and nobody else — including when the secret was
 * never configured.
 */

const sweep = vi.hoisted(() => ({
  calls: 0,
  result: { deleted: {}, failed: {} as Record<string, string>, complete: true },
  throws: false,
}));

vi.mock('@/lib/expirySweep', () => ({
  sweepExpired: vi.fn(async () => {
    sweep.calls += 1;
    if (sweep.throws) throw new Error('boom');
    return sweep.result;
  }),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  isFirebaseAdminConfigured: () => true,
  getFirestoreAdmin: () => ({}),
}));

const ORIGINAL = process.env.CRON_SECRET;

function call(authorization?: string) {
  return GET(
    new Request('https://fitreadyiq.test/api/cron/expire', {
      headers: authorization ? { authorization } : {},
    })
  );
}

beforeEach(() => {
  process.env.CRON_SECRET = 'the-secret';
  sweep.calls = 0;
  sweep.result = { deleted: { rate_limits: 4 }, failed: {}, complete: true };
  sweep.throws = false;
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL;
});

describe('GET /api/cron/expire', () => {
  it('refuses everyone when CRON_SECRET is unset, rather than running open', async () => {
    delete process.env.CRON_SECRET;
    const res = await call('Bearer ');
    expect(res.status).toBe(503);
    expect(sweep.calls).toBe(0);
  });

  it('refuses a request with no credentials', async () => {
    expect((await call()).status).toBe(401);
    expect(sweep.calls).toBe(0);
  });

  it('refuses a wrong secret', async () => {
    expect((await call('Bearer not-it')).status).toBe(401);
    expect(sweep.calls).toBe(0);
  });

  it('refuses the secret without the Bearer scheme Vercel sends', async () => {
    expect((await call('the-secret')).status).toBe(401);
  });

  it('runs the sweep for Vercel Cron and reports what it deleted', async () => {
    const res = await call('Bearer the-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: { rate_limits: 4 }, complete: true });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 500 when a collection failed, so the cron log shows red', async () => {
    sweep.result = { deleted: {}, failed: { messages: 'FAILED_PRECONDITION' }, complete: false };
    const res = await call('Bearer the-secret');
    expect(res.status).toBe(500);
    expect((await res.json()).failed.messages).toBe('FAILED_PRECONDITION');
  });

  it('answers 500 when the sweep throws', async () => {
    sweep.throws = true;
    expect((await call('Bearer the-secret')).status).toBe(500);
  });
});
