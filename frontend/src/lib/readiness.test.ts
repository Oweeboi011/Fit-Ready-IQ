import { describe, expect, it } from 'vitest';

import { computeReadiness, TRAINING_WINDOW_WEEKS } from './readiness';
import type { Activity } from './activityTypes';

const NOW = new Date('2026-06-15T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function activity(daysAgo: number, distanceKm: number, ascentM: number): Activity {
  return {
    id: `a-${daysAgo}-${distanceKm}-${ascentM}`,
    source: 'strava',
    name: 'Session',
    sport_type: 'Hike',
    start_date: new Date(NOW - daysAgo * DAY).toISOString(),
    distance_km: distanceKm,
    elevation_gain_m: ascentM,
    moving_time_s: 3600,
  } as Activity;
}

/** Someone comfortably training for a big day. */
const STRONG = [
  activity(3, 18, 1300),
  activity(10, 15, 1100),
  activity(17, 20, 1400),
  activity(24, 12, 800),
];

describe('computeReadiness', () => {
  it('says ready when training covers every demand', () => {
    const result = computeReadiness({ distanceKm: 15, ascentM: 1200 }, STRONG, NOW);
    expect(result.level).toBe('ready');
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('cannot answer without any training data', () => {
    const result = computeReadiness({ distanceKm: 15, ascentM: 1200 }, [], NOW);
    expect(result.level).toBe('unknown');
    expect(result.score).toBeNull();
    // The answer has to tell them how to get an answer.
    expect(result.summary).toMatch(/connect a device|import/i);
  });

  it('ignores training older than the window', () => {
    const stale = STRONG.map((a) => ({
      ...a,
      start_date: new Date(NOW - (TRAINING_WINDOW_WEEKS * 7 + 5) * DAY).toISOString(),
    }));
    expect(computeReadiness({ distanceKm: 15, ascentM: 1200 }, stale, NOW).level).toBe('unknown');
  });

  it('is gated by the limiting factor, not the average', () => {
    // Plenty of flat distance, almost no climbing. Averaging would call this
    // ready; the climb is exactly what would turn them back.
    const flatRunner = [activity(2, 20, 50), activity(9, 22, 40), activity(16, 18, 60)];

    const result = computeReadiness({ distanceKm: 15, ascentM: 1400 }, flatRunner, NOW);

    expect(result.level).not.toBe('ready');
    expect(result.summary).toMatch(/climb/i);
  });

  it('names the limiting factor so the answer is actionable', () => {
    // Frequent but short: weekly volume is healthy, single-outing distance is
    // not. Distance must be named as the limiter, not volume.
    const shortButFrequent = Array.from({ length: 14 }, (_, i) => activity(i * 4 + 1, 6, 900));
    const result = computeReadiness({ distanceKm: 20, ascentM: 900 }, shortButFrequent, NOW);

    const distance = result.factors.find((f) => f.id === 'distance')!;
    const volume = result.factors.find((f) => f.id === 'volume')!;
    expect(distance.score).toBeLessThan(volume.score);
    expect(result.summary).toMatch(/longest recent outing/i);
  });

  it('does not let one heroic outing read as fitness', () => {
    // A single long day, then nothing. Weekly volume should hold the score down.
    const oneBigDay = [activity(50, 25, 1500)];
    const result = computeReadiness({ distanceKm: 20, ascentM: 1400 }, oneBigDay, NOW);

    const volume = result.factors.find((f) => f.id === 'volume')!;
    expect(volume.score).toBeLessThan(100);
    expect(result.score).toBeLessThanOrEqual(volume.score);
  });

  it('skips the ascent factor when the route elevation is unknown', () => {
    const result = computeReadiness({ distanceKm: 15, ascentM: null }, STRONG, NOW);

    expect(result.factors.map((f) => f.id)).not.toContain('ascent');
    expect(result.incomplete).toBe(true);
    // It must say what it could not account for.
    expect(result.summary).toMatch(/elevation .* unknown/i);
  });

  it('never exceeds 100 for someone far beyond the route', () => {
    const result = computeReadiness({ distanceKm: 3, ascentM: 100 }, STRONG, NOW);
    expect(result.score).toBe(100);
    expect(result.factors.every((f) => f.score <= 100)).toBe(true);
  });

  it('scores zero capacity as not yet rather than crashing', () => {
    const nothing = [activity(1, 0, 0)];
    const result = computeReadiness({ distanceKm: 12, ascentM: 800 }, nothing, NOW);
    expect(result.level).toBe('not-yet');
    expect(result.score).toBe(0);
  });

  it('cannot answer for a route with no distance', () => {
    expect(computeReadiness({ distanceKm: 0, ascentM: 500 }, STRONG, NOW).level).toBe('unknown');
  });

  it('reports capacity and demand in each factor, so the number is checkable', () => {
    const result = computeReadiness({ distanceKm: 15, ascentM: 1200 }, STRONG, NOW);
    const distance = result.factors.find((f) => f.id === 'distance')!;

    expect(distance.capacity).toBe('20.0 km');
    expect(distance.demand).toBe('15.0 km');
  });

  it('gets harder as the route gets bigger, for fixed training', () => {
    const easy = computeReadiness({ distanceKm: 8, ascentM: 400 }, STRONG, NOW).score!;
    const hard = computeReadiness({ distanceKm: 30, ascentM: 2500 }, STRONG, NOW).score!;
    expect(hard).toBeLessThan(easy);
  });
});
