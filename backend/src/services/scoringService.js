'use strict';

/**
 * Fitness Readiness Scoring Service
 *
 * Calculates a composite readiness score (0-100) from five weighted components:
 *
 *   Component               Weight   Source
 *   ─────────────────────── ──────   ────────────────────────
 *   Aerobic Fitness          30 %    VO2Max + recent cardio
 *   Recovery Status          25 %    HRV + sleep + resting HR
 *   Recent Training Load     20 %    Weekly mileage / elevation
 *   Strength Indicators      15 %    Hikes + strength sessions
 *   Consistency              10 %    Activity frequency (30 days)
 *
 * All sub-scores are normalised to 0-100 before weighting.
 */

/** Weights must sum to 1.0 */
const WEIGHTS = {
  aerobic:     0.30,
  recovery:    0.25,
  trainingLoad: 0.20,
  strength:    0.15,
  consistency: 0.10,
};

// ─── Normalisation helpers ───────────────────────────────────────────────────

/**
 * Clamp a value to [0, 100].
 * @param {number} v
 * @returns {number}
 */
function clamp(v) {
  return Math.min(100, Math.max(0, v));
}

/**
 * Linear interpolation: maps `value` from [inMin, inMax] → [0, 100].
 * Values outside the input range are clamped.
 * @param {number} value
 * @param {number} inMin
 * @param {number} inMax
 * @returns {number}
 */
function linearScale(value, inMin, inMax) {
  if (inMax === inMin) return 50;
  return clamp(((value - inMin) / (inMax - inMin)) * 100);
}

// ─── Component scorers ────────────────────────────────────────────────────────

/**
 * Score aerobic fitness (0-100).
 *
 * Inputs:
 *   - vo2Max:            VO2 Max (ml/kg/min). Elite = 60+, sedentary ≈ 30.
 *   - recentCardioCount: Number of cardio activities in last 30 days.
 *   - avgHeartRate:      Average HR across recent activities.
 *
 * @param {Object} params
 * @param {number} [params.vo2Max=35]
 * @param {number} [params.recentCardioCount=0]
 * @param {number} [params.avgHeartRate=0]
 * @returns {number} 0-100
 */
function scoreAerobic({ vo2Max = 35, recentCardioCount = 0, avgHeartRate = 0 }) {
  // VO2 Max score: 28 ml/kg/min → 0 pts, 60+ → 100 pts
  const vo2Score = linearScale(vo2Max, 28, 60);

  // Recent cardio frequency: 0 sessions → 0 pts, 12+ sessions / 30 days → 100 pts
  const cardioScore = linearScale(recentCardioCount, 0, 12);

  // Average HR efficiency (lower is better for aerobic fitness, assuming 60-180 bpm range)
  // A lower avg HR at the same perceived effort indicates better aerobic base.
  // If no HR data, default to neutral 50.
  const hrScore = avgHeartRate > 0 ? linearScale(180 - avgHeartRate, 0, 120) : 50;

  return clamp(Math.round(vo2Score * 0.55 + cardioScore * 0.30 + hrScore * 0.15));
}

/**
 * Score recovery status (0-100).
 *
 * Inputs:
 *   - hrv:               Heart Rate Variability in ms. Higher = better recovery.
 *   - sleepQualityScore: 0-100 (from wearable).
 *   - restingHeartRate:  BPM. Lower is generally better.
 *   - recoveryScore:     Wearable recovery score 0-100 (optional).
 *
 * @param {Object} params
 * @param {number} [params.hrv=40]
 * @param {number} [params.sleepQualityScore=50]
 * @param {number} [params.restingHeartRate=70]
 * @param {number} [params.recoveryScore=50]
 * @returns {number} 0-100
 */
function scoreRecovery({
  hrv = 40,
  sleepQualityScore = 50,
  restingHeartRate = 70,
  recoveryScore = 50,
}) {
  // HRV: 20 ms = poor, 90 ms = excellent
  const hrvScore = linearScale(hrv, 20, 90);

  // Sleep quality from wearable directly (already 0-100)
  const sleepScore = clamp(sleepQualityScore);

  // Resting HR: 40 bpm = elite, 80+ = poor
  const rhrScore = linearScale(80 - restingHeartRate, 0, 40);

  // Wearable recovery score (already 0-100)
  const deviceRecoveryScore = clamp(recoveryScore);

  return clamp(Math.round(
    hrvScore * 0.35 +
    sleepScore * 0.25 +
    rhrScore * 0.20 +
    deviceRecoveryScore * 0.20,
  ));
}

