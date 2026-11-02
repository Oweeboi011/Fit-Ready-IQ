import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/komoot/tour/route';

/**
 * The route reads an undocumented endpoint, so its job is mostly saying why it
 * could not: each failure has a `reason` the UI can put into words, and a
 * private tour's share token never reaches a shared cache.
 */

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

const request = (url: string) =>
  new NextRequest(`http://localhost/api/komoot/tour?url=${encodeURIComponent(url)}`);

const TOUR = {
  name: 'Ridge loop',
  sport: 'hike',
  distance: 5000,
  duration: 7200,
  elevation_up: 300,
  elevation_down: 300,
  _embedded: {
    coordinates: {
      items: [
        { lat: 46, lng: 7, alt: 1000 },
        { lat: 46.01, lng: 7, alt: 1300 },
      ],
    },
  },
};

function upstream(response: Response) {
  const fetchMock = vi.fn(async (_url: string) => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/komoot/tour', () => {
  it('returns the normalised route, CDN-cached for a public tour', async () => {
    const fetchMock = upstream(Response.json(TOUR));
    const res = await GET(request('https://www.komoot.com/tour/123456'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: '123456', name: 'Ridge loop', distanceKm: 5 });
    expect(res.headers.get('Cache-Control')).toContain('s-maxage');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /^https:\/\/api\.komoot\.de\/v007\/tours\/123456\?_embedded=coordinates$/
    );
  });

  it('forwards a share token and keeps the answer out of shared caches', async () => {
    const fetchMock = upstream(Response.json(TOUR));
    const res = await GET(request('https://www.komoot.com/tour/123456?share_token=abc123'));
    expect(String(fetchMock.mock.calls[0][0])).toContain('share_token=abc123');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it.each([
    ['https://example.com/tour/1', 'invalid'],
    ['https://www.komoot.com/smarttour/e1025815036', 'smarttour'],
  ])('rejects %s without calling Komoot', async (url, reason) => {
    const fetchMock = upstream(Response.json(TOUR));
    const res = await GET(request(url));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [403, 403, 'private'],
    [404, 404, 'not_found'],
    [500, 502, 'upstream'],
  ])('maps a Komoot %s to %s %s', async (upstreamStatus, status, reason) => {
    upstream(new Response('{}', { status: upstreamStatus }));
    const res = await GET(request('https://www.komoot.com/tour/123456'));
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ reason });
  });

  it('treats an unrecognisable tour as a failure, not an empty route', async () => {
    upstream(Response.json({ name: 'No track' }));
    const res = await GET(request('https://www.komoot.com/tour/123456'));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ reason: 'unreadable' });
  });

  it('turns a network failure into a 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      })
    );
    const res = await GET(request('https://www.komoot.com/tour/123456'));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ reason: 'upstream' });
  });
});
