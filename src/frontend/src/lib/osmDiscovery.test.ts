import { describe, expect, it } from 'vitest';

import {
  PHOTON_QUERIES,
  campsiteFromPhoton,
  commonsFileUrl,
  commonsPhoto,
  commonsUrlFromWikidata,
  fromMercator,
  mountainFromPhoton,
  nearestFirst,
  parseOsmMetres,
  photonReverseUrl,
  routeFromWaymarked,
  toMercator,
  uniqueById,
  waymarkedBbox,
  wikidataId,
  withElevations,
  withWikidataPhotos,
  worthClimbing,
  type PhotonPlace,
} from './osmDiscovery';

describe('Web Mercator', () => {
  it('round-trips a point', () => {
    const [lng, lat] = fromMercator(...toMercator(7.75, 46.02));
    expect(lng).toBeCloseTo(7.75, 6);
    expect(lat).toBeCloseTo(46.02, 6);
  });

  it('builds a box around the point, west/south first', () => {
    const [x1, y1, x2, y2] = waymarkedBbox(46.02, 7.75).split(',').map(Number);
    const [cx, cy] = toMercator(7.75, 46.02);
    expect(x1).toBeLessThan(cx);
    expect(x2).toBeGreaterThan(cx);
    expect(y1).toBeLessThan(cy);
    expect(y2).toBeGreaterThan(cy);
  });
});

describe('parseOsmMetres', () => {
  it('reads plain and suffixed metres', () => {
    expect(parseOsmMetres('4478')).toBe(4478);
    expect(parseOsmMetres('4478 m')).toBe(4478);
    expect(parseOsmMetres('2926.5')).toBe(2927);
  });

  it('converts feet', () => {
    expect(parseOsmMetres('14692 ft')).toBe(4478);
    expect(parseOsmMetres("1000'")).toBe(305);
  });

  it('treats anything it cannot read as unknown, not zero', () => {
    expect(parseOsmMetres(undefined)).toBeNull();
    expect(parseOsmMetres('')).toBeNull();
    expect(parseOsmMetres('approx 3000')).toBeNull();
    expect(parseOsmMetres('2000-2500')).toBeNull();
  });
});

describe('photos', () => {
  it('takes a Commons file named on the object', () => {
    expect(commonsPhoto({ wikimedia_commons: 'File:Matterhorn from Domhütte.jpg' })).toBe(
      commonsFileUrl('Matterhorn from Domhütte.jpg')
    );
  });

  it('accepts an image tag only when it points at Commons', () => {
    expect(
      commonsPhoto({ image: 'https://commons.wikimedia.org/wiki/File:Pulag%20summit.jpg' })
    ).toBe(commonsFileUrl('Pulag summit.jpg'));
    expect(commonsPhoto({ image: 'https://example.com/peak.jpg' })).toBeNull();
  });

  it('ignores a Commons category, which is not a picture', () => {
    expect(commonsPhoto({ wikimedia_commons: 'Category:Matterhorn' })).toBeNull();
  });

  it('builds a sized, https Commons URL with underscores', () => {
    expect(commonsFileUrl('A b.jpg')).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/A_b.jpg?width=800'
    );
  });

  it("reads Wikidata's P18 value", () => {
    expect(
      commonsUrlFromWikidata(
        'http://commons.wikimedia.org/wiki/Special:FilePath/Matterhorn%20from%20Domh%C3%BCtte.jpg'
      )
    ).toBe(commonsFileUrl('Matterhorn from Domhütte.jpg'));
    expect(commonsUrlFromWikidata('http://example.com/x.jpg')).toBeNull();
  });

  it('accepts only item ids from the wikidata tag', () => {
    expect(wikidataId({ wikidata: 'Q1374' })).toBe('Q1374');
    expect(wikidataId({ wikidata: 'Q1374;Q5' })).toBeNull();
    expect(wikidataId({})).toBeNull();
  });
});

describe('routeFromWaymarked', () => {
  const [x, y] = toMercator(7.84, 46.11);
  const details = {
    id: 1610155,
    name: 'Swiss Tour Monte Rosa',
    bbox: [x - 1000, y - 1000, x + 1000, y + 1000],
    tags: { ascent: '4000' },
    route: { length: 55_893 },
  };

  it('uses the mapped length, in km, and the ascent tag', () => {
    const route = routeFromWaymarked(details, 'hiking')!;
    expect(route.distance_km).toBe(55.9);
    expect(route.elevation_gain_m).toBe(4000);
    expect(route.difficulty).toBe('challenging');
    expect(route.activity_type).toBe('hike');
    expect(route.place_id).toBe('osm:relation/1610155');
    expect(route.coordinates[0]).toBeCloseTo(7.84, 5);
    expect(route.coordinates[1]).toBeCloseTo(46.11, 5);
  });

  it('leaves the climb unknown, and so the route unrated, without an ascent tag', () => {
    const route = routeFromWaymarked({ ...details, tags: {} }, 'hiking')!;
    expect(route.distance_km).toBe(55.9);
    expect(route.elevation_gain_m).toBeNull();
    expect(route.difficulty).toBe('unknown');
  });

  it('reports a missing length as unknown, never zero', () => {
    expect(routeFromWaymarked({ ...details, route: {} }, 'hiking')!.distance_km).toBeNull();
  });

  it('marks mountain-bike routes as bike', () => {
    expect(routeFromWaymarked(details, 'mtb')!.activity_type).toBe('bike');
  });

  it('drops a route with no name or no box', () => {
    expect(routeFromWaymarked({ ...details, name: ' ' }, 'hiking')).toBeNull();
    expect(routeFromWaymarked({ ...details, bbox: undefined }, 'hiking')).toBeNull();
  });
});

