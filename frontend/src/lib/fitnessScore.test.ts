import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeFitnessScore } from './fitnessScore';
import type { Activity } from './activityTypes';

function activity(daysIntoMonth: number, over: Partial<Activity> = {}): Activity {
  const d = new Date(2026, 5, daysIntoMonth, 9, 0, 0); // June 2026
  return {
    id: `a${daysIntoMonth}-${Math.random()}`,
    source: 'strava',
    name: 'Session',
    sport_type: 'Hike',
    start_date: d.toISOString(),
    distance_km: 10,
    elevation_gain_m: 250,
    moving_time_s: 3600,
    ...over,
  } as Activity;
}

/** Freeze the clock to the given day of June 2026. */
function freezeToJune(day: number) {
  vi.setSystemTime(new Date(2026, 5, day, 18, 0, 0));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('computeFitnessScore — month-to-date window', () => {
  it('ignores activities from last month', () => {
    freezeToJune(20);
    const lastMonth: Activity = {
      ...activity(1),
      start_date: new Date(2026, 4, 20).toISOString(), // May
    };

    const result = computeFitnessScore([lastMonth]);

    expect(result.score).toBe(0);
    expect(result.label).toBe('No activity yet');
  });

  it('counts an activity from the 1st when today is the 20th', () => {
    freezeToJune(20);
    const result = computeFitnessScore([activity(1)]);
    expect(result.score).toBeGreaterThan(0);
  });

  it('distinguishes no data at all from no data this month', () => {
    freezeToJune(20);
    expect(computeFitnessScore([]).label).toBe('No Data');
    expect(
      computeFitnessScore([{ ...activity(1), start_date: new Date(2026, 3, 5).toISOString() }])
        .label
    ).toBe('No activity yet');
  });

  it('pro-rates targets, so a strong first week is not scored as a weak month', () => {
    // Four sessions in the first week is a good week, not a bad month.
    freezeToJune(7);
    const earlyMonth = computeFitnessScore([activity(1), activity(3), activity(5), activity(6)]);

    // The same four sessions, but that's all there was for a whole month.
    freezeToJune(30);
    const wholeMonth = computeFitnessScore([activity(1), activity(3), activity(5), activity(6)]);

    expect(earlyMonth.score).toBeGreaterThan(wholeMonth.score);
  });

  it('does not spike to elite from a single ride on the 2nd', () => {
    // The 7-day floor is what stops one activity dividing by a tiny window.
    freezeToJune(2);
    const result = computeFitnessScore([activity(1, { distance_km: 40, elevation_gain_m: 900 })]);
    expect(result.score).toBeLessThan(80);
  });

  it('caps each component so one huge ride cannot carry the whole score', () => {
    freezeToJune(30);
    const result = computeFitnessScore([
      activity(2, { distance_km: 5000, elevation_gain_m: 90000 }),
    ]);

    for (const part of result.breakdown) {
      expect(part.value).toBeLessThanOrEqual(part.max);
    }
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('never exceeds 100 for a very heavy month', () => {
    freezeToJune(28);
    const heavy = Array.from({ length: 40 }, (_, i) =>
      activity((i % 27) + 1, { distance_km: 30, elevation_gain_m: 1200, avg_heartrate: 150 })
    );

    const result = computeFitnessScore(heavy);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThan(80);
  });

  it('rewards training spread across weeks over the same volume in one day', () => {
    freezeToJune(28);
    const spread = [activity(2), activity(9), activity(16), activity(23)];
    const bunched = [activity(2), activity(2), activity(2), activity(2)];

    const spreadConsistency = computeFitnessScore(spread).breakdown.find(
      (b) => b.label === 'Consistency'
    )!.value;
    const bunchedConsistency = computeFitnessScore(bunched).breakdown.find(
      (b) => b.label === 'Consistency'
    )!.value;

    expect(spreadConsistency).toBeGreaterThan(bunchedConsistency);
  });

  it('reports a breakdown whose maxima sum to the score ceiling', () => {
    freezeToJune(15);
    const { breakdown } = computeFitnessScore([activity(3)]);
    expect(breakdown.reduce((s, b) => s + b.max, 0)).toBe(95); // + up to 5 intensity bonus
  });
});
