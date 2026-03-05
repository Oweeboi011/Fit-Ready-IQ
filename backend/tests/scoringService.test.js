'use strict';

const {
  calculateScore,
  scoreAerobic,
  scoreRecovery,
  scoreTrainingLoad,
  scoreStrength,
  scoreConsistency,
  scoreLabel,
  buildMetricsFromProviders,
  WEIGHTS,
} = require('../src/services/scoringService');

// ─── Weight sanity ────────────────────────────────────────────────────────────
describe('WEIGHTS', () => {
  test('weights sum to 1.0', () => {
    const total = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });
});

// ─── scoreAerobic ─────────────────────────────────────────────────────────────
describe('scoreAerobic', () => {
  test('returns 0 for minimal inputs', () => {
    const score = scoreAerobic({ vo2Max: 28, recentCardioCount: 0, avgHeartRate: 0 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  test('returns high score for elite inputs', () => {
    const score = scoreAerobic({ vo2Max: 60, recentCardioCount: 15, avgHeartRate: 130 });
    expect(score).toBeGreaterThan(80);
  });

  test('returns moderate score for average inputs', () => {
    const score = scoreAerobic({ vo2Max: 44, recentCardioCount: 6, avgHeartRate: 152 });
    expect(score).toBeGreaterThan(30);
    expect(score).toBeLessThan(80);
  });

  test('no HR data defaults to neutral', () => {
    const withHR    = scoreAerobic({ vo2Max: 44, recentCardioCount: 6, avgHeartRate: 150 });
    const withoutHR = scoreAerobic({ vo2Max: 44, recentCardioCount: 6, avgHeartRate: 0 });
    expect(Math.abs(withHR - withoutHR)).toBeLessThan(20);
  });

  test('output is always in [0, 100]', () => {
    const extremeHigh = scoreAerobic({ vo2Max: 999, recentCardioCount: 999, avgHeartRate: 40 });
    const extremeLow  = scoreAerobic({ vo2Max: 0,   recentCardioCount: 0,   avgHeartRate: 220 });
    expect(extremeHigh).toBeLessThanOrEqual(100);
    expect(extremeLow).toBeGreaterThanOrEqual(0);
  });
});

// ─── scoreRecovery ────────────────────────────────────────────────────────────
describe('scoreRecovery', () => {
  test('poor recovery inputs yield low score', () => {
    const score = scoreRecovery({ hrv: 20, sleepQualityScore: 10, restingHeartRate: 85, recoveryScore: 10 });
    expect(score).toBeLessThan(30);
  });

  test('excellent recovery inputs yield high score', () => {
    const score = scoreRecovery({ hrv: 85, sleepQualityScore: 95, restingHeartRate: 42, recoveryScore: 90 });
    expect(score).toBeGreaterThan(80);
  });

  test('default inputs produce a mid-range score', () => {
    const score = scoreRecovery({});
    expect(score).toBeGreaterThan(20);
    expect(score).toBeLessThan(80);
  });

  test('output clamped to [0, 100]', () => {
    const score = scoreRecovery({ hrv: 0, sleepQualityScore: 0, restingHeartRate: 200, recoveryScore: 0 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── scoreTrainingLoad ────────────────────────────────────────────────────────
describe('scoreTrainingLoad', () => {
  test('no training = 0 score', () => {
    const score = scoreTrainingLoad({ weeklyDistanceKm: 0, weeklyElevation: 0, trainingLoad: 0 });
    expect(score).toBe(0);
  });

  test('high training volume = high score', () => {
    const score = scoreTrainingLoad({ weeklyDistanceKm: 80, weeklyElevation: 3000, trainingLoad: 500 });
    expect(score).toBeGreaterThan(85);
  });

  test('moderate training volume returns mid score', () => {
    const score = scoreTrainingLoad({ weeklyDistanceKm: 40, weeklyElevation: 1500, trainingLoad: 250 });
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(80);
  });
});

// ─── scoreStrength ────────────────────────────────────────────────────────────
describe('scoreStrength', () => {
  test('no hikes or strength = 0', () => {
    const score = scoreStrength({ hikeCount: 0, strengthCount: 0, totalElevation: 0 });
    expect(score).toBe(0);
  });

  test('high hike count and elevation = high score', () => {
    const score = scoreStrength({ hikeCount: 8, strengthCount: 12, totalElevation: 5000 });
    expect(score).toBeGreaterThan(85);
  });
});

// ─── scoreConsistency ─────────────────────────────────────────────────────────
describe('scoreConsistency', () => {
  test('zero activities = 0', () => {
    expect(scoreConsistency({ activityCount30d: 0, activeDays30d: 0 })).toBe(0);
  });

  test('20+ activities, 20+ days = ~100', () => {
    const score = scoreConsistency({ activityCount30d: 25, activeDays30d: 22 });
    expect(score).toBeGreaterThanOrEqual(95);
  });

  test('moderate consistency returns mid range', () => {
    const score = scoreConsistency({ activityCount30d: 10, activeDays30d: 10 });
    expect(score).toBeGreaterThan(30);
    expect(score).toBeLessThan(70);
  });
});

// ─── calculateScore ───────────────────────────────────────────────────────────
describe('calculateScore', () => {
  test('returns an object with overall, components, label, advice', () => {
    const result = calculateScore({});
    expect(result).toHaveProperty('overall');
    expect(result).toHaveProperty('components');
    expect(result).toHaveProperty('label');
    expect(result).toHaveProperty('advice');
  });

  test('overall score is always in [0, 100]', () => {
    // Extreme low
    const low = calculateScore({
      vo2Max: 0, recentCardioCount: 0, hrv: 0,
      sleepQualityScore: 0, restingHeartRate: 200,
      weeklyDistanceKm: 0, trainingLoad: 0,
    });
    expect(low.overall).toBeGreaterThanOrEqual(0);
    expect(low.overall).toBeLessThanOrEqual(100);

    // Extreme high
    const high = calculateScore({
      vo2Max: 70, recentCardioCount: 20, avgHeartRate: 120,
      hrv: 100, sleepQualityScore: 100, restingHeartRate: 38, recoveryScore: 100,
      weeklyDistanceKm: 100, weeklyElevation: 5000, trainingLoad: 600,
      hikeCount: 10, strengthCount: 15, totalElevation: 8000,
      activityCount30d: 30, activeDays30d: 28,
    });
    expect(high.overall).toBeGreaterThanOrEqual(0);
    expect(high.overall).toBeLessThanOrEqual(100);
  });

  test('better inputs produce higher overall score', () => {
    const poor = calculateScore({
      vo2Max: 28, hrv: 20, sleepQualityScore: 20, restingHeartRate: 90,
      weeklyDistanceKm: 5, activityCount30d: 2,
    });
    const good = calculateScore({
      vo2Max: 55, hrv: 70, sleepQualityScore: 85, restingHeartRate: 50,
      weeklyDistanceKm: 50, activityCount30d: 15, recentCardioCount: 10,
    });
    expect(good.overall).toBeGreaterThan(poor.overall);
  });

  test('components sum weighted to produce overall', () => {
    const result = calculateScore({
      vo2Max: 45, hrv: 55, sleepQualityScore: 70, restingHeartRate: 58,
      weeklyDistanceKm: 30, trainingLoad: 200,
      hikeCount: 3, activityCount30d: 10,
    });
    const expectedOverall = Math.round(
      result.components.aerobic      * WEIGHTS.aerobic +
      result.components.recovery     * WEIGHTS.recovery +
      result.components.trainingLoad * WEIGHTS.trainingLoad +
      result.components.strength     * WEIGHTS.strength +
      result.components.consistency  * WEIGHTS.consistency,
    );
    expect(result.overall).toBe(expectedOverall);
  });

  test('is deterministic – same inputs produce same output', () => {
    const metrics = { vo2Max: 48, hrv: 60, sleepQualityScore: 75, weeklyDistanceKm: 35 };
    const r1 = calculateScore(metrics);
    const r2 = calculateScore(metrics);
    expect(r1.overall).toBe(r2.overall);
  });
});

// ─── scoreLabel ───────────────────────────────────────────────────────────────
describe('scoreLabel', () => {
  test.each([
    [90, 'Peak'],
    [75, 'Good'],
    [55, 'Moderate'],
    [35, 'Building'],
    [20, 'Rest'],
  ])('score %d → label %s', (score, label) => {
    expect(scoreLabel(score)).toBe(label);
  });
});

// ─── buildMetricsFromProviders ────────────────────────────────────────────────
describe('buildMetricsFromProviders', () => {
  test('builds a valid metrics object from provider data', () => {
    const strava = {
      totalActivities: 10,
      totalDistance: 85000,
      totalElevation: 2400,
      avgHeartRate: 148,
      activityTypes: { Run: 6, Hike: 3, WeightTraining: 1 },
    };
    const garmin = { vo2Max: 49, restingHeartRate: 54, trainingLoad: 310 };
    const coros  = { hrv: 62, sleepQualityScore: 80, recoveryScore: 72 };

    const metrics = buildMetricsFromProviders(strava, garmin, coros);

    expect(metrics.vo2Max).toBe(49);
    expect(metrics.hrv).toBe(62);
    expect(metrics.recentCardioCount).toBe(6);
    expect(metrics.hikeCount).toBe(3);
    expect(metrics.strengthCount).toBe(1);
    expect(metrics.weeklyDistanceKm).toBeCloseTo(85000 / 1000 / 4.33, 0);
  });

  test('returns safe defaults for missing provider data', () => {
    const metrics = buildMetricsFromProviders();
    expect(metrics.vo2Max).toBe(35);
    expect(metrics.hrv).toBe(40);
    expect(metrics.weeklyDistanceKm).toBe(0);
  });
});
