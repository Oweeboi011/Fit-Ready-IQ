import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PLACES_CACHE_VERSION } from '@/lib/placesCacheSchema';

/**
 * The shared places cache is served to every visitor in a 0.5° cell, so what
 * matters is who may write a cell and what may be written into it. Firestore,
 * the identity gate and the limiter are stubbed at the boundary.
 */

const state = {
  user: { uid: 'alice', email: null } as { uid: string; email: string | null } | null,
  docs: new Map<string, Record<string, unknown>>(),
};

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () =>
    state.user
      ? { ok: true, user: state.user }
      : { ok: false, response: new Response(null, { status: 401 }) },
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

vi.mock('@/lib/firebaseAdmin', () => {
  const ref = (id: string) => ({ id });
  return {
    isFirebaseAdminConfigured: () => true,
    getFirestoreAdmin: () => ({
      collection: () => ({
        doc: (id: string) => ({
          ...ref(id),
          get: async () => ({ exists: state.docs.has(id), data: () => state.docs.get(id) }),
        }),
      }),
      runTransaction: async (
        fn: (tx: {
          get: (r: { id: string }) => Promise<unknown>;
          set: (r: { id: string }, d: Record<string, unknown>) => void;
        }) => Promise<unknown>
      ) =>
        fn({
          get: async (r) => ({ exists: state.docs.has(r.id), data: () => state.docs.get(r.id) }),
          set: (r, d) => {
            state.docs.set(r.id, d);
          },
        }),
    }),
  };
});

const CELL = '37.5_-122.5';

const route = {
  id: 'r1',
  name: 'Dipsea Trail',
  coordinates: [-122.6, 37.9],
  distance_km: 7.4,
  elevation_gain_m: 640,
  difficulty: 'moderate',
  activity_type: 'hike',
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    v: PLACES_CACHE_VERSION,
    lat: 37.6,
    lng: -122.4,
    routes: [route],
    mountains: [],
    campsites: [],
    ...overrides,
  };
}

async function loadRoute() {
  vi.resetModules();
  return import('./route');
}

async function post(body: unknown): Promise<Response> {
  const { POST } = await loadRoute();
  return POST(
    new Request('https://example.com/api/places/cache', {
      method: 'POST',
      body: JSON.stringify(body),
    }) as never
  );
}

async function get(query: string): Promise<Response> {
  const { GET } = await loadRoute();
  return GET(new Request(`https://example.com/api/places/cache?${query}`) as never);
}

beforeEach(() => {
  state.user = { uid: 'alice', email: null };
  state.docs = new Map();
  vi.stubEnv('LOG_LEVEL', 'ERROR');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/places/cache', () => {
  it('fills an empty cell and stamps who filled it', async () => {
    const res = await post(payload());
    expect(res.status).toBe(200);
    expect(state.docs.get(CELL)).toMatchObject({
      v: PLACES_CACHE_VERSION,
      routes: [route],
      written_by: 'alice',
    });
  });

  it('sets expiresAt so the TTL policy can delete the cell', async () => {
    await post(payload());
    const stored = state.docs.get(CELL)!;
    const ttlMs = (stored.expiresAt as Date).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(23 * 3_600_000);
    expect(ttlMs).toBeLessThanOrEqual(24 * 3_600_000);
  });

  it("never stores the writer's location, even when a client sends one", async () => {
    await post(payload({ location: { lat: 37.61, lng: -122.41, address: '1 Main St' } }));
    expect(state.docs.get(CELL)).not.toHaveProperty('location');
  });

  it('refuses to overwrite a fresh cell someone else filled (409)', async () => {
    await post(payload());
    state.user = { uid: 'mallory', email: null };

    const res = await post(payload({ routes: [{ ...route, name: 'Totally Real Trail' }] }));

    expect(res.status).toBe(409);
    expect((state.docs.get(CELL)!.routes as { name: string }[])[0].name).toBe('Dipsea Trail');
  });

  it('lets the same account refresh its own cell', async () => {
    await post(payload());
    const res = await post(payload({ routes: [] }));
    expect(res.status).toBe(200);
    expect(state.docs.get(CELL)!.routes).toEqual([]);
  });

  it('lets anyone replace a cell once it has gone stale', async () => {
    state.docs.set(CELL, {
      routes: [],
      written_by: 'alice',
      ts: new Date(Date.now() - 25 * 3_600_000).toISOString(),
    });
    state.user = { uid: 'bob', email: null };

    expect((await post(payload())).status).toBe(200);
    expect(state.docs.get(CELL)!.written_by).toBe('bob');
  });

  it('refuses a malformed item rather than serving it to the region', async () => {
    const res = await post(payload({ routes: [{ ...route, difficulty: 'extreme' }] }));
    expect(res.status).toBe(400);
    expect(state.docs.has(CELL)).toBe(false);
  });

  it('refuses a payload from another cache version', async () => {
    expect((await post(payload({ v: PLACES_CACHE_VERSION - 1 }))).status).toBe(400);
    expect((await post(payload({ v: undefined }))).status).toBe(400);
  });

  it('refuses a signed-out caller', async () => {
    state.user = null;
    expect((await post(payload())).status).toBe(401);
  });
});

describe('GET /api/places/cache', () => {
  it('serves a fresh cell without any location field', async () => {
    state.docs.set(CELL, {
      v: PLACES_CACHE_VERSION,
      routes: [route],
      mountains: [],
      campsites: [],
      location: { lat: 37.61, lng: -122.41, address: 'legacy entry' },
      ts: new Date().toISOString(),
    });

    const body = await (await get('lat=37.6&lng=-122.4')).json();

    expect(body.hit).toBe(true);
    expect(body).not.toHaveProperty('location');
  });

  it('refuses non-finite coordinates instead of looking up a nonsense cell', async () => {
    expect((await get('lat=Infinity&lng=0')).status).toBe(400);
    expect((await get('lat=91&lng=0')).status).toBe(400);
  });
});
