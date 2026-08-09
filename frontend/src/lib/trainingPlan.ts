import type { Readiness } from './readiness';

/**
 * How long until you can finish this, and what to do meanwhile.
 *
 * The readiness score already names the limiting factor — "your longest recent
 * outing is 8 km against this route's 20 km". This turns that gap into a date
 * and a set of weekly targets, so the answer stops being "not yet" and becomes
 * "not yet, six weeks".
 *
 * Progression uses the ten-percent rule: raise weekly load by no more than ~10%
 * a week. It is the standard endurance guideline and it is deliberately
 * conservative, because the failure mode of an aggressive plan is an injury
 * that costs the whole season.
 *
 * This is a progression guideline computed from the user's own recorded
 * training. It is not coaching, and the UI says so — we have no knowledge of
 * their history, injuries or age, and pretending otherwise would be the same
 * class of invention this codebase has spent its time removing.
 */

/** Weekly increase. Conservative on purpose. */
export const WEEKLY_PROGRESSION = 0.1;

/** Past this the route is a season goal, not a plan; we stop projecting. */
export const MAX_PLAN_WEEKS = 24;

export type PlanStatus = 'ready' | 'plan' | 'too-far' | 'no-baseline' | 'unknown';

export interface WeeklyTarget {
  /** 1-based. */
  week: number;
  /** Target for the longest single outing that week, in km. */
  longestKm: number;
  /** Target total for that week, in km. */
  weeklyKm: number;
  /** Target ascent for the biggest climb, or null when the route's is unknown. */
  ascentM: number | null;
}

export interface TrainingPlan {
  status: PlanStatus;
  /** Weeks until every factor covers the route. Zero when already ready. */
  weeks: number;
  targets: WeeklyTarget[];
  /** One sentence a person can act on. */
  summary: string;
  /** The factor that sets the length, so effort goes where it counts. */
  focus: string | null;
}

/**
 * Weeks of 10% growth to get from `capacity` to `demand`.
 *
 * Returns 0 when already there, and null when there is no baseline to grow
 * from — you cannot compound upward from zero.
 */
export function weeksToClose(capacity: number, demand: number): number | null {
  if (demand <= 0 || capacity >= demand) return 0;
  if (capacity <= 0) return null;
  return Math.ceil(Math.log(demand / capacity) / Math.log(1 + WEEKLY_PROGRESSION));
}

/** Parses the "12.5 km" / "450 m" / "9.0 km/week" strings the factors carry. */
function amount(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildTrainingPlan(readiness: Readiness): TrainingPlan {
  if (readiness.score == null || readiness.factors.length === 0) {
    return {
      status: 'unknown',
      weeks: 0,
      targets: [],
      summary: 'Connect your training and we can work out how long this would take.',
      focus: null,
    };
  }

  if (readiness.score >= 100) {
    return {
      status: 'ready',
      weeks: 0,
      targets: [],
      summary: 'Your training already covers this route. Keep ticking over and go.',
      focus: null,
    };
  }

  const distance = readiness.factors.find((f) => f.id === 'distance');
  const volume = readiness.factors.find((f) => f.id === 'volume');
  const ascent = readiness.factors.find((f) => f.id === 'ascent');

  const gaps = readiness.factors.map((factor) => ({
    factor,
    weeks: weeksToClose(amount(factor.capacity), amount(factor.demand)),
  }));

  // No baseline anywhere means there is nothing to compound from.
  if (gaps.some((g) => g.weeks === null)) {
    return {
      status: 'no-baseline',
      weeks: 0,
      targets: [],
      summary: 'Record a few outings first — a plan needs a starting point to build from.',
      focus: null,
    };
  }

  const weeks = Math.max(...gaps.map((g) => g.weeks ?? 0));
  const slowest = gaps.reduce((worst, g) => ((g.weeks ?? 0) > (worst.weeks ?? 0) ? g : worst));

  if (weeks > MAX_PLAN_WEEKS) {
    return {
      status: 'too-far',
      weeks,
      targets: [],
      summary: `This is more than ${MAX_PLAN_WEEKS} weeks away at a safe rate of progression. Pick a smaller route first and come back to it.`,
      focus: slowest.factor.label,
    };
  }

  // Grow every metric together, capped at what the route actually asks for —
  // there is no reason to train past the demand.
  const grow = (from: number, to: number, week: number) =>
    Math.min(to, from * Math.pow(1 + WEEKLY_PROGRESSION, week));

  const targets: WeeklyTarget[] = Array.from({ length: weeks }, (_, i) => {
    const week = i + 1;
    return {
      week,
      longestKm: distance
        ? Math.round(grow(amount(distance.capacity), amount(distance.demand), week) * 10) / 10
        : 0,
      weeklyKm: volume
        ? Math.round(grow(amount(volume.capacity), amount(volume.demand), week) * 10) / 10
        : 0,
      ascentM: ascent
        ? Math.round(grow(amount(ascent.capacity), amount(ascent.demand), week))
        : null,
    };
  });

  return {
    status: 'plan',
    weeks,
    targets,
    summary: `About ${weeks} ${weeks === 1 ? 'week' : 'weeks'} away, building at 10% per week. ${slowest.factor.label} is what sets the pace.`,
    focus: slowest.factor.label,
  };
}
