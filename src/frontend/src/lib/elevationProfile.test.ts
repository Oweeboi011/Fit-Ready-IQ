import { describe, expect, it } from 'vitest';

import {
  distanceTicks,
  profileRange,
  profileSegments,
  sampleAtRatio,
  summarizeProfile,
  type ElevationSample,
  type ProfileBox,
} from './elevationProfile';

const BOX: ProfileBox = {
  width: 100,
  height: 50,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

function samples(...pairs: [number, number | null][]): ElevationSample[] {
  return pairs.map(([distanceKm, elevationM]) => ({ distanceKm, elevationM }));
}

describe('summarizeProfile', () => {
  it('returns null when nothing is known, so the caller can say so', () => {
    expect(summarizeProfile([])).toBeNull();
    expect(summarizeProfile(samples([0, null], [1, null]))).toBeNull();
  });

  it('sums only the climbs for ascent, and only the drops for descent', () => {
    const summary = summarizeProfile(samples([0, 100], [1, 150], [2, 120], [3, 200]));
    expect(summary).toMatchObject({ ascentM: 130, descentM: 30 });
  });

  it('reports the real min and max', () => {
    expect(summarizeProfile(samples([0, 100], [1, 350], [2, 80]))).toMatchObject({
      minM: 80,
      maxM: 350,
    });
  });

  it('never counts a step that spans an unknown sample', () => {
    // The ground between two points we could not measure is not a climb we can
    // claim. 100 → ? → 900 must not become 800 m of ascent.
    const summary = summarizeProfile(samples([0, 100], [1, null], [2, 900]));
    expect(summary).toMatchObject({ ascentM: 0, descentM: 0 });
  });

  it('still measures the steps it can, either side of a gap', () => {
    const summary = summarizeProfile(samples([0, 100], [1, 150], [2, null], [3, 200], [4, 260]));
    expect(summary?.ascentM).toBe(110); // 50 + 60, nothing across the gap
  });

  it('reports coverage so a partial profile can admit it', () => {
    const summary = summarizeProfile(samples([0, 100], [1, null], [2, 120], [3, 130]));
    expect(summary).toMatchObject({ knownCount: 3, totalCount: 4 });
    expect(summary?.coverage).toBeCloseTo(0.75);
  });

  it('treats a flat route as zero gain rather than as unknown', () => {
    expect(summarizeProfile(samples([0, 200], [1, 200]))).toMatchObject({
      ascentM: 0,
      descentM: 0,
      minM: 200,
      maxM: 200,
    });
  });
});

describe('profileRange', () => {
  it('fits the data and pads it, so the line is not on the edge', () => {
    const summary = summarizeProfile(samples([0, 100], [1, 200]))!;
    const range = profileRange(summary);
    expect(range.low).toBeLessThan(100);
    expect(range.high).toBeGreaterThan(200);
  });

  it('gives a flat route a usable range instead of dividing by zero', () => {
    const summary = summarizeProfile(samples([0, 200], [1, 200]))!;
    const range = profileRange(summary);
    expect(range.high - range.low).toBeGreaterThan(0);
    expect(Number.isFinite(range.low)).toBe(true);
  });
});

describe('profileSegments', () => {
  const range = { low: 0, high: 100 };

  it('draws one segment for a continuous profile', () => {
    const segs = profileSegments(samples([0, 0], [1, 50], [2, 100]), BOX, range);
    expect(segs).toHaveLength(1);
    expect(segs[0].line.startsWith('M')).toBe(true);
  });

  it('breaks into separate segments across a gap rather than bridging it', () => {
    // The whole point: one path would draw a slope through ground we never
    // measured.
    const segs = profileSegments(
      samples([0, 0], [1, 50], [2, null], [3, 80], [4, 100]),
      BOX,
      range
    );
    expect(segs).toHaveLength(2);
  });

  it('closes the area down to the baseline', () => {
    const segs = profileSegments(samples([0, 0], [1, 100]), BOX, range);
    expect(segs[0].area.endsWith('Z')).toBe(true);
    expect(segs[0].area).toContain(`,${BOX.height}`);
  });

  it('drops a run too short to draw instead of emitting a degenerate path', () => {
    const segs = profileSegments(samples([0, 10], [1, null], [2, 20], [3, null]), BOX, range);
    expect(segs).toHaveLength(0);
  });

  it('maps the highest sample nearer the top than the lowest', () => {
    const segs = profileSegments(samples([0, 0], [1, 100]), BOX, range);
    const [firstY, lastY] = segs[0].line
      .replace('M', '')
      .split('L')
      .map((p) => Number(p.split(',')[1]));
    // SVG y grows downward, so the 100 m end must have the smaller y.
    expect(lastY).toBeLessThan(firstY);
  });

  it('spans the full width of the box', () => {
    const segs = profileSegments(samples([0, 0], [5, 100]), BOX, range);
    const xs = segs[0].line
      .replace('M', '')
      .split('L')
      .map((p) => Number(p.split(',')[0]));
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(BOX.width);
  });

  it('returns nothing for an empty profile', () => {
    expect(profileSegments([], BOX, range)).toEqual([]);
  });
});

describe('sampleAtRatio', () => {
  const profile = samples([0, 100], [1, 150], [2, 200], [3, 250]);

  it('finds the nearest sample to a position', () => {
    expect(sampleAtRatio(profile, 0)?.distanceKm).toBe(0);
    expect(sampleAtRatio(profile, 1)?.distanceKm).toBe(3);
    // Two thirds along a 3 km route is 2 km, which is a sample exactly.
    expect(sampleAtRatio(profile, 2 / 3)?.distanceKm).toBe(2);
  });

  it('picks the closer of two neighbours rather than always rounding down', () => {
    // 0.8 of 3 km = 2.4 km, nearer the 2 km sample than the 3 km one.
    expect(sampleAtRatio(profile, 0.8)?.distanceKm).toBe(2);
    // 0.9 of 3 km = 2.7 km, now nearer 3 km.
    expect(sampleAtRatio(profile, 0.9)?.distanceKm).toBe(3);
  });

  it('clamps a position outside the plot', () => {
    expect(sampleAtRatio(profile, -5)?.distanceKm).toBe(0);
    expect(sampleAtRatio(profile, 5)?.distanceKm).toBe(3);
  });

  it('returns null for an empty profile so no tooltip appears', () => {
    expect(sampleAtRatio([], 0.5)).toBeNull();
  });
});

describe('distanceTicks', () => {
  it('spaces ticks evenly to the end of the route', () => {
    expect(distanceTicks(9, 3)).toEqual([3, 6, 9]);
  });

  it('produces nothing for a route with no length', () => {
    expect(distanceTicks(0)).toEqual([]);
    expect(distanceTicks(Number.NaN)).toEqual([]);
  });
});
