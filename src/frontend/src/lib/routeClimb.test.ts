import { describe, expect, it } from 'vitest';

import { toMercator } from './osmDiscovery';
import {
  MAX_SAMPLES,
  climbFrom,
  metresBetween,
  routeSegments,
  samplePoints,
  type WaymarkedRouteNode,
} from './routeClimb';

/** A way through `[lng, lat]` points, in the Web Mercator the API sends. */
const way = (...points: [number, number][]) => ({
  geometry: { type: 'LineString', coordinates: points.map(([lng, lat]) => toMercator(lng, lat)) },
});

const close = (a: [number, number], b: [number, number]) => metresBetween(a, b) < 0.5;

describe('routeSegments', () => {
  it('joins ways end to end, turning one that runs backwards', () => {
    const tree: WaymarkedRouteNode = {
      main: [{ ways: [way([7.0, 46.0], [7.001, 46.0]), way([7.002, 46.0], [7.001, 46.0])] }],
    };
    const [line] = routeSegments(tree);
    expect(line).toHaveLength(3);
    expect(close(line[0], [7.0, 46.0])).toBe(true);
    expect(close(line[2], [7.002, 46.0])).toBe(true);
  });

  it('keeps separate sections apart, and nested subroutes in order', () => {
    const tree: WaymarkedRouteNode = {
      main: [
        { main: [{ ways: [way([7.0, 46.0], [7.001, 46.0])] }] },
        { ways: [way([8.0, 46.0], [8.001, 46.0])] },
      ],
    };
    const segments = routeSegments(tree);
    expect(segments).toHaveLength(2);
    expect(close(segments[1][0], [8.0, 46.0])).toBe(true);
  });

  it('ignores ways without usable geometry', () => {
    expect(
      routeSegments({ ways: [{ geometry: { type: 'Point', coordinates: [[1, 2]] } }] })
    ).toEqual([]);
    expect(routeSegments(undefined)).toEqual([]);
  });
});

describe('samplePoints', () => {
  it('spaces points at least 50 m apart, ends included', () => {
    // About 1.1 km of latitude.
    const samples = samplePoints([
      [
        [7.0, 46.0],
        [7.0, 46.01],
      ],
    ]);
    expect(samples?.spacingM).toBe(50);
    const points = samples!.segments[0];
    expect(points.length).toBeGreaterThanOrEqual(23);
    expect(close(points[points.length - 1], [7.0, 46.01])).toBe(true);
    expect(metresBetween(points[0], points[1])).toBeCloseTo(50, 0);
  });

  it('stays inside the sample budget on a long route', () => {
    // About 40 km: needs more than 50 m spacing, still under 150 m.
    const samples = samplePoints([
      [
        [7.0, 46.0],
        [7.0, 46.36],
      ],
    ]);
    expect(samples!.spacingM).toBeGreaterThan(50);
    expect(samples!.segments.flat().length).toBeLessThanOrEqual(MAX_SAMPLES);
  });

  it('refuses a route too long to sample closely enough', () => {
    // About 110 km.
    expect(
      samplePoints([
        [
          [7.0, 46.0],
          [7.0, 47.0],
        ],
      ])
    ).toBeNull();
  });
});

describe('climbFrom', () => {
  it('sums climbs and descents across segments', () => {
    expect(
      climbFrom([
        [100, 150, 120],
        [500, 560],
      ])
    ).toEqual({ climbM: 110, descentM: 30 });
  });

  it('ignores wobbles below the noise threshold', () => {
    expect(climbFrom([[100, 103, 99, 102, 100, 104]])).toEqual({ climbM: 0, descentM: 0 });
  });

  it('is unknown when any height is', () => {
    expect(climbFrom([[100, null, 200]])).toBeNull();
  });
});
