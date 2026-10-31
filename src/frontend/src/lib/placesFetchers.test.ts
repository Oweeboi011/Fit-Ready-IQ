import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The invariant this file exists for: a trail is the same trail whoever looks
 * at it. Length and difficulty used to be derived from the distance between
 * the *viewer* and the pin, so moving across town changed how long and how
 * hard a trail was — and through the shared cache, every visitor to a region
 * saw the numbers of whoever loaded it first.
 *
 * Google is stubbed at the module boundary; the pipeline under test is real.
 */

const place = (id: string, lat: number, lng: number, name: string) => ({
  place_id: id,
  name,
  types: ['park'],
  geometry: { location: { lat: () => lat, lng: () => lng } },
});

const PLACES = [
  place('p1', 37.9, -122.6, 'Dipsea Trail'),
  place('p2', 37.92, -122.58, 'Matt Davis Trail'),
];

vi.mock('@/lib/placesSearch', () => ({
  newPlacesService: () => ({}),
  textSearchPaged: async (
    _service: unknown,
    _query: string,
    _location: unknown,
    _radius: number,
    push: (r: unknown[]) => void
  ) => push(PLACES),
  textSearchOnce: async () => PLACES,
  nearbySearchOnce: async () => [],
  dedupedPlacesCollector: () => {
    const all: { place_id: string }[] = [];
    const seen = new Set<string>();
    return {
      all,
      push: (rs: { place_id: string }[]) => {
        for (const r of rs) if (!seen.has(r.place_id)) (seen.add(r.place_id), all.push(r));
      },
    };
  },
}));

const elevationCalls: unknown[][] = [];
vi.mock('@/lib/mapsGeometry', () => ({
  fetchElevations: async (locations: unknown[]) => {
    elevationCalls.push(locations);
    return { values: locations.map((_, i) => 100 + i * 10), failed: false };
  },
}));

beforeEach(() => {
  elevationCalls.length = 0;
});

async function routesSeenFrom(userCoords: [number, number]) {
  const { fetchRoutesNearby } = await import('./placesFetchers');
  return (await fetchRoutesNearby(userCoords)).data;
}

describe('fetchRoutesNearby', () => {
  it('gives the same trail the same length and difficulty from anywhere', async () => {
    const fromNearby = await routesSeenFrom([-122.59, 37.91]);
    const fromFarAway = await routesSeenFrom([-121.0, 36.5]);

    const summary = (r: { name: string; distance_km: number | null; difficulty: string }) => ({
      name: r.name,
      distance_km: r.distance_km,
      difficulty: r.difficulty,
    });
    expect(fromFarAway.map(summary)).toEqual(fromNearby.map(summary));
  });

  it('reports no length for a Places pin, and so no difficulty band', async () => {
    const [route] = await routesSeenFrom([-122.59, 37.91]);
    expect(route.distance_km).toBeNull();
    expect(route.difficulty).toBe('unknown');
  });

  it('still measures relief near the trailhead', async () => {
    const [route] = await routesSeenFrom([-122.59, 37.91]);
    expect(route.elevation_gain_m).not.toBeNull();
  });
});

describe('fetchMountainsNearby', () => {
  it('reports only what was measured: no invented prominence, jump-off or class', async () => {
    const { fetchMountainsNearby } = await import('./placesFetchers');
    PLACES.push(place('p3', 37.923, -122.596, 'Mount Tamalpais'));
    const { data } = await fetchMountainsNearby([-122.59, 37.91]);
    PLACES.pop();

    const peak = data.find((m) => m.name === 'Mount Tamalpais');
    expect(peak).toBeDefined();
    expect(peak!.elevation_m).not.toBeNull();
    expect(peak).not.toHaveProperty('prominence_m');
    expect(peak).not.toHaveProperty('jumpoff_elevation');
    expect(peak).not.toHaveProperty('trail_class');
  });
});
