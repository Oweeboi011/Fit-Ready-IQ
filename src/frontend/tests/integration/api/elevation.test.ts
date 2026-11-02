import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, MAX_POINTS } from '@/app/api/elevation/route';

/**
 * The route's job is to keep "unknown" unknown: a null from upstream stays
 * null, and a quota or outage is a 502 the client can say out loud — never a
 * response full of zeros that would read as sea-level terrain.
 */

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

const request = (locations: string | null) =>
  new NextRequest(
    `http://localhost/api/elevation${locations === null ? '' : `?locations=${encodeURIComponent(locations)}`}`
  );

function upstream(response: Response) {
  const fetchMock = vi.fn(async (_url: string) => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GET /api/elevation', () => {
  it('returns rounded elevations in request order, keeping nulls', async () => {
    upstream(Response.json({ results: [{ elevation: 1234.6 }, { elevation: null }] }));
    const res = await GET(request('46.5,7.9|0,-30'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ values: [1235, null] });
    expect(res.headers.get('Cache-Control')).toContain('s-maxage');
  });

  it('asks the public OpenTopoData endpoint by default', async () => {
    const fetchMock = upstream(Response.json({ results: [{ elevation: 1 }] }));
    await GET(request('1,2'));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /^https:\/\/api\.opentopodata\.org\/v1\/mapzen\?locations=/
    );
  });

  it('honours ELEVATION_API_URL', async () => {
    vi.stubEnv('ELEVATION_API_URL', 'https://elevation.example.com/v1/srtm30m');
    const fetchMock = upstream(Response.json({ results: [{ elevation: 1 }] }));
    await GET(request('1,2'));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/elevation\.example\.com\//);
  });

  it.each([
    ['missing', null],
    ['not a pair', '46.5'],
    ['not numbers', 'a,b'],
    ['out of range', '91,0'],
    ['too many points', Array.from({ length: MAX_POINTS + 1 }, () => '1,1').join('|')],
  ])('rejects %s locations with 400', async (_label, locations) => {
    const fetchMock = upstream(Response.json({ results: [] }));
    const res = await GET(request(locations));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('names an exhausted quota separately from an outage', async () => {
    upstream(new Response('Too many requests', { status: 429 }));
    const res = await GET(request('1,2'));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ reason: 'quota' });
  });

  it('treats a short answer as a failure, not as data', async () => {
    upstream(Response.json({ results: [{ elevation: 10 }] }));
    const res = await GET(request('1,2|3,4'));
    expect(res.status).toBe(502);
  });

  it('turns a network failure into a 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      })
    );
    const res = await GET(request('1,2'));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ reason: 'upstream' });
  });
});
