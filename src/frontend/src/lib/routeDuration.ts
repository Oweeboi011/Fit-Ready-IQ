/**
 * How long a climb takes, by Naismith's rule.
 *
 * The ascent half of Naismith — roughly 300 m of climbing an hour — was already
 * being computed inline in two places in `DetailsModal` and shown to the user as
 * an hour range. It moved here when the weather window needed the same number:
 * a window is scoped to a route's duration (`weatherWindow.ts`), and deriving
 * that from a different rule than the one on screen would let the modal show a
 * six-hour day beside a four-hour window and be right in neither place.
 *
 * This is an estimate from terrain, not a promise about a person. It is the same
 * class of derivation as the NPS difficulty formula in `routeDifficulty.ts`, and
 * like that one it returns `null` rather than a guess when the input is unknown.
 */

/** Metres of ascent an hour. The standard Naismith figure. */
export const ASCENT_METRES_PER_HOUR = 300;

/** Slower-party multiplier for the upper bound of the range. */
const UPPER_BOUND_FACTOR = 1.3;

export interface DurationEstimate {
  /** Optimistic hours, at least 1. */
  low: number;
  /** Hours allowing for a slower party. */
  high: number;
}

/**
 * An hour range for a climb, or `null` when the ascent is unknown.
 *
 * Elevation gain is frequently `null` — the Elevation API may have nothing for
 * a place — and the caller is expected to render "unknown" rather than fill it.
 */
export function estimateAscentHours(
  elevationGainM: number | null | undefined
): DurationEstimate | null {
  if (elevationGainM == null || !Number.isFinite(elevationGainM) || elevationGainM <= 0) {
    return null;
  }
  const hours = elevationGainM / ASCENT_METRES_PER_HOUR;
  return {
    low: Math.max(1, Math.floor(hours)),
    high: Math.ceil(hours * UPPER_BOUND_FACTOR),
  };
}
