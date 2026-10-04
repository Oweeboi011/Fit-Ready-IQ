import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/strava/sync/route';

/**
 * The sync route writes into a user's tree with the Admin SDK, which bypasses
 * the rules, so the questions are when it may write and what it reports.
 */

const state = {
  token: 'at' as string | null,
  tokenThrows: false,
  connected: true,
  writes: 0,
  manifest: null as Record<string, unknown> | null,
};

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => ({ ok: true, user: { uid: 'alice', email: null } }),
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

vi.mock('@/lib/stravaTokens', () => ({
  getValidStravaAccessToken: async () => {
    if (state.tokenThrows) throw new Error('firestore down');
    return state.token;
  },
  forgetRejectedStravaAccess: vi.fn(async () => undefined),
  whileStravaConnected: async (
    _uid: string,
    write: (tx: { set: (ref: { path: string }, data: Record<string, unknown>) => void }) => void
  ) => {
    if (!state.connected) return false;
    write({
      set: (ref, data) => {
        if (ref.path === 'users/alice') state.manifest = data;
        else state.writes++;
      },
    });
    return true;
  },
}));

vi.mock('@/lib/firebaseAdmin', () => {
  const doc = (path: string) => ({
    path,
    collection: (name: string) => ({
      doc: (id: string) => doc(`${path}/${name}/${id}`),
      count: () => ({ get: async () => ({ data: () => ({ count: 57 }) }) }),
    }),
  });
  return {
    getFirestoreAdmin: () => ({
      collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
    }),
  };
});

function activities(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Run ${i}`, distance: 1000 }));
}

function stravaReturns(...pages: unknown[][]) {
  const fetchMock = vi.fn();
  for (const page of pages) {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => page });
  }
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
  vi.stubGlobal('fetch', fetchMock);
}

const sync = () =>
  POST(new Request('https://fitreadyiq.test/api/strava/sync', { method: 'POST' }) as never);

beforeEach(() => {
  Object.assign(state, {
    token: 'at',
    tokenThrows: false,
    connected: true,
    writes: 0,
    manifest: null,
  });
  vi.unstubAllGlobals();
});

describe('POST /api/strava/sync', () => {
  it('writes each activity and reports the stored total, not just this run', async () => {
    stravaReturns(activities(3));
    const res = await sync();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { synced: number }).synced).toBe(3);
    expect(state.writes).toBe(3);
    expect(state.manifest).toMatchObject({ strava_sync: { total_activities: 57 } });
  });

  it('stops without writing when the connection is gone — a disconnect or an erasure', async () => {
    stravaReturns(activities(3));
    state.connected = false;
    const res = await sync();
    // Not `ok: true`: the sync did not happen, and the user needs to reconnect.
    expect(res.status).toBe(409);
    expect(state.writes).toBe(0);
    // The manifest write would have recreated the erased user document.
    expect(state.manifest).toBeNull();
  });

  it('answers 409 when there is no connection to sync', async () => {
    state.token = null;
    expect((await sync()).status).toBe(409);
  });

  it('answers 503, not an unhandled 500, when the token lookup itself fails', async () => {
    state.tokenThrows = true;
    const res = await sync();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'strava_unavailable' });
  });
});
