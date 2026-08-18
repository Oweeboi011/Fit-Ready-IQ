import { describe, expect, it } from 'vitest';

import type { Activity } from './activityTypes';
import type { RouteDemand } from './readiness';
import { READY_THRESHOLD, STRETCH_THRESHOLD, recommendRoutes } from './readinessRecommender';

const NOW = new Date('2026-08-14T12:00:00Z').getTime();

function activity(over: Partial<Activity> = {}): Activity {
  return {
    id: 'a1',
    source: 'strava',
    name: 'Training',
    sport_type: 'Hike',
    // Inside the 8-week window relative to NOW.
    start_date: '2026-08-01T06:00:00Z',
    distance_km: 20,
    elevation_gain_m: 1000,
    moving_time_s: 7200,
    ...over,
  };
}

interface Candidate {
  id: string;
  distanceKm: number;
  ascentM: number | null;
}

const demandOf = (c: Candidate): RouteDemand => ({
  distanceKm: c.distanceKm,
  ascentM: c.ascentM,
});

/** A solid recent block, so most short routes score as ready. */
const TRAINED: Activity[] = [
  activity({ id: '1', start_date: '2026-07-05T06:00:00Z' }),
  activity({ id: '2', start_date: '2026-07-15T06:00:00Z' }),
  activity({ id: '3', start_date: '2026-07-25T06:00:00Z' }),
  activity({ id: '4', start_date: '2026-08-05T06:00:00Z' }),
];

describe('recommendRoutes', () => {
  it('returns empty bands when there is no training data to score against', () => {
    const result = recommendRoutes([{ id: 'r1', distanceKm: 5, ascentM: 100 }], demandOf, [], {
      now: NOW,
    });
    expect(result.ready).toEqual([]);
    expect(result.stretch).toEqual([]);
  });

  it('never places an unscoreable route in a band', () => {
    // Zero distance makes readiness `unknown`.
    const result = recommendRoutes(
      [{ id: 'bad', distanceKm: 0, ascentM: null }],
      demandOf,
      TRAINED,
      { now: NOW }
    );
    expect(result.ready).toEqual([]);
    expect(result.stretch).toEqual([]);
  });

  it('puts the biggest finishable route first, not the easiest', () => {
    const result = recommendRoutes(
      [
        { id: 'stroll', distanceKm: 2, ascentM: 50 },
        { id: 'solid', distanceKm: 15, ascentM: 700 },
        { id: 'short', distanceKm: 5, ascentM: 100 },
      ],
      demandOf,
      TRAINED,
      { now: NOW }
    );

    expect(result.ready.map((r) => r.item.id)).toEqual(['solid', 'short', 'stroll']);
  });

  it('orders the stretch band by how close it is to reachable', () => {
    const result = recommendRoutes(
      [
        // Weekly volume is the limiter for both: 80 km over the 8-week window
        // is 10 km/week against a demand of half the route distance per week.
        { id: 'far', distanceKm: 32, ascentM: 1500 },
        { id: 'near', distanceKm: 28, ascentM: 1200 },
      ],
      demandOf,
      TRAINED,
      { now: NOW }
    );

    const ids = result.stretch.map((r) => r.item.id);
    // Both are stretches; the nearer one leads.
    expect(ids[0]).toBe('near');
    for (const entry of result.stretch) {
      expect(entry.readiness.score).toBeGreaterThanOrEqual(STRETCH_THRESHOLD);
      expect(entry.readiness.score).toBeLessThan(READY_THRESHOLD);
    }
  });

  it('keeps the bands disjoint and within their thresholds', () => {
    const candidates: Candidate[] = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      distanceKm: (i + 1) * 4,
      ascentM: (i + 1) * 180,
    }));

    const result = recommendRoutes(candidates, demandOf, TRAINED, { now: NOW });

    const readyIds = new Set(result.ready.map((r) => r.item.id));
    for (const entry of result.stretch) {
      expect(readyIds.has(entry.item.id)).toBe(false);
    }
    for (const entry of result.ready) {
      expect(entry.readiness.score).toBeGreaterThanOrEqual(READY_THRESHOLD);
    }
  });

  it('drops routes below the stretch band entirely', () => {
    const result = recommendRoutes(
      [{ id: 'epic', distanceKm: 400, ascentM: 20000 }],
      demandOf,
      TRAINED,
      { now: NOW }
    );
    expect(result.ready).toEqual([]);
    expect(result.stretch).toEqual([]);
  });

  it('respects the per-band limit', () => {
    const candidates: Candidate[] = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      distanceKm: 3 + i * 0.5,
      ascentM: 80,
    }));

    const result = recommendRoutes(candidates, demandOf, TRAINED, { now: NOW, limit: 3 });
    expect(result.ready.length).toBeLessThanOrEqual(3);
  });

  it('ranks a climb as more demanding than flat distance alone', () => {
    const result = recommendRoutes(
      [
        { id: 'flat', distanceKm: 10, ascentM: 0 },
        { id: 'steep', distanceKm: 10, ascentM: 800 },
      ],
      demandOf,
      TRAINED,
      { now: NOW }
    );

    const ids = result.ready.map((r) => r.item.id);
    if (ids.length === 2) expect(ids[0]).toBe('steep');
    expect(result.ready.concat(result.stretch).length).toBeGreaterThan(0);
  });

  it('treats unknown ascent as no ascent for ordering', () => {
    const result = recommendRoutes(
      [{ id: 'unrated', distanceKm: 10, ascentM: null }],
      demandOf,
      TRAINED,
      { now: NOW }
    );
    const all = [...result.ready, ...result.stretch];
    expect(all[0]?.effort).toBe(10);
  });
});
