import type { Activity } from './activityTypes';
import { computeReadiness, type Readiness, type RouteDemand } from './readiness';

/**
 * Readiness, asked the other way round.
 *
 * `computeReadiness` answers "am I ready for this route?", which requires the
 * user to have already found a route. That is backwards for the question people
 * actually arrive with — *what can I do this weekend?* — and it means the best
 * thing in the list is only discoverable by opening every pin in turn.
 *
 * This runs the same scorer across the loaded candidates and splits them into
 * two bands. No new data and no new API: it is the ladder ADR-0003 refers to,
 * built from the scorer that already ships.
 */

/** At or above this, the limiting factor says you can finish it today. */
export const READY_THRESHOLD = 80;

/** The stretch band: hard enough to mean something, close enough to attempt. */
export const STRETCH_THRESHOLD = 60;

/**
 * Metres of climb treated as equivalent to a kilometre of flat, for ranking
 * demand only. The standard hiking rule of thumb, and it never reaches the UI
 * as a number — it decides ordering, not anything anyone reads.
 */
const METRES_PER_FLAT_KM = 100;

export interface Recommendation<T> {
  item: T;
  readiness: Readiness;
  /** Rough total effort, used for ordering. Not displayed. */
  effort: number;
}

export interface Recommendations<T> {
  /** Things you can finish now, biggest first. */
  ready: Recommendation<T>[];
  /** Your next step up, closest to reach first. */
  stretch: Recommendation<T>[];
}

export interface RecommendOptions {
  /** Cap per band. Omit for no cap. */
  limit?: number;
  now?: number;
}

function effortOf(demand: RouteDemand): number {
  return demand.distanceKm + (demand.ascentM ?? 0) / METRES_PER_FLAT_KM;
}

/**
 * Split candidates into what you are ready for and what is one step beyond.
 *
 * The two bands sort by different keys on purpose. Ordering `ready` by score
 * would put the flattest, shortest walk at the top — everything easy scores
 * 100 — which is the least interesting answer to give someone asking what they
 * can do. It sorts by demand instead, so the first suggestion is the *biggest*
 * thing they can currently finish. `stretch` sorts by score, because there the
 * useful answer is the one nearest to being within reach.
 */
export function recommendRoutes<T>(
  items: readonly T[],
  toDemand: (item: T) => RouteDemand,
  activities: Activity[],
  options: RecommendOptions = {}
): Recommendations<T> {
  return bandRecommendations(
    items.map((item) => {
      const demand = toDemand(item);
      return { item, demand, readiness: computeReadiness(demand, activities, options.now) };
    }),
    options
  );
}

/**
 * The same split, over readiness that has already been computed.
 *
 * The sidebar scores every visible route anyway, so re-running the scorer to
 * band them would double that work on every render for an identical answer.
 */
export function bandRecommendations<T>(
  entries: readonly { item: T; demand: RouteDemand; readiness: Readiness }[],
  options: Pick<RecommendOptions, 'limit'> = {}
): Recommendations<T> {
  const ready: Recommendation<T>[] = [];
  const stretch: Recommendation<T>[] = [];

  for (const { item, demand, readiness } of entries) {
    // `unknown` means we could not answer — never a band.
    if (readiness.score === null) continue;

    const entry: Recommendation<T> = { item, readiness, effort: effortOf(demand) };

    if (readiness.score >= READY_THRESHOLD) ready.push(entry);
    else if (readiness.score >= STRETCH_THRESHOLD) stretch.push(entry);
  }

  ready.sort((a, b) => b.effort - a.effort);
  stretch.sort((a, b) => (b.readiness.score ?? 0) - (a.readiness.score ?? 0));

  const limit = options.limit;
  return {
    ready: limit == null ? ready : ready.slice(0, limit),
    stretch: limit == null ? stretch : stretch.slice(0, limit),
  };
}
