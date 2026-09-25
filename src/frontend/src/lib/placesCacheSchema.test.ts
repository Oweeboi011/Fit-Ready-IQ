import { describe, expect, it } from 'vitest';

import {
  MAX_ITEMS_PER_KIND,
  parseCampsite,
  parseList,
  parseMountain,
  parseRoute,
} from './placesCacheSchema';

/** Shapes copied from what placesFetchers.ts actually builds. */
const route = {
  id: 'r1',
  name: 'Dipsea Trail',
  coordinates: [-122.6, 37.9],
  distance_km: 7.4,
  elevation_gain_m: 640,
  difficulty: 'moderate',
  activity_type: 'hike',
  place_id: 'ChIJ-route',
  photos: [],
  jumpoff_elevation: 12,
  summit_elevation: 652,
};

const mountain = {
  id: 'm1',
  name: 'Mount Tamalpais',
  coordinates: [-122.596, 37.923],
  elevation_m: 784,
  trail_class: 'Class 1',
  mountain_type: 'peak',
  place_id: 'ChIJ-peak',
  photos: [],
  summit_elevation: 784,
};

const campsite = {
  id: 'c1',
  name: 'Pantoll Campground',
  coordinates: [-122.604, 37.904],
  type: 'campground',
  rating: 4.4,
  amenities: [],
  place_id: 'ChIJ-camp',
  photos: [],
};

describe('what an honest client writes', () => {
  it('accepts each kind unchanged', () => {
    expect(parseRoute(route)).toEqual(route);
    expect(parseMountain(mountain)).toEqual(mountain);
    expect(parseCampsite(campsite)).toEqual(campsite);
  });

  it('accepts an unknown elevation, which the app records as null', () => {
    expect(parseRoute({ ...route, elevation_gain_m: null })).not.toBeNull();
    expect(parseMountain({ ...mountain, elevation_m: null })).not.toBeNull();
  });

  it('accepts optional fields being absent', () => {
    const {
      place_id: _p,
      photos: _ph,
      jumpoff_elevation: _j,
      summit_elevation: _s,
      ...bare
    } = route;
    expect(parseRoute(bare)).toEqual(bare);
  });
});

describe('what never reaches the shared cache', () => {
  it('drops fields the app does not write, rather than storing them', () => {
    const parsed = parseRoute({ ...route, injected: '<script>', __proto__polluted: 1 });
    expect(parsed).not.toHaveProperty('injected');
    expect(parsed).not.toHaveProperty('__proto__polluted');
  });

  it("drops the writer's distance-from-user, which is wrong for every reader", () => {
    expect(parseRoute({ ...route, distance_from_user_km: 3.2 })).not.toHaveProperty(
      'distance_from_user_km'
    );
  });

  it('drops strava_segment, which nothing legitimately writes', () => {
    const forged = { id: 's', name: 'KOM', distance: 1, avg_grade: 5, kom_time: '1:00' };
    expect(parseRoute({ ...route, strava_segment: forged })).not.toHaveProperty('strava_segment');
  });

  it.each([
    ['an impossible elevation', { elevation_m: 20_000 }],
    ['a non-finite elevation', { elevation_m: Number.POSITIVE_INFINITY }],
    ['a string for a number', { elevation_m: '784' }],
    ['an empty name', { name: '   ' }],
    ['an oversized name', { name: 'x'.repeat(201) }],
    ['coordinates off the globe', { coordinates: [200, 37] }],
    ['coordinates in the wrong shape', { coordinates: { lat: 37, lng: -122 } }],
    ['a non-https photo', { photos: ['javascript:alert(1)'] }],
    ['too many photos', { photos: Array.from({ length: 11 }, () => 'https://x.test/p.jpg') }],
  ])('refuses a mountain with %s', (_label, change) => {
    expect(parseMountain({ ...mountain, ...change })).toBeNull();
  });

  it.each([
    ['an invented difficulty', { difficulty: 'extreme' }],
    ['a negative distance', { distance_km: -1 }],
    ['a thousand-kilometre walk', { distance_km: 5000 }],
    ['a missing activity type', { activity_type: undefined }],
    ['an oversized polyline', { polyline: Array.from({ length: 2001 }, () => [0, 0]) }],
  ])('refuses a route with %s', (_label, change) => {
    expect(parseRoute({ ...route, ...change })).toBeNull();
  });

  it('refuses a campsite rated above five stars', () => {
    expect(parseCampsite({ ...campsite, rating: 6 })).toBeNull();
  });

  it('refuses things that are not objects at all', () => {
    for (const junk of [null, 'route', 42, [route]]) {
      expect(parseRoute(junk)).toBeNull();
    }
  });
});

describe('parseList', () => {
  it('parses a list of valid items', () => {
    expect(parseList([route, route], parseRoute)).toHaveLength(2);
  });

  it('fails the whole list when one item is bad', () => {
    expect(parseList([route, { ...route, difficulty: 'extreme' }], parseRoute)).toBeNull();
  });

  it('refuses a list longer than the cap', () => {
    const tooMany = Array.from({ length: MAX_ITEMS_PER_KIND + 1 }, () => campsite);
    expect(parseList(tooMany, parseCampsite)).toBeNull();
  });

  it('refuses something that is not a list', () => {
    expect(parseList({ 0: route }, parseRoute)).toBeNull();
  });
});
