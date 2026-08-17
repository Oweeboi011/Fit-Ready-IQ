import { describe, expect, it } from 'vitest';

import { isSearchable, MIN_QUERY_LENGTH, toSearchResults } from './usePlaceSearch';

/**
 * The debounce and cancellation are timing behaviour exercised by the component;
 * these cover the two pure decisions — whether a query is worth a billable call,
 * and which results are fit to show.
 */

type Place = google.maps.places.PlaceResult;

/** A PlaceResult with just the fields the mapper reads. */
function place(overrides: Partial<Place> & { lat?: number; lng?: number }): Place {
  const { lat, lng, ...rest } = overrides;
  return {
    geometry:
      lat == null || lng == null
        ? undefined
        : ({ location: { lat: () => lat, lng: () => lng } } as Place['geometry']),
    ...rest,
  } as Place;
}

describe('isSearchable', () => {
  it('refuses a query too short to be worth a billable call', () => {
    expect(isSearchable('')).toBe(false);
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable('ab')).toBe(false);
  });

  it('accepts a query at the threshold', () => {
    expect('abc'.length).toBe(MIN_QUERY_LENGTH);
    expect(isSearchable('abc')).toBe(true);
  });

  it('ignores surrounding whitespace, so spaces alone never trigger a search', () => {
    expect(isSearchable('   ')).toBe(false);
    expect(isSearchable('  ab  ')).toBe(false);
    expect(isSearchable('  abc  ')).toBe(true);
  });
});

describe('toSearchResults', () => {
  it('maps name, address and coordinates in [lng, lat] order', () => {
    const results = toSearchResults([
      place({
        place_id: 'p1',
        name: 'Mount Pulag',
        formatted_address: 'Benguet, Philippines',
        lat: 16.5964,
        lng: 120.8974,
      }),
    ]);

    expect(results).toEqual([
      {
        id: 'p1',
        name: 'Mount Pulag',
        address: 'Benguet, Philippines',
        // GeoJSON order, as everywhere else in this app.
        coordinates: [120.8974, 16.5964],
      },
    ]);
  });

  it('falls back to vicinity when there is no formatted address', () => {
    const [result] = toSearchResults([
      place({ place_id: 'p1', name: 'Trailhead', vicinity: 'Nuvali', lat: 14, lng: 121 }),
    ]);
    expect(result.address).toBe('Nuvali');
  });

  it('reports a missing address as null rather than an empty string', () => {
    const [result] = toSearchResults([place({ place_id: 'p1', name: 'Peak', lat: 14, lng: 121 })]);
    expect(result.address).toBeNull();
  });

  it('drops a result with no coordinates — it could never be planned to', () => {
    expect(toSearchResults([place({ place_id: 'p1', name: 'Nowhere' })])).toEqual([]);
  });

  it('drops a result with no name rather than rendering a blank row', () => {
    expect(toSearchResults([place({ place_id: 'p1', lat: 14, lng: 121 })])).toEqual([]);
  });

  it('synthesises an id when Google omits place_id, so React keys stay unique', () => {
    const results = toSearchResults([
      place({ name: 'A', lat: 1, lng: 2 }),
      place({ name: 'B', lat: 3, lng: 4 }),
    ]);
    expect(results[0].id).not.toBe(results[1].id);
  });

  it('caps the list, because more than a screenful is not a shortlist', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      place({ place_id: `p${i}`, name: `Peak ${i}`, lat: i, lng: i })
    );
    expect(toSearchResults(many)).toHaveLength(6);
    expect(toSearchResults(many, 3)).toHaveLength(3);
  });

  it('keeps Google’s ordering, which is its relevance ranking', () => {
    const results = toSearchResults([
      place({ place_id: 'first', name: 'Closest', lat: 1, lng: 1 }),
      place({ place_id: 'second', name: 'Further', lat: 2, lng: 2 }),
    ]);
    expect(results.map((r) => r.id)).toEqual(['first', 'second']);
  });

  it('handles an empty response', () => {
    expect(toSearchResults([])).toEqual([]);
  });
});
