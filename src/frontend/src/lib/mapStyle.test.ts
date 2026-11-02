import { describe, expect, it } from 'vitest';

import {
  boundsOf,
  circleBounds,
  firstSymbolLayerId,
  lineCollection,
  poiLayerIds,
} from './mapStyle';

describe('boundsOf', () => {
  it('boxes the points as [[west, south], [east, north]]', () => {
    expect(
      boundsOf([
        [7, 46],
        [8.5, 45.5],
        [7.5, 47],
      ])
    ).toEqual([
      [7, 45.5],
      [8.5, 47],
    ]);
  });

  it('skips non-finite points instead of poisoning the box', () => {
    expect(
      boundsOf([
        [NaN, 46],
        [7, Infinity],
        [7, 46],
      ])
    ).toEqual([
      [7, 46],
      [7, 46],
    ]);
  });

  it('is null when there is nothing to frame', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([[NaN, NaN]])).toBeNull();
  });
});

describe('circleBounds', () => {
  it('spans the radius in both directions, wider in longitude away from the equator', () => {
    const [[west, south], [east, north]] = circleBounds([7, 46], 50) as [
      [number, number],
      [number, number],
    ];
    expect(north - 46).toBeCloseTo(50 / 111.32, 5);
    expect(46 - south).toBeCloseTo(50 / 111.32, 5);
    // cos(46°) ≈ 0.695, so a degree of longitude is shorter and the box wider.
    expect(east - 7).toBeCloseTo(50 / (111.32 * Math.cos((46 * Math.PI) / 180)), 5);
    expect(7 - west).toBeCloseTo(east - 7, 10);
  });

  it('stays finite at a pole', () => {
    const box = circleBounds([0, 90], 50).toString();
    expect(box).not.toMatch(/Infinity|NaN/);
  });
});

describe('style layer lookups', () => {
  const layers = [
    { id: 'background', type: 'background' },
    { id: 'road', type: 'line', 'source-layer': 'transportation' },
    { id: 'road_label', type: 'symbol', 'source-layer': 'transportation_name' },
    { id: 'poi_r1', type: 'symbol', 'source-layer': 'poi' },
    { id: 'poi_transit', type: 'symbol', 'source-layer': 'poi' },
  ];

  it("finds the base map's own POI layers", () => {
    expect(poiLayerIds(layers)).toEqual(['poi_r1', 'poi_transit']);
  });

  it('finds the first label layer, or nothing on a style without labels', () => {
    expect(firstSymbolLayerId(layers)).toBe('road_label');
    expect(firstSymbolLayerId(layers.slice(0, 2))).toBeUndefined();
  });
});

describe('lineCollection', () => {
  it('builds one LineString per path and drops paths too short to draw', () => {
    const fc = lineCollection([
      {
        id: 'a',
        path: [
          [7, 46],
          [7.1, 46.1],
        ],
        color: '#f00',
      },
      { id: 'b', path: [[7, 46]], color: '#0f0' },
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]).toMatchObject({
      properties: { id: 'a', color: '#f00' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [7, 46],
          [7.1, 46.1],
        ],
      },
    });
  });
});
