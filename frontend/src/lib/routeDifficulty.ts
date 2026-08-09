/**
 * How hard a route is to walk.
 *
 * This used to be read off the Google star rating: 4.5 stars and above was
 * "easy", below 3.5 was "hard", everything else "moderate". A popular trail is
 * not a gentle one, and an unpopular one is not steep — the label had no
 * relationship to the effort involved, which on a difficulty rating is worse
 * than showing nothing.
 *
 * The numbers below come from the National Park Service hiking-difficulty
 * formula used at Shenandoah:
 *
 *     rating = sqrt(2 × elevation gain in feet × distance in miles)
 *
 * with the published bands collapsed from five to the three the UI offers.
 * It only needs distance and ascent, both of which we measure.
 */

export type Difficulty = 'easy' | 'moderate' | 'challenging' | 'unknown';

/**
 * Band edges on the numeric rating.
 *
 * Deliberately higher than the NPS defaults (50 / 100), which are calibrated
 * for casual park visitors. This product is aimed at people whose reference
 * trip is a 15 km summit day with 1,200 m of ascent; on the published bands
 * almost everything they look at would read "challenging", which tells them
 * nothing. At 75 / 175 a flat 10 km is easy, a rolling half-day is moderate,
 * and a summit push is challenging.
 */
const MODERATE_FLOOR = 75;
const CHALLENGING_FLOOR = 175;

const FEET_PER_METRE = 3.28084;
const MILES_PER_KM = 0.621371;

/**
 * The raw NPS numeric rating, or `null` when we lack the inputs.
 *
 * Exposed separately from the band so the value can be shown or sorted on
 * without re-deriving it.
 */
export function difficultyRating(
  distanceKm: number | null | undefined,
  elevationGainM: number | null | undefined
): number | null {
  if (distanceKm == null || elevationGainM == null) return null;
  if (!Number.isFinite(distanceKm) || !Number.isFinite(elevationGainM)) return null;
  if (distanceKm <= 0 || elevationGainM < 0) return null;

  const gainFt = elevationGainM * FEET_PER_METRE;
  const distanceMi = distanceKm * MILES_PER_KM;
  return Math.sqrt(2 * gainFt * distanceMi);
}

/**
 * Difficulty band for a route.
 *
 * Returns `'unknown'` rather than guessing when elevation is unavailable —
 * which happens whenever Google's Elevation API is down or over quota.
 */
export function classifyDifficulty(
  distanceKm: number | null | undefined,
  elevationGainM: number | null | undefined
): Difficulty {
  const rating = difficultyRating(distanceKm, elevationGainM);
  if (rating == null) return 'unknown';
  if (rating < MODERATE_FLOOR) return 'easy';
  if (rating < CHALLENGING_FLOOR) return 'moderate';
  return 'challenging';
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  challenging: 'Challenging',
  unknown: 'Unrated',
};

/** One colour per band, used by the chips, cards, map pins and modal alike. */
export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: '#22c55e',
  moderate: '#f59e0b',
  challenging: '#ef4444',
  unknown: '#64748b',
};

export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'moderate' || value === 'challenging' || value === 'unknown';
}

/**
 * Tolerate the old `'hard'` value.
 *
 * Cached place payloads and saved places written before the rename still carry
 * it, and a stale cache entry should not render as "Unrated".
 */
export function normaliseDifficulty(value: unknown): Difficulty {
  if (value === 'hard' || value === 'strenuous') return 'challenging';
  return isDifficulty(value) ? value : 'unknown';
}
