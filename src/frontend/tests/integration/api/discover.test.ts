import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/discover/route';
import { toMercator } from '@/lib/osmDiscovery';

/**
 * Discovery fans one request out to four volunteer-run services. What matters
 * is that each collection fails on its own and says so, that a partial answer
 * is never cached, and that nothing upstream is turned into a number it did
 * not state.
 */

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

const request = (query: string) => new NextRequest(`http://localhost/api/discover?${query}`);

const [x, y] = toMercator(7.8, 46);
const routeDetails = {
  id: 77,
  name: '5-Seenweg',
  bbox: [x - 500, y - 500, x + 500, y + 500],
  tags: { wikidata: 'Q42' },
  route: { length: 11_725 },
};

const peakFeature = {
  geometry: { coordinates: [7.81, 46.01] },
  properties: { osm_type: 'N', osm_id: 1, osm_value: 'peak', name: 'Hohtälli' },
};
const molehill = {
  geometry: { coordinates: [7.82, 46.02] },
  properties: { osm_type: 'N', osm_id: 2, osm_value: 'peak', name: 'The Mound' },
};
const campFeature = {
  geometry: { coordinates: [7.75, 46.03] },
  properties: { osm_type: 'W', osm_id: 3, osm_value: 'camp_site', name: 'Camping Zermatt' },
};

type Handler = (url: URL) => Response | Promise<Response>;

/** Routes each upstream call by host, so one service can be failed at a time. */
function upstreams(overrides: Partial<Record<string, Handler>> = {}) {
  const handlers: Record<string, Handler> = {
    'hiking.waymarkedtrails.org': (url) =>
      url.pathname.includes('/list/')
        ? Response.json({ results: [{ id: 77 }] })
        : Response.json(routeDetails),
    'mtb.waymarkedtrails.org': () => Response.json({ results: [] }),
    'photon.komoot.io': (url) =>
      Response.json({
        features:
          url.searchParams.get('osm_tag') === 'natural:peak'
            ? [peakFeature, molehill]
            : url.searchParams.get('osm_tag') === 'tourism:camp_site'
              ? [campFeature]
              : [],
      }),
    'api.opentopodata.org': () =>
      Response.json({ results: [{ elevation: 3263.4 }, { elevation: 6 }] }),
    'query.wikidata.org': () =>
      Response.json({
        results: {
          bindings: [
            {
              item: { value: 'http://www.wikidata.org/entity/Q42' },
              image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Lake.jpg' },
            },
          ],
        },
      }),
    ...overrides,
  };
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const handler = handlers[url.host];
    if (!handler) throw new Error(`unexpected upstream ${url.host}`);
    return handler(url);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/discover', () => {
  it('returns all three collections and caches a complete answer at the edge', async () => {
    upstreams();
    const res = await GET(request('lat=46.02&lng=7.75'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.failed).toEqual([]);
    expect(body.routes).toEqual([
      expect.objectContaining({
        name: '5-Seenweg',
        distance_km: 11.7,
        elevation_gain_m: null,
        difficulty: 'unknown',
        photos: ['https://commons.wikimedia.org/wiki/Special:FilePath/Lake.jpg?width=800'],
      }),
    ]);
    // Height from the terrain model; the 6 m mound is dropped as a molehill.
    expect(body.mountains).toEqual([
      expect.objectContaining({ name: 'Hohtälli', elevation_m: 3263, summit_elevation: 3263 }),
    ]);
    expect(body.campsites).toEqual([expect.objectContaining({ name: 'Camping Zermatt' })]);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=604800');
  });

  it('asks upstream for the rounded 0.1° cell, so one CDN entry serves it', async () => {
    const fetchMock = upstreams();
    await GET(request('lat=46.04&lng=7.76'));
    const photon = fetchMock.mock.calls
      .map(([u]) => new URL(String(u)))
      .find((u) => u.host === 'photon.komoot.io')!;
    expect(photon.searchParams.get('lat')).toBe('46');
    expect(photon.searchParams.get('lon')).toBe('7.8');
  });

  it('reports a failed collection by name and does not cache the gap', async () => {
    upstreams({ 'photon.komoot.io': () => new Response('busy', { status: 503 }) });
    const res = await GET(request('lat=46&lng=7.8'));
    const body = await res.json();

    expect(body.failed).toEqual(['mountains', 'campsites']);
    expect(body.mountains).toEqual([]);
    expect(body.routes).toHaveLength(1);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('fails routes only when both route sources are down', async () => {
    upstreams({
      'hiking.waymarkedtrails.org': () => new Response('down', { status: 502 }),
      'mtb.waymarkedtrails.org': () => new Response('down', { status: 502 }),
    });
    const body = await (await GET(request('lat=46&lng=7.8'))).json();
    expect(body.failed).toEqual(['routes']);
  });

  it('keeps summits with an unknown height when the terrain lookup fails', async () => {
    upstreams({ 'api.opentopodata.org': () => new Response('quota', { status: 429 }) });
    const body = await (await GET(request('lat=46&lng=7.8'))).json();
    expect(body.failed).toEqual([]);
    expect(body.mountains.map((m: { elevation_m: number | null }) => m.elevation_m)).toEqual([
      null,
      null,
    ]);
  });

  it('ships places without photos when Wikidata is down', async () => {
    upstreams({ 'query.wikidata.org': () => new Response('down', { status: 500 }) });
    const body = await (await GET(request('lat=46&lng=7.8'))).json();
    expect(body.failed).toEqual([]);
    expect(body.routes[0].photos).toEqual([]);
  });

  it.each([
    ['missing', ''],
    ['not numbers', 'lat=a&lng=b'],
    ['out of range', 'lat=91&lng=0'],
    ['blank', 'lat=&lng=7'],
  ])('rejects %s coordinates with 400 and calls nothing', async (_label, query) => {
    const fetchMock = upstreams();
    const res = await GET(request(query));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
