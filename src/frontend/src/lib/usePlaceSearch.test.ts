import { describe, expect, it } from 'vitest';

import {
  isSearchable,
  MIN_QUERY_LENGTH,
  toSearchResults,
  type PhotonFeature,
} from './usePlaceSearch';

/**
 * The debounce and cancellation are timing behaviour exercised by the component;
 * these cover the two pure decisions — whether a query is worth a request, and
 * which results are fit to show.
 */

/** A Photon feature with just the fields the mapper reads. */
function feature(
  properties: PhotonFeature['properties'],
  coordinates?: [number, number]
): PhotonFeature {
  return { geometry: coordinates ? { coordinates } : undefined, properties };
}

describe('isSearchable', () => {
  it('refuses a query too short to be worth a request', () => {
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
  it('maps name, place and coordinates, keeping GeoJSON [lng, lat] order', () => {
    const results = toSearchResults([
      feature(
        {
          osm_type: 'N',
          osm_id: 26863664,
          name: 'Matterhorn',
          city: 'Valtournenche',
          state: "Valle d'Aosta",
          country: 'Italia',
        },
        [7.6586, 45.9764]
      ),
    ]);

    expect(results).toEqual([
      {
        id: 'N26863664',
        name: 'Matterhorn',
        address: "Valtournenche, Valle d'Aosta, Italia",
        coordinates: [7.6586, 45.9764],
      },
    ]);
  });

  it('falls back to the county when there is no town', () => {
    const [result] = toSearchResults([
      feature({ name: 'Trailhead', county: 'Visp', country: 'Schweiz' }, [7.7, 46]),
    ]);
    expect(result.address).toBe('Visp, Schweiz');
  });

  it('reports a missing place as null rather than an empty string', () => {
    const [result] = toSearchResults([feature({ name: 'Peak' }, [121, 14])]);
    expect(result.address).toBeNull();
  });

  it('drops a result with no coordinates — it could never be planned to', () => {
    expect(toSearchResults([feature({ name: 'Nowhere' })])).toEqual([]);
  });

  it('drops a result with no name rather than rendering a blank row', () => {
    expect(toSearchResults([feature({ osm_type: 'N', osm_id: 1 }, [121, 14])])).toEqual([]);
  });

  it('synthesises an id when there is no OSM identity, so React keys stay unique', () => {
    const results = toSearchResults([
      feature({ name: 'A' }, [2, 1]),
      feature({ name: 'B' }, [4, 3]),
    ]);
    expect(results[0].id).not.toBe(results[1].id);
  });

  it('caps the list, because more than a screenful is not a shortlist', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      feature({ osm_type: 'N', osm_id: i + 1, name: `Peak ${i}` }, [i, i])
    );
    expect(toSearchResults(many)).toHaveLength(6);
    expect(toSearchResults(many, 3)).toHaveLength(3);
  });

  it("keeps Photon's ordering, which is its relevance ranking", () => {
    const results = toSearchResults([
      feature({ osm_type: 'N', osm_id: 1, name: 'Closest' }, [1, 1]),
      feature({ osm_type: 'N', osm_id: 2, name: 'Further' }, [2, 2]),
    ]);
    expect(results.map((r) => r.id)).toEqual(['N1', 'N2']);
  });

  it('handles an empty response', () => {
    expect(toSearchResults([])).toEqual([]);
  });
});
