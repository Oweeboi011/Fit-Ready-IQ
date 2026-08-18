import { describe, expect, it } from 'vitest';

import type { Activity } from './activityTypes';
import { EVEREST_HEIGHT_M, buildLedger } from './ledger';

function activity(over: Partial<Activity> = {}): Activity {
  return {
    id: over.id ?? 'a1',
    source: 'strava',
    name: 'Morning hike',
    sport_type: 'Hike',
    start_date: '2026-08-01T06:00:00Z',
    distance_km: 10,
    elevation_gain_m: 400,
    moving_time_s: 3600,
    ...over,
  };
}

const NOW = new Date('2026-08-14T12:00:00Z');

describe('buildLedger', () => {
  it('returns zeroed totals and no records for no activities', () => {
    const ledger = buildLedger([], NOW);
    expect(ledger.lifetime.activities).toBe(0);
    expect(ledger.lifetime.distanceKm).toBe(0);
    expect(ledger.records.longestDistance).toBeNull();
    expect(ledger.since).toBeNull();
    expect(ledger.everests).toBe(0);
  });

  it('sums lifetime distance, ascent and time', () => {
    const ledger = buildLedger(
      [
        activity({ id: '1', distance_km: 10, elevation_gain_m: 400, moving_time_s: 3600 }),
        activity({ id: '2', distance_km: 5, elevation_gain_m: 100, moving_time_s: 1800 }),
      ],
      NOW
    );

    expect(ledger.lifetime).toEqual({
      activities: 2,
      distanceKm: 15,
      ascentM: 500,
      movingTimeS: 5400,
    });
  });

  it('separates year-to-date from lifetime', () => {
    const ledger = buildLedger(
      [
        activity({ id: 'old', start_date: '2024-05-01T06:00:00Z', distance_km: 100 }),
        activity({ id: 'new', start_date: '2026-03-01T06:00:00Z', distance_km: 20 }),
      ],
      NOW
    );

    expect(ledger.year).toBe(2026);
    expect(ledger.lifetime.distanceKm).toBe(120);
    expect(ledger.yearToDate.distanceKm).toBe(20);
    expect(ledger.yearToDate.activities).toBe(1);
  });

  it('counts an undated activity toward lifetime but not toward a year', () => {
    const ledger = buildLedger(
      [activity({ id: 'broken', start_date: 'not-a-date', distance_km: 7 })],
      NOW
    );

    expect(ledger.lifetime.distanceKm).toBe(7);
    expect(ledger.yearToDate.activities).toBe(0);
    expect(ledger.since).toBeNull();
  });

  it('treats NaN and negative imported values as zero rather than poisoning the total', () => {
    const ledger = buildLedger(
      [
        activity({ id: '1', distance_km: Number.NaN, elevation_gain_m: -50 }),
        activity({ id: '2', distance_km: 10, elevation_gain_m: 200 }),
      ],
      NOW
    );

    expect(ledger.lifetime.distanceKm).toBe(10);
    expect(ledger.lifetime.ascentM).toBe(200);
  });

  it('picks the largest value for each record independently', () => {
    const ledger = buildLedger(
      [
        activity({ id: 'far', distance_km: 42, elevation_gain_m: 100, moving_time_s: 7200 }),
        activity({ id: 'steep', distance_km: 8, elevation_gain_m: 1800, moving_time_s: 9000 }),
      ],
      NOW
    );

    expect(ledger.records.longestDistance?.activity.id).toBe('far');
    expect(ledger.records.longestDistance?.value).toBe(42);
    expect(ledger.records.biggestAscent?.activity.id).toBe('steep');
    expect(ledger.records.longestDuration?.activity.id).toBe('steep');
  });

  it('does not treat a missing field as a record of zero', () => {
    const ledger = buildLedger([activity({ id: 'flat', elevation_gain_m: 0 })], NOW);
    expect(ledger.records.biggestAscent).toBeNull();
    expect(ledger.records.longestDistance).not.toBeNull();
  });

  it('keeps the first record when two tie, rather than churning', () => {
    const ledger = buildLedger(
      [activity({ id: 'first', distance_km: 10 }), activity({ id: 'second', distance_km: 10 })],
      NOW
    );
    expect(ledger.records.longestDistance?.activity.id).toBe('first');
  });

  it('reports the earliest activity date', () => {
    const ledger = buildLedger(
      [
        activity({ id: 'b', start_date: '2025-01-02T00:00:00Z' }),
        activity({ id: 'a', start_date: '2023-06-15T00:00:00Z' }),
      ],
      NOW
    );
    expect(ledger.since).toBe('2023-06-15T00:00:00.000Z');
  });

  it('expresses lifetime ascent in Everests', () => {
    const ledger = buildLedger([activity({ elevation_gain_m: EVEREST_HEIGHT_M * 2 })], NOW);
    expect(ledger.everests).toBeCloseTo(2, 5);
  });
});
