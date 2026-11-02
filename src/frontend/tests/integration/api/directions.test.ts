import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/directions/route';

/**
 * Routing on OSRM. What matters is that a mode routes on the right profile,
 * that "no path joins these points" stays distinct from "the router is down",
 * and that a figure the router did not report stays null.
 */

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

const ZERMATT = { lat: 46.0207, lng: 7.7491 };
const RIFFELALP = { lat: 45.9945, lng: 7.7586 };

const request = (body: unknown) =>
  new Request('http://localhost/api/directions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

function upstream(response: Response | (() => never)) {
  const fetchMock = vi.fn(async (_url: string | URL) =>
    typeof response === 'function' ? response() : response
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ok = (route: Record<string, unknown>) => Response.json({ code: 'Ok', routes: [route] });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/directions', () => {
  it('returns the polyline, km and seconds, and caches at the edge', async () => {
    upstream(ok({ geometry: 'abc', distance: 9559.9, duration: 8343.4 }));
    const res = await POST(request({ origin: ZERMATT, destination: RIFFELALP }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.polyline).toBe('abc');
    expect(body.distanceKm).toBeCloseTo(9.5599, 6);
    expect(body.durationSeconds).toBe(8343);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage');
  });

  it('asks the foot profile by default, in lng,lat order, through every stop', async () => {
    const fetchMock = upstream(ok({ geometry: 'abc', distance: 1, duration: 1 }));
    await POST(
      request({ origin: ZERMATT, intermediates: [{ lat: 46, lng: 7.75 }], destination: RIFFELALP })
    );
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/^https:\/\/routing\.openstreetmap\.de\/routed-foot\/route\/v1\/driving\//);
    expect(url).toContain('7.7491,46.0207;7.75,46;7.7586,45.9945?');
  });

  it.each([
    ['BICYCLE', 'routed-bike'],
    ['DRIVE', 'routed-car'],
    ['WALK', 'routed-foot'],
    ['TELEPORT', 'routed-foot'],
  ])('routes %s on %s', async (mode, profile) => {
    const fetchMock = upstream(ok({ geometry: 'abc', distance: 1, duration: 1 }));
    await POST(request({ origin: ZERMATT, destination: RIFFELALP, mode }));
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/${profile}/`);
  });

  it('honours ROUTING_API_URL', async () => {
    vi.stubEnv('ROUTING_API_URL', 'https://osrm.example.com/');
    const fetchMock = upstream(ok({ geometry: 'abc', distance: 1, duration: 1 }));
    await POST(request({ origin: ZERMATT, destination: RIFFELALP }));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /^https:\/\/osrm\.example\.com\/routed-foot\//
    );
  });

  it('keeps a missing distance or duration null, never zero', async () => {
    upstream(ok({ geometry: 'abc' }));
    const body = await (await POST(request({ origin: ZERMATT, destination: RIFFELALP }))).json();
    expect(body).toMatchObject({ distanceKm: null, durationSeconds: null });
  });

  it('says there is no route when OSRM finds none', async () => {
    upstream(Response.json({ code: 'NoRoute', message: 'Impossible route' }, { status: 400 }));
    const res = await POST(request({ origin: ZERMATT, destination: RIFFELALP }));
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe('no_route');
  });

  it('names a busy public server separately from an outage', async () => {
    upstream(new Response('Too Many Requests', { status: 429 }));
    const busy = await POST(request({ origin: ZERMATT, destination: RIFFELALP }));
    expect((await busy.json()).reason).toBe('busy');

    upstream(new Response('Bad Gateway', { status: 502 }));
    const down = await POST(request({ origin: ZERMATT, destination: RIFFELALP }));
    expect(down.status).toBe(502);
    expect((await down.json()).reason).toBe('upstream');
  });

  it('reports a timeout as one', async () => {
    upstream(() => {
      throw new DOMException('aborted', 'AbortError');
    });
    const res = await POST(request({ origin: ZERMATT, destination: RIFFELALP }));
    expect(res.status).toBe(504);
    expect((await res.json()).reason).toBe('timeout');
  });

  it.each([
    ['no body', 'not json'],
    ['no destination', { origin: ZERMATT }],
    ['out of range', { origin: { lat: 91, lng: 0 }, destination: RIFFELALP }],
  ])('rejects %s with 400 and calls nothing', async (_label, body) => {
    const fetchMock = upstream(ok({ geometry: 'abc' }));
    const res = await POST(request(body));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caps intermediate stops', async () => {
    const fetchMock = upstream(ok({ geometry: 'abc', distance: 1, duration: 1 }));
    const many = Array.from({ length: 100 }, (_, i) => ({ lat: 46 + i / 1000, lng: 7.75 }));
    await POST(request({ origin: ZERMATT, intermediates: many, destination: RIFFELALP }));
    const coords = String(fetchMock.mock.calls[0][0]).split('/driving/')[1].split('?')[0];
    expect(coords.split(';')).toHaveLength(27);
  });
});
