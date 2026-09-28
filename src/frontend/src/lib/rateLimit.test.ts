import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Firestore Admin SDK is stubbed: what is under test is the limiter's
 * arithmetic and its failure posture, not whether Firestore can count.
 */
const state = {
  configured: true,
  counts: new Map<string, number>(),
  throwOnTransaction: false,
  writes: 0,
  transactions: 0,
};

vi.mock('./firebaseAdmin', () => ({
  isFirebaseAdminConfigured: () => state.configured,
  getFirestoreAdmin: () => ({
    collection: () => ({
      doc: (id: string) => ({ id }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<number>) => {
      state.transactions++;
      if (state.throwOnTransaction) throw new Error('firestore down');
      const tx = {
        get: async (ref: { id: string }) => ({
          exists: state.counts.has(ref.id),
          data: () => ({ count: state.counts.get(ref.id) }),
        }),
        set: (ref: { id: string }, data: { count: number }) => {
          state.writes++;
          state.counts.set(ref.id, data.count);
        },
      };
      return fn(tx);
    },
  }),
}));

const { callerKey, rateLimit, resetRateLimitMemory, tooManyRequests } = await import('./rateLimit');

const RULE = { name: 'test', limit: 3, windowSeconds: 60 };

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/thing', { headers });
}

beforeEach(() => {
  state.configured = true;
  state.counts.clear();
  state.throwOnTransaction = false;
  state.writes = 0;
  state.transactions = 0;
  resetRateLimitMemory();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('callerKey', () => {
  it('keys a verified caller by their uid', () => {
    expect(callerKey(req(), { uid: 'user-1' })).toMatch(/^u_/);
  });

  it('never puts the raw uid or IP in the key', () => {
    // Keys become Firestore document ids and appear in logs.
    expect(callerKey(req(), { uid: 'user-secret-uid' })).not.toContain('user-secret-uid');
    expect(callerKey(req({ 'x-forwarded-for': '203.0.113.7' }))).not.toContain('203.0.113.7');
  });

  it('gives the same caller a stable key', () => {
    expect(callerKey(req(), { uid: 'user-1' })).toBe(callerKey(req(), { uid: 'user-1' }));
  });

  it('separates two different users', () => {
    expect(callerKey(req(), { uid: 'user-1' })).not.toBe(callerKey(req(), { uid: 'user-2' }));
  });

  it('ignores an unverified bearer token entirely', () => {
    // The bypass this guards against: the key used to be a hash of whatever
    // bearer string arrived, so a random token per request was a fresh bucket
    // per request. Without a verified caller, only the IP counts.
    const ip = { 'x-forwarded-for': '203.0.113.7' };
    const bare = callerKey(req(ip));
    expect(callerKey(req({ ...ip, authorization: 'Bearer made-up-1' }))).toBe(bare);
    expect(callerKey(req({ ...ip, authorization: 'Bearer made-up-2' }))).toBe(bare);
  });

  it('keys one user identically whichever token they present', () => {
    // A refreshed ID token must not be a refreshed budget.
    const a = callerKey(req({ authorization: 'Bearer token-before-refresh' }), { uid: 'user-1' });
    const b = callerKey(req({ authorization: 'Bearer token-after-refresh' }), { uid: 'user-1' });
    expect(a).toBe(b);
  });

  it('falls back to the client IP when there is no verified caller', () => {
    expect(callerKey(req({ 'x-forwarded-for': '203.0.113.7' }))).toMatch(/^ip_/);
    expect(callerKey(req({ 'x-forwarded-for': '203.0.113.7' }), null)).toMatch(/^ip_/);
    expect(callerKey(req(), { uid: '' })).toMatch(/^ip_/);
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

  describe('with RATE_LIMIT_SALT', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('produces keys that differ from the unsalted hash', () => {
      const ip = req({ 'x-forwarded-for': '203.0.113.7' });
      const unsalted = callerKey(ip);
      vi.stubEnv('RATE_LIMIT_SALT', 'test-salt');
      expect(callerKey(ip)).not.toBe(unsalted);
    });

    it('still gives the same caller a stable key', () => {
      vi.stubEnv('RATE_LIMIT_SALT', 'test-salt');
      expect(callerKey(req(), { uid: 'user-1' })).toBe(callerKey(req(), { uid: 'user-1' }));
    });
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
    for (let i = 0; i < RULE.limit; i++) await rateLimit(req(), RULE, { uid: 'aaa' });

    expect((await rateLimit(req(), RULE, { uid: 'aaa' })).ok).toBe(false);
    // One heavy caller must not throttle everyone else.
    expect((await rateLimit(req(), RULE, { uid: 'bbb' })).ok).toBe(true);
  });

  it('cannot be escaped by sending a different made-up token each time', async () => {
    const ip = { 'x-forwarded-for': '198.51.100.4' };
    for (let i = 0; i < RULE.limit; i++) {
      await rateLimit(req({ ...ip, authorization: `Bearer forged-${i}` }), RULE);
    }
    const next = await rateLimit(req({ ...ip, authorization: 'Bearer forged-next' }), RULE);
    expect(next.ok).toBe(false);
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

describe('rateLimit — the cost of refusing', () => {
  it('stops writing once the budget is spent', async () => {
    const r = req({ 'x-forwarded-for': '203.0.113.9' });
    for (let i = 0; i < RULE.limit; i++) await rateLimit(r, RULE);
    const writesAtLimit = state.writes;

    expect((await rateLimit(r, RULE)).ok).toBe(false);
    expect(state.writes).toBe(writesAtLimit);
  });

  it('answers a refused bucket from memory for the rest of the window', async () => {
    const r = req({ 'x-forwarded-for': '203.0.113.10' });
    for (let i = 0; i <= RULE.limit; i++) await rateLimit(r, RULE);
    const transactions = state.transactions;

    for (let i = 0; i < 5; i++) expect((await rateLimit(r, RULE)).ok).toBe(false);
    expect(state.transactions).toBe(transactions);
  });

  it('says so, rather than silently allowing everything, when Firebase is unconfigured', async () => {
    state.configured = false;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await rateLimit(req(), RULE)).ok).toBe(true);
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