/**
 * Score recent training load (0-100).
 *
 * Inputs:
 *   - weeklyDistanceKm:  Average weekly running/hiking distance (km).
 *   - weeklyElevation:   Average weekly elevation gain (metres).
 *   - trainingLoad:      Wearable training load index.
 *
 * @param {Object} params
 * @param {number} [params.weeklyDistanceKm=0]
 * @param {number} [params.weeklyElevation=0]
 * @param {number} [params.trainingLoad=0]
 * @returns {number} 0-100
 */
function scoreTrainingLoad({ weeklyDistanceKm = 0, weeklyElevation = 0, trainingLoad = 0 }) {
  // Weekly distance: 0 km → 0, 80 km → 100
  const distScore = linearScale(weeklyDistanceKm, 0, 80);

  // Weekly elevation: 0 m → 0, 3000 m → 100
  const elevScore = linearScale(weeklyElevation, 0, 3000);

  // Wearable training load index: 0 → 0, 500 → 100
  const loadScore = linearScale(trainingLoad, 0, 500);

  return clamp(Math.round(distScore * 0.40 + elevScore * 0.35 + loadScore * 0.25));
}

/**
 * Score strength and hiking indicators (0-100).
 *
 * Inputs:
 *   - hikeCount:     Number of hikes in last 30 days.
 *   - strengthCount: Number of strength/gym sessions in last 30 days.
 *   - totalElevation: Total elevation gained in last 30 days (metres).
 *
 * @param {Object} params
 * @param {number} [params.hikeCount=0]
 * @param {number} [params.strengthCount=0]
 * @param {number} [params.totalElevation=0]
 * @returns {number} 0-100
 */
function scoreStrength({ hikeCount = 0, strengthCount = 0, totalElevation = 0 }) {
  // Hike frequency: 0 → 0, 8+ → 100
  const hikeScore = linearScale(hikeCount, 0, 8);

  // Strength sessions: 0 → 0, 12+ → 100
  const strengthScore = linearScale(strengthCount, 0, 12);

  // Accumulated elevation (proxy for leg strength): 0 → 0, 5000 m → 100
  const elevScore = linearScale(totalElevation, 0, 5000);

  return clamp(Math.round(hikeScore * 0.40 + strengthScore * 0.30 + elevScore * 0.30));
}

/**
 * Score activity consistency (0-100).
 *
 * Inputs:
 *   - activityCount30d: Total activities in last 30 days.
 *   - activeDays30d:    Number of distinct days with at least one activity.
 *
 * @param {Object} params
 * @param {number} [params.activityCount30d=0]
 * @param {number} [params.activeDays30d=0]
 * @returns {number} 0-100
 */