describe('Photon places', () => {
  const peak: PhotonPlace = {
    geometry: { coordinates: [7.6586, 45.9764] },
    properties: { osm_type: 'N', osm_id: 26863664, osm_value: 'peak', name: 'Matterhorn' },
  };

  it('asks for one tag, within a radius, nearest first', () => {
    const url = new URL(photonReverseUrl(46, 7.8, PHOTON_QUERIES.campsites));
    expect(url.searchParams.get('osm_tag')).toBe('tourism:camp_site');
    expect(url.searchParams.get('radius')).toBe('40');
    expect(url.searchParams.get('lat')).toBe('46');
    expect(url.searchParams.get('lon')).toBe('7.8');
  });

  it('makes a summit whose height is unknown until the terrain lookup fills it', () => {
    const m = mountainFromPhoton(peak)!;
    expect(m).toMatchObject({
      id: 'osm-node-26863664',
      name: 'Matterhorn',
      coordinates: [7.6586, 45.9764],
      place_id: 'osm:node/26863664',
      elevation_m: null,
      mountain_type: 'peak',
    });
    expect(m.summit_elevation).toBeUndefined();
  });

  it('marks a volcano as one', () => {
    const m = mountainFromPhoton({
      ...peak,
      properties: { ...peak.properties, osm_value: 'volcano', name: 'Taal' },
    })!;
    expect(m.mountain_type).toBe('volcano');
  });

  it('fills heights in order and leaves a failed lookup unknown', () => {
    const a = mountainFromPhoton(peak)!;
    const b = mountainFromPhoton({
      ...peak,
      properties: { ...peak.properties, osm_id: 2, name: 'Dent Blanche' },
    })!;
    const [ha, hb] = withElevations([a, b], [4432, null]);
    expect(ha).toMatchObject({ elevation_m: 4432, summit_elevation: 4432 });
    expect(hb.elevation_m).toBeNull();
  });

  it('makes a campsite from a way, without inventing amenities', () => {
    const camp = campsiteFromPhoton({
      geometry: { coordinates: [7.75, 46.03] },
      properties: { osm_type: 'W', osm_id: 569323858, name: 'Camping Zermatt' },
    })!;
    expect(camp).toMatchObject({
      id: 'osm-way-569323858',
      place_id: 'osm:way/569323858',
      type: 'campground',
      amenities: [],
    });
  });

  it('drops a place with no name, no point or no OSM identity', () => {
    expect(
      mountainFromPhoton({ ...peak, properties: { ...peak.properties, name: '' } })
    ).toBeNull();
    expect(mountainFromPhoton({ ...peak, geometry: undefined })).toBeNull();
    expect(
      campsiteFromPhoton({ ...peak, properties: { name: 'Somewhere', osm_type: 'X', osm_id: 1 } })
    ).toBeNull();
  });

  it('drops a known molehill but keeps a summit of unknown height', () => {
    const m = mountainFromPhoton(peak)!;
    expect(worthClimbing({ ...m, elevation_m: 6 })).toBe(false);
    expect(worthClimbing({ ...m, elevation_m: 332 })).toBe(true);
    expect(worthClimbing({ ...m, elevation_m: null })).toBe(true);
  });

  it('keeps the first of two results for the same object', () => {
    expect(
      uniqueById([
        { id: 'a', n: 1 },
        { id: 'b', n: 2 },
        { id: 'a', n: 3 },
      ])
    ).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
  });
});

describe('nearestFirst', () => {
  it('orders by distance and caps', () => {
    const items = [
      { name: 'far', coordinates: [8, 47] as [number, number] },
      { name: 'near', coordinates: [7.71, 46.01] as [number, number] },
      { name: 'mid', coordinates: [7.8, 46.1] as [number, number] },
    ];
    expect(nearestFirst(items, 46, 7.7, 2).map((i) => i.name)).toEqual(['near', 'mid']);
  });
});

describe('withWikidataPhotos', () => {
  it('fills a photo only where none exists', () => {
    const items = [
      { place_id: 'osm:node/1', photos: [] },
      { place_id: 'osm:node/2', photos: ['https://commons.wikimedia.org/own.jpg'] },
      { place_id: 'osm:node/3', photos: [] },
    ];
    const byPlace = new Map([
      ['osm:node/1', 'Q1'],
      ['osm:node/2', 'Q2'],
    ]);
    const images = new Map([
      ['Q1', 'https://commons.wikimedia.org/one.jpg'],
      ['Q2', 'https://commons.wikimedia.org/two.jpg'],
    ]);
    expect(withWikidataPhotos(items, byPlace, images).map((i) => i.photos)).toEqual([
      ['https://commons.wikimedia.org/one.jpg'],
      ['https://commons.wikimedia.org/own.jpg'],
      [],
    ]);
  });
});
