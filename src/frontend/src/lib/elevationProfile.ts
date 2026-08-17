/**
 * The maths behind the planner's elevation profile.
 *
 * Kept out of the component so it can be tested without a DOM: the parts that
 * can be wrong here are arithmetic (ascent totals, scaling) rather than markup.
 *
 * The governing constraint is the same one the rest of this codebase holds to —
 * never render a number the data does not support. The Elevation API returns
 * `null` for points it cannot answer for, and a profile that bridges those gaps
 * draws terrain that does not exist. So unknown samples break the line into
 * separate segments rather than being interpolated across, and the summary
 * reports how much of the route it actually knows about.
 */

export interface ElevationSample {
  /** Distance from the start of the route, in km. */
  distanceKm: number;
  /** Metres above sea level, or null where the lookup failed. */
  elevationM: number | null;
}

export interface ProfileSummary {
  ascentM: number;
  descentM: number;
  minM: number;
  maxM: number;
  /** Samples with a known elevation. */
  knownCount: number;
  totalCount: number;
  /** 0–1. Below 1 means the profile has gaps and says so. */
  coverage: number;
}

/** The drawing box, in SVG user units. */
export interface ProfileBox {
  width: number;
  height: number;
  /** Room for the axis labels; the plot area is inset by this much. */
  padding: { top: number; right: number; bottom: number; left: number };
}

export interface ProfileSegment {
  /** `M … L …` through the known points of one contiguous run. */
  line: string;
  /** The same run closed down to the baseline, for the area fill. */
  area: string;
}

/**
 * Totals over the known samples.
 *
 * Ascent sums the positive steps between *consecutive known* samples. A step
 * that spans a gap is skipped rather than counted: the ground between two
 * points we could not measure is not a climb we can claim.
 *
 * Returns null when nothing is known, so the caller renders "unavailable"
 * instead of a chart of zeroes.
 */
export function summarizeProfile(samples: ElevationSample[]): ProfileSummary | null {
  const known = samples.filter((s) => s.elevationM != null);
  if (known.length === 0) return null;

  let ascentM = 0;
  let descentM = 0;

  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1].elevationM;
    const current = samples[i].elevationM;
    // Both ends must be known, or the step is across a gap.
    if (previous == null || current == null) continue;
    const delta = current - previous;
    if (delta > 0) ascentM += delta;
    else descentM -= delta;
  }

  const values = known.map((s) => s.elevationM as number);

  return {
    ascentM: Math.round(ascentM),
    descentM: Math.round(descentM),
    minM: Math.round(Math.min(...values)),
    maxM: Math.round(Math.max(...values)),
    knownCount: known.length,
    totalCount: samples.length,
    coverage: samples.length === 0 ? 0 : known.length / samples.length,
  };
}

/**
 * Vertical padding as a fraction of the elevation range, so the line never runs
 * along the very edge of the box.
 */
const RANGE_PADDING = 0.12;

/** Used when a route is dead flat, to avoid dividing by a zero range. */
const MIN_RANGE_M = 10;

/**
 * The y-axis range actually drawn.
 *
 * Deliberately fitted to the data rather than anchored at sea level. A 180 m
 * hill plotted from zero is a flat line, which is why every mapping product
 * fits the range — but a fitted baseline can also flatter a gentle route, so the
 * component always labels the real min and max next to the chart. The axis is
 * honest because it is annotated, not because it starts at zero.
 */
export function profileRange(summary: ProfileSummary): { low: number; high: number } {
  const span = Math.max(summary.maxM - summary.minM, MIN_RANGE_M);
  const pad = span * RANGE_PADDING;
  return { low: summary.minM - pad, high: summary.maxM + pad };
}

function scaleTo(box: ProfileBox, range: { low: number; high: number }, totalKm: number) {
  const plotWidth = box.width - box.padding.left - box.padding.right;
  const plotHeight = box.height - box.padding.top - box.padding.bottom;
  const span = range.high - range.low || 1;
  const distance = totalKm || 1;

  return {
    x: (km: number) => box.padding.left + (km / distance) * plotWidth,
    // SVG y grows downward, so a high elevation is a small y.
    y: (m: number) => box.padding.top + (1 - (m - range.low) / span) * plotHeight,
    baseline: box.height - box.padding.bottom,
  };
}

/** Two decimals is well under a pixel at these sizes and keeps the path short. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * SVG paths for the profile, one pair per contiguous run of known samples.
 *
 * Multiple segments rather than one path is the whole point: a gap in the data
 * becomes a visible break in the line, which is the truthful rendering. A single
 * path would connect across it and invent a slope.
 */
export function profileSegments(
  samples: ElevationSample[],
  box: ProfileBox,
  range: { low: number; high: number }
): ProfileSegment[] {
  const totalKm = samples.length ? samples[samples.length - 1].distanceKm : 0;
  const scale = scaleTo(box, range, totalKm);

  const segments: ProfileSegment[] = [];
  let run: ElevationSample[] = [];

  const flush = () => {
    // A single point has no line to draw, and an area of zero width is invisible
    // — dropping it avoids emitting degenerate paths.
    if (run.length < 2) {
      run = [];
      return;
    }
    const points = run.map(
      (s) => `${round(scale.x(s.distanceKm))},${round(scale.y(s.elevationM as number))}`
    );
    const line = `M${points.join('L')}`;
    const firstX = round(scale.x(run[0].distanceKm));
    const lastX = round(scale.x(run[run.length - 1].distanceKm));
    segments.push({
      line,
      area: `${line}L${lastX},${round(scale.baseline)}L${firstX},${round(scale.baseline)}Z`,
    });
    run = [];
  };

  for (const sample of samples) {
    if (sample.elevationM == null) flush();
    else run.push(sample);
  }
  flush();

  return segments;
}

/**
 * The sample nearest a horizontal position, for the hover crosshair.
 *
 * `ratio` is 0–1 across the plot area. Returns null for an empty profile so the
 * tooltip simply does not appear.
 */
export function sampleAtRatio(samples: ElevationSample[], ratio: number): ElevationSample | null {
  if (samples.length === 0) return null;

  const totalKm = samples[samples.length - 1].distanceKm;
  const targetKm = Math.min(Math.max(ratio, 0), 1) * totalKm;

  let nearest = samples[0];
  let bestGap = Infinity;
  for (const sample of samples) {
    const gap = Math.abs(sample.distanceKm - targetKm);
    if (gap < bestGap) {
      bestGap = gap;
      nearest = sample;
    }
  }
  return nearest;
}

/**
 * Evenly spaced distances for the x-axis ticks, in km.
 *
 * Few and round: an elevation profile is read as a shape, and a dense axis
 * competes with the line it is meant to support.
 */
export function distanceTicks(totalKm: number, count = 3): number[] {
  if (!(totalKm > 0)) return [];
  return Array.from({ length: count }, (_, i) => ((i + 1) / count) * totalKm);
}
