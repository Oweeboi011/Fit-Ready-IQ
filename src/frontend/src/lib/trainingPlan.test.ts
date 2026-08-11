import { describe, expect, it } from 'vitest';

import { computeReadiness } from './readiness';
import type { Readiness } from './readiness';
import {
  buildTrainingPlan,
  MAX_PLAN_WEEKS,
  WEEKLY_PROGRESSION,
  weeksToClose,
} from './trainingPlan';
import type { Activity } from './activityTypes';

const NOW = new Date('2026-06-15T12:00:00Z').getTime();
const DAY = 86_400_000;

function activity(daysAgo: number, distanceKm: number, ascentM: number): Activity {
  return {
    id: `a-${daysAgo}-${distanceKm}`,
    source: 'strava',
    name: 'Session',
    sport_type: 'Hike',
    start_date: new Date(NOW - daysAgo * DAY).toISOString(),
    distance_km: distanceKm,
    elevation_gain_m: ascentM,
    moving_time_s: 3600,
  } as Activity;
}

/** Builds a plan from real training, the way the UI does. */
function planFor(route: { distanceKm: number; ascentM: number | null }, acts: Activity[]) {
  return buildTrainingPlan(computeReadiness(route, acts, NOW));
}

describe('weeksToClose', () => {
  it('is zero when capacity already meets demand', () => {
    expect(weeksToClose(20, 15)).toBe(0);
    expect(weeksToClose(15, 15)).toBe(0);
  });

  it('compounds at the progression rate', () => {
    // 10 -> 20 km at 10%/week is ~7.3 weeks, rounded up.
    expect(weeksToClose(10, 20)).toBe(8);
    const grown = 10 * Math.pow(1 + WEEKLY_PROGRESSION, 8);
    expect(grown).toBeGreaterThanOrEqual(20);
  });

  it('cannot compound from nothing', () => {
    expect(weeksToClose(0, 15)).toBeNull();
  });

  it('treats a zero demand as already met', () => {
    expect(weeksToClose(5, 0)).toBe(0);
  });
});

describe('buildTrainingPlan', () => {
  it('says no plan is needed when training already covers the route', () => {
    const strong = [activity(3, 25, 1600), activity(10, 24, 1500), activity(17, 26, 1700)];
    const plan = planFor({ distanceKm: 10, ascentM: 500 }, strong);

    expect(plan.status).toBe('ready');
    expect(plan.weeks).toBe(0);
    expect(plan.targets).toHaveLength(0);
  });

  it('cannot plan without training data', () => {
    const plan = planFor({ distanceKm: 20, ascentM: 1200 }, []);
    expect(plan.status).toBe('unknown');
    expect(plan.summary).toMatch(/connect your training/i);
  });

  it('produces one target per week, ending at the route demand', () => {
    const modest = Array.from({ length: 12 }, (_, i) => activity(i * 4 + 1, 10, 500));
    const plan = planFor({ distanceKm: 16, ascentM: 800 }, modest);

    expect(plan.status).toBe('plan');
    expect(plan.targets).toHaveLength(plan.weeks);
    expect(plan.targets[0].week).toBe(1);

    const last = plan.targets[plan.targets.length - 1];
    expect(last.longestKm).toBeCloseTo(16, 1);
    expect(last.ascentM).toBe(800);
  });

  it('never targets beyond what the route asks for', () => {
    const modest = Array.from({ length: 12 }, (_, i) => activity(i * 4 + 1, 10, 500));
    const plan = planFor({ distanceKm: 16, ascentM: 800 }, modest);

    for (const target of plan.targets) {
      expect(target.longestKm).toBeLessThanOrEqual(16);
      expect(target.ascentM!).toBeLessThanOrEqual(800);
    }
  });

  it('increases every week', () => {
    const modest = Array.from({ length: 12 }, (_, i) => activity(i * 4 + 1, 8, 400));
    const plan = planFor({ distanceKm: 20, ascentM: 1000 }, modest);

    for (let i = 1; i < plan.targets.length; i++) {
      expect(plan.targets[i].longestKm).toBeGreaterThanOrEqual(plan.targets[i - 1].longestKm);
    }
  });

  it('names the factor that sets the length', () => {
    // Frequent but short: distance has furthest to travel, so it paces the plan.
    const shortButFrequent = Array.from({ length: 16 }, (_, i) => activity(i * 3 + 1, 5, 900));
    const plan = planFor({ distanceKm: 20, ascentM: 900 }, shortButFrequent);

    expect(plan.focus).toMatch(/longest recent outing/i);
    expect(plan.summary).toMatch(/longest recent outing/i);
  });

  it('refuses to project an unrealistic distance rather than inventing a year-long plan', () => {
    const beginner = Array.from({ length: 8 }, (_, i) => activity(i * 6 + 1, 1, 20));
    const plan = planFor({ distanceKm: 45, ascentM: 3000 }, beginner);

    expect(plan.status).toBe('too-far');
    expect(plan.weeks).toBeGreaterThan(MAX_PLAN_WEEKS);
    expect(plan.targets).toHaveLength(0);
    expect(plan.summary).toMatch(/pick a smaller route/i);
  });

  it('asks for a baseline when there is nothing to build from', () => {
    const noDistance = [activity(2, 0, 0), activity(9, 0, 0)];
    const plan = planFor({ distanceKm: 12, ascentM: 600 }, noDistance);

    expect(plan.status).toBe('no-baseline');
    expect(plan.summary).toMatch(/record a few outings/i);
  });

  it('omits ascent targets when the route elevation is unknown', () => {
    const modest = Array.from({ length: 12 }, (_, i) => activity(i * 4 + 1, 10, 500));
    const plan = planFor({ distanceKm: 16, ascentM: null }, modest);

    expect(plan.status).toBe('plan');
    expect(plan.targets.every((t) => t.ascentM === null)).toBe(true);
  });

  it('is longer for a bigger route, from the same training', () => {
    const modest = Array.from({ length: 12 }, (_, i) => activity(i * 4 + 1, 10, 500));
    const near = planFor({ distanceKm: 13, ascentM: 600 }, modest).weeks;
    const far = planFor({ distanceKm: 22, ascentM: 1100 }, modest).weeks;

    expect(far).toBeGreaterThan(near);
  });

  it('handles a readiness object with no factors without crashing', () => {
    const empty: Readiness = {
      level: 'unknown',
      score: null,
      label: 'x',
      summary: 'x',
      factors: [],
      incomplete: true,
    };
    expect(buildTrainingPlan(empty).status).toBe('unknown');
  });
});
