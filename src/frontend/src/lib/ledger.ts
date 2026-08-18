import type { Activity } from './activityTypes';

/**
 * What you have actually done, kept.
 *
 * `fitnessScore.ts` answers "how is this month going" and resets with the
 * month — deliberately, because that is what a training score should do. The
 * consequence was that nothing in the product accumulated: an explorer with
 * four years of imported history saw the same screen on the 1st as someone who
 * signed up that morning. This is the other half of that — the record rather
 * than the score.
 *
 * Every figure is summed from Activities the user actually imported. There is
 * no target, no goal and no streak here, because those would be invented; a
 * total is a fact about what happened.
 */

/** Sea level to summit, in metres. The reference for the climb comparison. */
export const EVEREST_HEIGHT_M = 8849;

export interface LedgerTotals {
  activities: number;
  distanceKm: number;
  ascentM: number;
  movingTimeS: number;
}

export interface PersonalRecord {
  activity: Activity;
  /** The value that won, in the record's own unit. */
  value: number;
}

export interface PersonalRecords {
  longestDistance: PersonalRecord | null;
  biggestAscent: PersonalRecord | null;
  longestDuration: PersonalRecord | null;
}

export interface Ledger {
  lifetime: LedgerTotals;
  yearToDate: LedgerTotals;
  /** The calendar year `yearToDate` covers. */
  year: number;
  records: PersonalRecords;
  /**
   * Lifetime ascent as a multiple of Everest from sea level. A comparison, not
   * a claim about mountains climbed — the UI must not phrase it as summits.
   */
  everests: number;
  /** ISO date of the earliest activity, or null when there are none. */
  since: string | null;
}

const EMPTY_TOTALS: LedgerTotals = {
  activities: 0,
  distanceKm: 0,
  ascentM: 0,
  movingTimeS: 0,
};

/**
 * Imported files produce dirty numbers — a GPX with no elevation track yields
 * `NaN`, and a truncated one can yield a negative distance. Neither should
 * silently poison a lifetime total, so both read as zero.
 */
function clean(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function totals(activities: Activity[]): LedgerTotals {
  return activities.reduce<LedgerTotals>(
    (acc, activity) => ({
      activities: acc.activities + 1,
      distanceKm: acc.distanceKm + clean(activity.distance_km),
      ascentM: acc.ascentM + clean(activity.elevation_gain_m),
      movingTimeS: acc.movingTimeS + clean(activity.moving_time_s),
    }),
    { ...EMPTY_TOTALS }
  );
}

/** Epoch millis, or null when the activity has no usable date. */
function timestamp(activity: Activity): number | null {
  const ms = new Date(activity.start_date).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function bestBy(activities: Activity[], measure: (a: Activity) => number): PersonalRecord | null {
  let best: PersonalRecord | null = null;
  for (const activity of activities) {
    const value = clean(measure(activity));
    // A record of zero is not a record — it means the field was missing.
    if (value <= 0) continue;
    if (best === null || value > best.value) best = { activity, value };
  }
  return best;
}

/**
 * Build the ledger.
 *
 * `now` is injected so the year boundary is testable rather than dependent on
 * when the suite happens to run.
 */
export function buildLedger(activities: Activity[], now: Date = new Date()): Ledger {
  const year = now.getFullYear();

  // Activities with an unreadable date still count toward lifetime totals —
  // the effort happened — but cannot be placed in a year.
  const thisYear = activities.filter((activity) => {
    const ms = timestamp(activity);
    return ms !== null && new Date(ms).getFullYear() === year;
  });

  const lifetime = totals(activities);

  const dates = activities.map(timestamp).filter((ms): ms is number => ms !== null);
  const since = dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null;

  return {
    lifetime,
    yearToDate: totals(thisYear),
    year,
    records: {
      longestDistance: bestBy(activities, (a) => a.distance_km),
      biggestAscent: bestBy(activities, (a) => a.elevation_gain_m),
      longestDuration: bestBy(activities, (a) => a.moving_time_s),
    },
    everests: lifetime.ascentM / EVEREST_HEIGHT_M,
    since,
  };
}
