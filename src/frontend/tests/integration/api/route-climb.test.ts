import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/route-climb/route';
import { toMercator } from '@/lib/osmDiscovery';

/**
 * A route's climb from terrain. What matters is that the number is only given
 * when the path was sampled closely and every height came back, that a route
 * which cannot be measured says why, and that only a stable answer is cached.
 */

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

const request = (query: string) => new NextRequest(`http://localhost/api/route-climb?${query}`);

/** A straight route north from Zermatt, `km` long. */
const details = (km: number) => ({
  route: {
    main: [
      {
        ways: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [toMercator(7.75, 46.0), toMercator(7.75, 46.0 + km / 111.2)],
            },
          },
        ],
      },
    ],
  },
});

/** Each sample a little higher than the last: 10 m per point. */
function terrain(url: URL) {
  const points = (url.searchParams.get('locations') ?? '').split('|');
  return Response.json({ results: points.map((_, i) => ({ elevation: 1600 + i * 10 })) });
}

function upstream(routeBody: unknown, heights: (url: URL) => Response = terrain) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    return url.host.includes('waymarkedtrails') ? Response.json(routeBody) : heights(url);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/route-climb', () => {
  it('measures a short route and holds the answer for a month', async () => {
    const fetchMock = upstream(details(1));
    const res = await GET(request('site=hiking&id=19449452'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.climbM).toBeGreaterThan(0);
    expect(body.descentM).toBe(0);
    expect(body.spacingM).toBe(50);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=2592000');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/details/relation/19449452');
  });

  it('says a route is too long rather than under-measuring it', async () => {
    upstream(details(120));
    const res = await GET(request('site=hiking&id=1'));
    expect(await res.json()).toEqual({ climbM: null, reason: 'too_long' });
    expect(res.headers.get('Cache-Control')).toContain('s-maxage');
  });

  it('says a route without a path has no geometry', async () => {
    upstream({ route: { main: [] } });
    expect((await (await GET(request('site=mtb&id=2'))).json()).reason).toBe('no_geometry');
  });

  it('gives no number when the terrain model has a hole', async () => {
    upstream(details(1), (url) => {
      const points = (url.searchParams.get('locations') ?? '').split('|');
      return Response.json({ results: points.map((_, i) => ({ elevation: i === 3 ? null : 1 })) });
    });
    expect((await (await GET(request('site=hiking&id=3'))).json()).reason).toBe('no_geometry');
  });

  it('reports a terrain quota as one, uncached', async () => {
    upstream(details(1), () => new Response('Too many', { status: 429 }));
    const res = await GET(request('site=hiking&id=4'));
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('quota');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('reports a failed route lookup as upstream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 }))
    );
    const res = await GET(request('site=hiking&id=5'));
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('upstream');
  });

  it.each(['site=walking&id=1', 'site=hiking&id=abc', 'site=hiking&id=-3', 'id=1'])(
    'refuses %s',
    async (query) => {
      expect((await GET(request(query))).status).toBe(400);
    }
  );
});
