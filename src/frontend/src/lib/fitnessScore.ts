import type { Activity } from './activityTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days counted so far this calendar month, floored at 7.
 *
 * The floor matters: on the 1st, a month-to-date window holds almost nothing,
 * so un-scaled targets would show "Getting Started" to someone who trained hard
 * all through yesterday, and a single ride on day 2 would score as elite. Seven
 * days is the shortest window over which the targets below mean anything.
 */
function elapsedMonthDays(now: Date): number {
  return Math.max(7, Math.min(31, now.getDate()));
}

/**
 * Compute a 0–100 fitness score from this calendar month's activities.
 *
 * The window is month-to-date, not a rolling 30 days, so the score answers
 * "how is this month going" and resets with the month. Targets are pro-rated
 * across the days elapsed so mid-month figures are comparable to a full month.
 */
export function computeFitnessScore(activities: Activity[]): {
  score: number;
  label: string;
  color: string;
  breakdown: { label: string; value: number; max: number; color: string }[];
} {
  if (activities.length === 0) {
    return { score: 0, label: 'No Data', color: '#475569', breakdown: [] };
  }

  const nowDate = new Date();
  const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  const recent = activities.filter((a) => new Date(a.start_date).getTime() >= monthStart);

  if (recent.length === 0) {
    return {
      score: 0,
      label: 'No activity yet',
      color: '#ef4444',
      breakdown: [
        { label: 'Volume', value: 0, max: 25, color: '#3b82f6' },
        { label: 'Frequency', value: 0, max: 25, color: '#8b5cf6' },
        { label: 'Elevation', value: 0, max: 25, color: '#22c55e' },
        { label: 'Consistency', value: 0, max: 20, color: '#f59e0b' },
      ],
    };
  }

  // Monthly targets scaled to the portion of the month that has happened.
  const daysElapsed = elapsedMonthDays(nowDate);
  const monthFraction = daysElapsed / 30;

  // Volume (0–25): 100 km/month = full score — achievable for active recreational athletes
  const recentKm = recent.reduce((s, a) => s + a.distance_km, 0);
  const volumeScore = Math.min(25, (recentKm / (100 * monthFraction)) * 25);

  // Frequency (0–25): 12 activities/month = full score — 3×/week is a solid training cadence
  const freqScore = Math.min(25, (recent.length / (12 * monthFraction)) * 25);

  // Elevation (0–25): 2,500 m/month = full score — meaningful for trail runners and cyclists
  const recentElev = recent.reduce((s, a) => s + a.elevation_gain_m, 0);
  const elevScore = Math.min(25, (recentElev / (2500 * monthFraction)) * 25);

  // Consistency (0–20): active weeks within the month so far — highest weight,
  // most indicative of habit.
  const weeksElapsed = Math.max(1, Math.ceil(daysElapsed / 7));
  const weekBuckets = new Set(
    recent.map((a) => Math.floor((new Date(a.start_date).getTime() - monthStart) / (7 * DAY_MS)))
  );
  const consistencyScore = Math.min(20, (weekBuckets.size / weeksElapsed) * 20);

  // Intensity bonus (0–5): if heart rate data is present, reward effort
  const hrActivities = recent.filter((a) => (a.avg_heartrate ?? 0) > 0);
  let intensityBonus = 0;
  if (hrActivities.length > 0) {
    const avgHR =
      hrActivities.reduce((s, a) => s + (a.avg_heartrate ?? 0), 0) / hrActivities.length;
    // Zone 2 baseline ~130 bpm. Reward anything consistently above 130.
    intensityBonus = Math.min(5, Math.max(0, ((avgHR - 110) / 40) * 5));
  }

  const total = Math.min(
    100,
    Math.round(volumeScore + freqScore + elevScore + consistencyScore + intensityBonus)
  );

  const label =
    total >= 80
      ? 'Elite'
      : total >= 60
        ? 'Advanced'
        : total >= 40
          ? 'Intermediate'
          : total >= 20
            ? 'Beginner'
            : 'Getting Started';

  const color =
    total >= 80
      ? '#22c55e'
      : total >= 60
        ? '#84cc16'
        : total >= 40
          ? '#eab308'
          : total >= 20
            ? '#f97316'
            : '#ef4444';

  return {
    score: total,
    label,
    color,
    breakdown: [
      { label: 'Volume', value: Math.round(volumeScore), max: 25, color: '#3b82f6' },
      { label: 'Frequency', value: Math.round(freqScore), max: 25, color: '#8b5cf6' },
      { label: 'Elevation', value: Math.round(elevScore), max: 25, color: '#22c55e' },
      { label: 'Consistency', value: Math.round(consistencyScore), max: 20, color: '#f59e0b' },
    ],
  };
}
