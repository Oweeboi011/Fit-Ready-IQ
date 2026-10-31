/**
 * Heights for a peak, from the fields that were actually measured.
 *
 * Kept out of the component so the rule is written once: the details view used
 * to compute the climb in four places, each as `summit - (jumpoff ?? 0)`, so an
 * unknown start became a start at sea level and the "gain" became the peak's
 * whole altitude.
 */

export interface MountainHeights {
  elevation_m: number | null;
  summit_elevation?: number | null;
  jumpoff_elevation?: number | null;
}

/** The summit height, or null when the Elevation API had nothing. */
export function summitOf(mountain: MountainHeights): number | null {
  return mountain.summit_elevation ?? mountain.elevation_m ?? null;
}

/**
 * Metres climbed from the jump-off to the summit — or null unless both are
 * known and the summit is actually above the start.
 */
export function mountainGain(mountain: MountainHeights): number | null {
  const summit = summitOf(mountain);
  const start = mountain.jumpoff_elevation ?? null;
  if (summit == null || start == null || summit <= start) return null;
  return summit - start;
}