function scoreConsistency({ activityCount30d = 0, activeDays30d = 0 }) {
  // Total activities: 0 → 0, 20+ → 100
  const countScore = linearScale(activityCount30d, 0, 20);

  // Active days: 0 → 0, 20 out of 30 days → 100
  const daysScore = linearScale(activeDays30d, 0, 20);

  return clamp(Math.round(countScore * 0.50 + daysScore * 0.50));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calculate the overall fitness readiness score (0-100).
 *
 * @param {Object} metrics - Aggregated fitness metrics.
 * @param {number}  [metrics.vo2Max]
 * @param {number}  [metrics.recentCardioCount]
 * @param {number}  [metrics.avgHeartRate]
 * @param {number}  [metrics.hrv]
 * @param {number}  [metrics.sleepQualityScore]
 * @param {number}  [metrics.restingHeartRate]
 * @param {number}  [metrics.recoveryScore]
 * @param {number}  [metrics.weeklyDistanceKm]
 * @param {number}  [metrics.weeklyElevation]
 * @param {number}  [metrics.trainingLoad]
 * @param {number}  [metrics.hikeCount]
 * @param {number}  [metrics.strengthCount]
 * @param {number}  [metrics.totalElevation]
 * @param {number}  [metrics.activityCount30d]
 * @param {number}  [metrics.activeDays30d]
 * @returns {{
 *   overall: number,
 *   components: {aerobic: number, recovery: number, trainingLoad: number, strength: number, consistency: number},
 *   label: string,
 *   advice: string
 * }}
 */
function calculateScore(metrics = {}) {
  const components = {
    aerobic:      scoreAerobic(metrics),
    recovery:     scoreRecovery(metrics),
    trainingLoad: scoreTrainingLoad(metrics),
    strength:     scoreStrength(metrics),
    consistency:  scoreConsistency(metrics),
  };

  const overall = clamp(Math.round(
    components.aerobic      * WEIGHTS.aerobic +
    components.recovery     * WEIGHTS.recovery +
    components.trainingLoad * WEIGHTS.trainingLoad +
    components.strength     * WEIGHTS.strength +
    components.consistency  * WEIGHTS.consistency,
  ));

  return {
    overall,
    components,
    label: scoreLabel(overall),
    advice: scoreAdvice(overall, components),
  };
}

/**
 * Map a numeric score to a human-readable label.
 * @param {number} score
 * @returns {string}
 */
function scoreLabel(score) {
  if (score >= 85) return 'Peak';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Moderate';
  if (score >= 30) return 'Building';
  return 'Rest';
}

/**
 * Generate brief personalised advice based on the score and its weakest component.
 * @param {number} overall
 * @param {Object} components
 * @returns {string}
 */
function scoreAdvice(overall, components) {
  const weakest = Object.entries(components).reduce((a, b) => (b[1] < a[1] ? b : a));
  const [weakKey, weakVal] = weakest;

  if (overall >= 85) {
    return 'You are in peak condition. Take on challenging routes!';
  }
  if (overall >= 70) {
    return 'Great fitness base. Tackle moderate to hard routes with confidence.';
  }

  const tips = {
    aerobic:      'Focus on increasing aerobic capacity with longer, easier efforts.',
    recovery:     'Prioritise sleep and rest days to allow your body to recover.',
    trainingLoad: 'Gradually increase weekly mileage and elevation to build load.',
    strength:     'Add more hikes and strength sessions to improve leg power.',
    consistency:  'Aim for more frequent activity; consistency is key.',
  };

  const tip = weakVal < 40 ? tips[weakKey] : 'Keep up the good work and build steadily.';
  return tip;
}

/**
 * Build a fitness metrics object from raw Strava, Garmin, and COROS data.
 * This is a convenience adapter so route handlers don't need to know
 * the exact field mapping.
 *
 * @param {Object} [stravaData]   - Output of stravaService.summariseActivities()
 * @param {Object} [garminData]   - Output of garminService.getMetrics()
 * @param {Object} [corosData]    - Output of corosService.getMetrics()
 * @returns {Object} Metrics object suitable for calculateScore()
 */
function buildMetricsFromProviders(stravaData = {}, garminData = {}, corosData = {}) {
  const activities = stravaData.activityTypes || {};
  const cardioTypes = ['Run', 'Ride', 'Swim', 'VirtualRun', 'VirtualRide'];
  const recentCardioCount = cardioTypes.reduce((sum, t) => sum + (activities[t] || 0), 0);
  const hikeCount = activities['Hike'] || 0;
  const strengthCount = (activities['WeightTraining'] || 0) + (activities['Workout'] || 0);

  // Estimate weekly figures from 30-day totals (÷ 4.33 weeks)
  const weeklyDistanceKm = (stravaData.totalDistance || 0) / 1000 / 4.33;
  const weeklyElevation = (stravaData.totalElevation || 0) / 4.33;

  return {
    // Aerobic
    vo2Max:             garminData.vo2Max || 35,
    recentCardioCount,
    avgHeartRate:       stravaData.avgHeartRate || 0,

    // Recovery
    hrv:                corosData.hrv || 40,
    sleepQualityScore:  corosData.sleepQualityScore || 50,
    restingHeartRate:   garminData.restingHeartRate || 70,
    recoveryScore:      corosData.recoveryScore || 50,

    // Training load
    weeklyDistanceKm:   Math.round(weeklyDistanceKm * 10) / 10,
    weeklyElevation:    Math.round(weeklyElevation),
    trainingLoad:       garminData.trainingLoad || corosData.trainingLoad || 0,

    // Strength
    hikeCount,
    strengthCount,
    totalElevation:     stravaData.totalElevation || 0,

    // Consistency
    activityCount30d:   stravaData.totalActivities || 0,
    activeDays30d:      Math.min(30, stravaData.totalActivities || 0), // approximation
  };
}

module.exports = {
  calculateScore,
  scoreAerobic,
  scoreRecovery,
  scoreTrainingLoad,
  scoreStrength,
  scoreConsistency,
  scoreLabel,
  scoreAdvice,
  buildMetricsFromProviders,
  WEIGHTS,
};
