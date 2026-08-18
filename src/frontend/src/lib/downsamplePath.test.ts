import { describe, expect, it } from 'vitest';

import { downsamplePath } from './mapsGeometry';

/**
 * The elevation profile came back empty with `INVALID_REQUEST` because the whole
 * snapped route was being sent to describe its shape: a 1.5 km walk already
 * decodes to ~56 vertices, so a mountain route runs to hundreds or thousands.
 *
 * These cover the reduction itself — the endpoints surviving matters most,
 * because the last vertex is where the distance axis stops.
 */

const point = (n: number) => ({ lat: n, lng: n });
const line = (count: number) => Array.from({ length: count }, (_, i) => point(i));

describe('downsamplePath', () => {
  it('leaves a short path alone', () => {
    const path = line(10);
    expect(downsamplePath(path, 100)).toEqual(path);
  });

  it('reduces a long path to the cap', () => {
    expect(downsamplePath(line(5000), 100)).toHaveLength(100);
  });

  it('keeps the first and last vertex, which anchor the distance axis', () => {
    const reduced = downsamplePath(line(5000), 100);
    expect(reduced[0]).toEqual(point(0));
    expect(reduced[reduced.length - 1]).toEqual(point(4999));
  });

  it('keeps the vertices in order', () => {
    const reduced = downsamplePath(line(1000), 50);
    const lats = reduced.map((p) => p.lat);
    expect([...lats].sort((a, b) => a - b)).toEqual(lats);
  });

  it('spreads the picks rather than clustering them at one end', () => {
    const reduced = downsamplePath(line(1000), 10);
    // A midpoint pick should be near the middle of the original.
    expect(reduced[5].lat).toBeGreaterThan(400);
    expect(reduced[5].lat).toBeLessThan(600);
  });

  it('drops consecutive duplicates, which contribute a zero-length leg', () => {
    const path = [point(0), point(0), point(1), point(1), point(1), point(2)];
    expect(downsamplePath(path, 100)).toEqual([point(0), point(1), point(2)]);
  });

  it('collapses an all-identical path to one point, so callers can refuse it', () => {
    // A path with no length cannot be sampled along, and the caller checks for
    // fewer than two points rather than sending a request that must fail.
    expect(downsamplePath([point(3), point(3), point(3)], 100)).toEqual([point(3)]);
  });

  it('keeps a path that is exactly at the cap', () => {
    expect(downsamplePath(line(100), 100)).toHaveLength(100);
  });

  it('handles an empty path', () => {
    expect(downsamplePath([], 100)).toEqual([]);
  });

  it('never returns more than the cap, for any input size', () => {
    for (const size of [101, 137, 512, 999, 4096]) {
      expect(downsamplePath(line(size), 100).length).toBeLessThanOrEqual(100);
    }
  });
});
