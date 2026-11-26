import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as activities } from '@/app/api/strava/activities/route';
import { DELETE as disconnect, GET as connection } from '@/app/api/strava/connection/route';
import { POST as exchange } from '@/app/api/strava/exchange/route';

/**
 * The three routes that stand between the browser and a Strava credential that
 * never expires. The property they share, and the one tested hardest here: no
 * response ever contains a token, and an upstream failure is reported without
 * quoting the upstream.
 */

const SECRET_TOKEN = 'secret-access-token-value';

const state = {
  signedIn: true,
  limited: false,
  connected: true,
  stored: null as null | object,
};
const calls = { stored: 0, deleted: 0, forgotten: 0, audits: [] as string[] };

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () =>
    state.signedIn
      ? { ok: true, user: { uid: 'alice', email: 'alice@example.test' } }
      : { ok: false, response: new Response(null, { status: 401 }) },
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: !state.limited, remaining: 0, retryAfterSeconds: 60 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

vi.mock('@/lib/auditLog', () => ({
  recordAudit: async (_req: Request, entry: { action: string }) => {
    calls.audits.push(entry.action);
  },
}));

vi.mock('@/lib/stravaTokens', () => ({
  storeStravaTokens: async () => {
    calls.stored++;
    return state.stored;
  },
  getStravaConnection: async () =>
    state.connected
      ? { connected: true, athleteId: 42, athleteName: 'Fixture Athlete', connectedAt: 'then' }
      : { connected: false, athleteId: null, athleteName: null, connectedAt: null },
  deleteStravaTokens: async () => {
    calls.deleted++;
  },
  forgetRejectedStravaAccess: async () => {
    calls.forgotten++;
  },
  getValidStravaAccessToken: async () => (state.connected ? SECRET_TOKEN : null),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  state.signedIn = true;
  state.limited = false;
  state.connected = true;
  state.stored = { connected: true, athleteId: 42, athleteName: 'Fixture Athlete' };
  calls.stored = 0;
  calls.deleted = 0;
  calls.forgotten = 0;
  calls.audits = [];
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('STRAVA_CLIENT_ID', '123');
  vi.stubEnv('STRAVA_CLIENT_SECRET', 'client-secret-value');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const post = (body: unknown) =>
  exchange(
    new NextRequest('https://fitreadyiq.test/api/strava/exchange', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

const getActivities = (query = '') =>
  activities(new NextRequest(`https://fitreadyiq.test/api/strava/activities${query}`));

describe('POST /api/strava/exchange', () => {
  it('refuses a caller with no account', async () => {
    state.signedIn = false;
    expect((await post({ code: 'abc' })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is metered', async () => {
    state.limited = true;
    expect((await post({ code: 'abc' })).status).toBe(429);
  });

  it('says so when server credentials are missing, without naming them', async () => {
    vi.stubEnv('STRAVA_CLIENT_SECRET', '');
    const res = await post({ code: 'abc' });
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', ''],
    ['no code', {}],
    ['a non-string code', { code: 7 }],
    ['an oversized code', { code: 'x'.repeat(257) }],
  ])('rejects %s before calling Strava', async (_name, body) => {
    expect((await post(body)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores the tokens server-side and returns the connection, never a token', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ access_token: SECRET_TOKEN, refresh_token: 'r', athlete: { id: 42 } })
    );

    const res = await post({ code: 'abc' });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(calls.stored).toBe(1);
    expect(text).not.toContain(SECRET_TOKEN);
    expect(text).not.toContain('client-secret-value');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('turns a rejected exchange into a plain 400 without quoting Strava', async () => {
    fetchMock.mockResolvedValue(new Response('bad client_id 123', { status: 401 }));
    const res = await post({ code: 'abc' });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('client_id');
  });

  it('answers 504 when Strava is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    expect((await post({ code: 'abc' })).status).toBe(504);
  });

  it('answers 502 when Strava returns a connection we cannot use', async () => {
    state.stored = null;
    fetchMock.mockResolvedValue(Response.json({}));
    expect((await post({ code: 'abc' })).status).toBe(502);
  });
});

describe('GET /api/strava/activities', () => {
  it('refuses a caller with no account', async () => {
    state.signedIn = false;
    expect((await getActivities()).status).toBe(401);
  });

  it('answers 409, not 401, when Strava is not connected', async () => {
    // 401 would read as "your Firebase session expired", the wrong fix.
    state.connected = false;
    const res = await getActivities();
    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clamps a hostile page number so it cannot smuggle upstream parameters', async () => {
    fetchMock.mockResolvedValue(Response.json([]));
    await getActivities('?page=1%26per_page%3D999');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('page=1&per_page=30');
    expect(url).not.toContain('999');
  });

  it('caps the page at 100 and defaults a bad one to 1', async () => {
    fetchMock.mockResolvedValue(Response.json([]));
    await getActivities('?page=100000');
    await getActivities('?page=-3');
    expect(fetchMock.mock.calls[0][0]).toContain('page=100&');
    expect(fetchMock.mock.calls[1][0]).toContain('page=1&');
  });

  it('forgets a token Strava rejects and tells the UI to reconnect', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const res = await getActivities();
    expect(res.status).toBe(409);
    expect(calls.forgotten).toBe(1);
  });

  it.each([
    [429, 503],
    [404, 502],
    [500, 502],
  ])('maps a Strava %i to our %i', async (upstream, ours) => {
    fetchMock.mockResolvedValue(new Response(null, { status: upstream }));
    expect((await getActivities()).status).toBe(ours);
  });

  it('answers 502 when Strava cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect((await getActivities()).status).toBe(502);
  });

  it('passes the activities through and never sends them our token back', async () => {
    fetchMock.mockResolvedValue(Response.json([{ id: 1, name: 'Fixture Run' }]));
    const res = await getActivities();
    expect(await res.json()).toEqual([{ id: 1, name: 'Fixture Run' }]);
  });
});

describe('/api/strava/connection', () => {
  const get = () => connection(new Request('https://fitreadyiq.test/api/strava/connection'));
  const del = () =>
    disconnect(new Request('https://fitreadyiq.test/api/strava/connection', { method: 'DELETE' }));

  it('refuses a caller with no account', async () => {
    state.signedIn = false;
    expect((await get()).status).toBe(401);
    expect((await del()).status).toBe(401);
    expect(calls.deleted).toBe(0);
  });

  it('reports the connection without any credential', async () => {
    const res = await get();
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ connected: true, athleteId: 42 });
    expect(text).not.toMatch(/token/i);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('reports not connected as a state, not an error', async () => {
    state.connected = false;
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).connected).toBe(false);
  });

  it('disconnects, audits it, and is honest that Strava still holds the grant', async () => {
    const res = await del();
    const body = await res.json();

    expect(calls.deleted).toBe(1);
    expect(calls.audits).toEqual(['strava.disconnect']);
    expect(body.connected).toBe(false);
    expect(body.note).toMatch(/Strava settings/);
  });

  it('is metered', async () => {
    state.limited = true;
    expect((await del()).status).toBe(429);
    expect(calls.deleted).toBe(0);
  });
});
