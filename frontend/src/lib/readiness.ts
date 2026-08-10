import type { Activity } from './activityTypes';

/**
 * Can this person finish this route?
 *
 * The whole product is built on this question — "Know if you can finish it,
 * before you are halfway up" — and until now nothing answered it.
 *
 * The score is deliberately gated by the *limiting factor* rather than an
 * average. Someone with a large weekly volume who has never climbed more than
 * 200 m is not ready for a 1,200 m day, and averaging would hide exactly the
 * thing that turns them back. So the overall score is the weakest component,
 * and that component is named so the answer is actionable rather than a number.
 *
 * Everything here comes from activities the user actually recorded. There is no
 * default athlete and no assumed baseline: with no training data the result is
 * `unknown`, not a guess.
 */

/** Matches the landing page's claim of "your last eight weeks". */
export const TRAINING_WINDOW_WEEKS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReadinessLevel = 'ready' | 'nearly' | 'build' | 'not-yet' | 'unknown';

export type LimiterId = 'distance' | 'ascent' | 'volume';

export interface ReadinessFactor {
  id: LimiterId;
  label: string;
  /** 0–100. What fraction of the route's demand your training covers. */
  score: number;
  /** What you have done, in the factor's own unit. */
  capacity: string;
  /** What the route asks for. */
  demand: string;
}

export interface Readiness {
  level: ReadinessLevel;
  /** 0–100, or null when there is not enough data to say. */
  score: number | null;
  label: string;
  /** One sentence naming the limiting factor, or why we cannot answer. */
  summary: string;
  factors: ReadinessFactor[];
  /** Set when the route itself is missing data we needed. */
  incomplete: boolean;
}

export interface RouteDemand {
  distanceKm: number;
  /** Null when the Elevation API had nothing — we then skip the ascent factor. */
  ascentM: number | null;
}

/**
 * How much of a demand a capacity covers, as 0–100.
 *
 * Meeting the demand is 100; there is no credit above it, because having run
 * twice the distance does not make you twice as ready.
 */
function cover(capacity: number, demand: number): number {
  if (demand <= 0) return 100;
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((capacity / demand) * 100));
}

function levelFor(score: number): { level: ReadinessLevel; label: string } {
  if (score >= 80) return { level: 'ready', label: 'Ready' };
  if (score >= 60) return { level: 'nearly', label: 'Nearly ready' };
  if (score >= 40) return { level: 'build', label: 'Build up first' };
  return { level: 'not-yet', label: 'Not yet' };
}

const UNKNOWN: Readiness = {
  level: 'unknown',
  score: null,
  label: 'Not enough data',
  summary: 'Connect a device or import a GPX file to see whether you are ready for this.',
  factors: [],
  incomplete: true,
};

/**
 * Score a route against recent training.
 *
 * `now` is injectable so the window is testable without freezing global time.
 */
export function computeReadiness(
  route: RouteDemand,
  activities: Activity[],
  now: number = Date.now()
): Readiness {
  const since = now - TRAINING_WINDOW_WEEKS * 7 * DAY_MS;
  const recent = activities.filter((a) => {
    const t = new Date(a.start_date).getTime();
    return Number.isFinite(t) && t >= since;
  });

  if (recent.length === 0) return UNKNOWN;
  if (!Number.isFinite(route.distanceKm) || route.distanceKm <= 0) return UNKNOWN;

  const longestKm = Math.max(...recent.map((a) => a.distance_km));
  const biggestAscentM = Math.max(...recent.map((a) => a.elevation_gain_m));
  const totalKm = recent.reduce((sum, a) => sum + a.distance_km, 0);
  const weeklyKm = totalKm / TRAINING_WINDOW_WEEKS;

  const factors: ReadinessFactor[] = [
    {
      id: 'distance',
      label: 'Longest recent outing',
      score: cover(longestKm, route.distanceKm),
      capacity: `${longestKm.toFixed(1)} km`,
      demand: `${route.distanceKm.toFixed(1)} km`,
    },
    {
      // Weekly base guards against a single heroic outing reading as fitness.
      // Half the route distance per week is a modest, defensible bar.
      id: 'volume',
      label: 'Weekly volume',
      score: cover(weeklyKm, route.distanceKm * 0.5),
      capacity: `${weeklyKm.toFixed(1)} km/week`,
      demand: `${(route.distanceKm * 0.5).toFixed(1)} km/week`,
    },
  ];

  // Only score ascent when we know what the route actually asks for.
  const incomplete = route.ascentM == null;
  if (route.ascentM != null) {
    factors.push({
      id: 'ascent',
      label: 'Biggest recent climb',
      score: cover(biggestAscentM, route.ascentM),
      capacity: `${Math.round(biggestAscentM)} m`,
      demand: `${Math.round(route.ascentM)} m`,
    });
  }

  const limiter = factors.reduce((worst, f) => (f.score < worst.score ? f : worst));
  const { level, label } = levelFor(limiter.score);

  const summary =
    limiter.score >= 80
      ? `Your training covers this route's ${limiter.label.toLowerCase()}.`
      : `Limited by ${limiter.label.toLowerCase()}: ${limiter.capacity} against ${limiter.demand}.`;

  return {
    level,
    score: limiter.score,
    label,
    summary: incomplete
      ? `${summary} Elevation for this route is unknown, so climbing is not included.`
      : summary,
    factors,
    incomplete,
  };
}

/** Colour per level, shared by the badge, the card and the detail view. */
export const READINESS_COLORS: Record<ReadinessLevel, string> = {
  ready: '#22c55e',
  nearly: '#84cc16',
  build: '#f59e0b',
  'not-yet': '#ef4444',
  unknown: '#64748b',
};
