import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchElevationAlongPath, fetchElevations, haversineKm, samplePath } from './mapsGeometry';

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  haversineKm([a.lng, a.lat], [b.lng, b.lat]);

describe('samplePath', () => {
  it('keeps the first and last points and returns exactly `count`', () => {
    const path = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
    ];
    const samples = samplePath(path, 5);
    expect(samples).toHaveLength(5);
    expect(samples[0]).toEqual(path[0]);
    expect(samples[4]).toEqual(path[1]);
  });

  it('spaces samples by distance, not by vertex', () => {
    // Nine vertices bunched in the first tenth, then one long straight.
    const path = [
      ...Array.from({ length: 9 }, (_, i) => ({ lat: 0, lng: i * 0.01 })),
      { lat: 0, lng: 1 },
    ];
    const samples = samplePath(path, 11);
    const gaps = samples.slice(1).map((s, i) => km(samples[i], s));
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    for (const gap of gaps) expect(gap).toBeCloseTo(mean, 1);
  });

  it('copes with a path of repeated points', () => {
    expect(
      samplePath(
        [
          { lat: 1, lng: 1 },
          { lat: 1, lng: 1 },
        ],
        3
      )
    ).toEqual([
      { lat: 1, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 1 },
    ]);
  });
});

describe('fetchElevations', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('splits into calls of 100, in order, and stitches the answers back', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const n = decodeURIComponent(url.split('locations=')[1]).split('|').length;
      return Response.json({ values: Array.from({ length: n }, (_, i) => i) });
    });
    vi.stubGlobal('fetch', fetchMock);
    const points = Array.from({ length: 250 }, (_, i) => ({ lat: 0, lng: i / 1000 }));
    const { values, failed } = await fetchElevations(points);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(values).toHaveLength(250);
    expect(failed).toBe(false);
  });

  it('reports failure as nulls, never zeros', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 502 }))
    );
    const { values, failed } = await fetchElevations([{ lat: 0, lng: 0 }]);
    expect(values).toEqual([null]);
    expect(failed).toBe(true);
  });

  it('returns nothing for an empty request without calling out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchElevations([])).toEqual({ values: [], failed: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchElevationAlongPath', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for evenly spaced samples along the route in a single call', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ values: Array.from({ length: 50 }, () => 100) })
    );
    vi.stubGlobal('fetch', fetchMock);
    const path = [
      { lat: 46, lng: 7 },
      { lat: 46.1, lng: 7.1 },
    ];
    const { values, failed } = await fetchElevationAlongPath(path, 50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(values).toHaveLength(50);
    expect(failed).toBe(false);
  });

  it('yields an empty, failed profile when the lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 502 }))
    );
    const result = await fetchElevationAlongPath(
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
      ],
      10
    );
    expect(result).toEqual({ values: [], failed: true });
  });
});
