import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Firestore Admin SDK is stubbed: what is under test is the limiter's
 * arithmetic and its failure posture, not whether Firestore can count.
 */
const state = {
  configured: true,
  counts: new Map<string, number>(),
  throwOnTransaction: false,
};

vi.mock('./firebaseAdmin', () => ({
  isFirebaseAdminConfigured: () => state.configured,
  getFirestoreAdmin: () => ({
    collection: () => ({
      doc: (id: string) => ({ id }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<number>) => {
      if (state.throwOnTransaction) throw new Error('firestore down');
      const tx = {
        get: async (ref: { id: string }) => ({
          exists: state.counts.has(ref.id),
          data: () => ({ count: state.counts.get(ref.id) }),
        }),
        set: (ref: { id: string }, data: { count: number }) => {
          state.counts.set(ref.id, data.count);
        },
      };
      return fn(tx);
    },
  }),
}));

const { callerKey, rateLimit, tooManyRequests } = await import('./rateLimit');

const RULE = { name: 'test', limit: 3, windowSeconds: 60 };

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/thing', { headers });
}

beforeEach(() => {
  state.configured = true;
  state.counts.clear();
  state.throwOnTransaction = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('callerKey', () => {
  it('keys an authenticated caller by their token', () => {
    expect(callerKey(req({ authorization: 'Bearer abc' }))).toMatch(/^u_/);
  });

  it('never puts the raw token in the key', () => {
    // Keys become Firestore document ids and appear in logs.
    const key = callerKey(req({ authorization: 'Bearer super-secret' }));
    expect(key).not.toContain('super-secret');
  });

  it('gives the same caller a stable key', () => {
    const a = callerKey(req({ authorization: 'Bearer abc' }));
    const b = callerKey(req({ authorization: 'Bearer abc' }));
    expect(a).toBe(b);
  });

  it('separates two different tokens', () => {
    const a = callerKey(req({ authorization: 'Bearer abc' }));
    const b = callerKey(req({ authorization: 'Bearer xyz' }));
    expect(a).not.toBe(b);
  });

  it('treats the bearer scheme case-insensitively', () => {
    expect(callerKey(req({ authorization: 'bearer abc' }))).toBe(
      callerKey(req({ authorization: 'Bearer abc' }))
    );
  });

  it('falls back to the client IP when there is no usable token', () => {
    expect(callerKey(req({ 'x-forwarded-for': '203.0.113.7' }))).toMatch(/^ip_/);
    expect(callerKey(req({ authorization: 'Basic abc' }))).toMatch(/^ip_/);
    expect(callerKey(req({ authorization: 'Bearer   ' }))).toMatch(/^ip_/);
  });

  it('reads only the left-most forwarded address', () => {
    // Vercel overwrites this header and puts the real client first; the rest
    // are downstream proxies a caller can append to at will.
    const a = callerKey(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
    const b = callerKey(req({ 'x-forwarded-for': '203.0.113.7, 10.9.9.9' }));
    expect(a).toBe(b);
  });

  it('does not collapse two different IPs into one bucket', () => {
    const a = callerKey(req({ 'x-forwarded-for': '203.0.113.7' }));
    const b = callerKey(req({ 'x-forwarded-for': '203.0.113.8' }));
    expect(a).not.toBe(b);
  });
});

describe('rateLimit', () => {
  it('allows requests up to the limit and counts down', async () => {
    const r = req({ authorization: 'Bearer abc' });
    expect(await rateLimit(r, RULE)).toMatchObject({ ok: true, remaining: 2 });
    expect(await rateLimit(r, RULE)).toMatchObject({ ok: true, remaining: 1 });
    expect(await rateLimit(r, RULE)).toMatchObject({ ok: true, remaining: 0 });
  });

  it('refuses the request after the limit is spent', async () => {
    const r = req({ authorization: 'Bearer abc' });
    for (let i = 0; i < RULE.limit; i++) await rateLimit(r, RULE);

    const result = await rateLimit(r, RULE);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('budgets each caller separately', async () => {
    const a = req({ authorization: 'Bearer aaa' });
    const b = req({ authorization: 'Bearer bbb' });
    for (let i = 0; i < RULE.limit; i++) await rateLimit(a, RULE);

    expect((await rateLimit(a, RULE)).ok).toBe(false);
    // One heavy caller must not throttle everyone else.
    expect((await rateLimit(b, RULE)).ok).toBe(true);
  });

  it('budgets each endpoint separately', async () => {
    const r = req({ authorization: 'Bearer abc' });
    for (let i = 0; i < RULE.limit; i++) await rateLimit(r, RULE);

    expect((await rateLimit(r, RULE)).ok).toBe(false);
    // Exhausting chat must not lock the user out of the planner.
    expect((await rateLimit(r, { ...RULE, name: 'other' })).ok).toBe(true);
  });

  it('starts a fresh budget in the next window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T10:00:00Z'));
    const r = req({ authorization: 'Bearer abc' });
    for (let i = 0; i < RULE.limit; i++) await rateLimit(r, RULE);
    expect((await rateLimit(r, RULE)).ok).toBe(false);

    vi.setSystemTime(new Date('2026-08-16T10:02:00Z'));
    expect((await rateLimit(r, RULE)).ok).toBe(true);
  });

  it('fails open when Firestore is not configured', async () => {
    // A limiter that fails closed turns a degraded dependency into an outage.
    state.configured = false;
    const r = req({ authorization: 'Bearer abc' });
    for (let i = 0; i < RULE.limit + 5; i++) {
      expect((await rateLimit(r, RULE)).ok).toBe(true);
    }
  });

  it('fails open, and says so, when the transaction throws', async () => {
    state.throwOnTransaction = true;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await rateLimit(req(), RULE)).ok).toBe(true);
    // Silently not rate-limiting is how you find out on the invoice.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('tooManyRequests', () => {
  it('answers 429 with a Retry-After the client can act on', async () => {
    const res = tooManyRequests({ ok: false, remaining: 0, retryAfterSeconds: 42 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    await expect(res.json()).resolves.toHaveProperty('error');
  });
});
