// A route's climb, measured from a terrain model along its mapped path (#142).
//
// Most OSM routes carry no `ascent` tag, so discovery left them unrated. The
// Waymarked Trails details response already holds each way's geometry; this
// turns it into evenly spaced points, and the heights at those points into a
// climb. Pure — the fetching lives in /api/route-climb — so every rule about
// what the number means is tested here.

import { fromMercator } from '@/lib/osmDiscovery';

/** The nested route tree in a Waymarked Trails `details/relation` response. */
export interface WaymarkedRouteNode {
  main?: WaymarkedRouteNode[];
  ways?: { geometry?: { type?: string; coordinates?: number[][] } }[];
}

type LngLat = [number, number];

/**
 * The route's main line as continuous segments, `[lng, lat]`.
 *
 * Appendices (approaches, alternatives) are left out: they are not the route.
 * A route can break into separate sections where the mapping has gaps; each
 * section is its own segment, because sampling straight across a gap would
 * measure a climb nobody walks. Ways are oriented end to end as they join, since
 * the API does not promise each one runs in the route's direction.
 */
export function routeSegments(node: WaymarkedRouteNode | undefined): LngLat[][] {
  const segments: LngLat[][] = [];
  const walk = (n: WaymarkedRouteNode) => {
    if (n.ways) {
      const line = joinWays(n.ways);
      if (line.length >= 2) segments.push(line);
    }
    n.main?.forEach(walk);
  };
  if (node) walk(node);
  return segments;
}

function joinWays(ways: NonNullable<WaymarkedRouteNode['ways']>): LngLat[] {
  const line: LngLat[] = [];
  for (const way of ways) {
    const coords = way.geometry?.type === 'LineString' ? (way.geometry.coordinates ?? []) : [];
    let points = coords
      .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      .map(([x, y]) => fromMercator(x, y));
    if (points.length < 2) continue;
    const end = line[line.length - 1];
    if (end && metresBetween(end, points[points.length - 1]) < metresBetween(end, points[0])) {
      points = points.reverse();
    }
    // The shared node would otherwise appear twice.
    line.push(...(end && metresBetween(end, points[0]) < 1 ? points.slice(1) : points));
  }
  return line;
}

const EARTH_RADIUS_M = 6_371_000;

/** Haversine distance, metres. */
export function metresBetween([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Closer than the terrain model's own resolution (~30 m) buys nothing. */
const MIN_SPACING_M = 50;

/**
 * Further apart than this and the samples step over the ups and downs between
 * them, so the climb reads low. A route that would need it stays unknown.
 */
const MAX_SPACING_M = 150;

/** Three OpenTopoData calls' worth. */
export const MAX_SAMPLES = 300;

export interface ClimbSamples {
  /** One list of points per segment, `[lng, lat]`. */
  segments: LngLat[][];
  spacingM: number;
}

/**
 * Points every `spacingM` along each segment, ends included, or null when the
 * route is too long to sample closely enough for the climb to be honest.
 */
export function samplePoints(segments: LngLat[][]): ClimbSamples | null {
  const lengths = segments.map(lineLength);
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  // Each segment can add its two ends on top of the evenly spaced points.
  const budget = MAX_SAMPLES - 2 * segments.length;
  const spacingM = Math.max(MIN_SPACING_M, total / Math.max(budget, 1));
  if (spacingM > MAX_SPACING_M || budget <= 0) return null;

  return { segments: segments.map((s) => resample(s, spacingM)), spacingM };
}

function lineLength(line: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += metresBetween(line[i - 1], line[i]);
  return total;
}

function resample(line: LngLat[], spacing: number): LngLat[] {
  const out: LngLat[] = [line[0]];
  let carried = 0;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const step = metresBetween(a, b);
    let at = spacing - carried;
    while (at <= step) {
      const t = at / step;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      at += spacing;
    }
    carried = step - (at - spacing);
  }
  const last = line[line.length - 1];
  if (metresBetween(out[out.length - 1], last) > 1) out.push(last);
  return out;
}

/**
 * Height changes smaller than this are the terrain model's noise, not the path:
 * summing every wobble overstates a flat walk by hundreds of metres.
 */
const NOISE_THRESHOLD_M = 5;

export interface Climb {
  climbM: number;
  descentM: number;
}

/**
 * Total climb and descent across segments, counting a change only once it
 * exceeds the noise threshold. Null if any height is unknown: a climb with a
 * hole in it is a guess.
 */
export function climbFrom(heights: (number | null)[][]): Climb | null {
  let climbM = 0;
  let descentM = 0;
  for (const segment of heights) {
    if (segment.length === 0) continue;
    if (segment.some((h) => h === null)) return null;
    let anchor = segment[0] as number;
    for (const h of segment as number[]) {
      const change = h - anchor;
      if (Math.abs(change) < NOISE_THRESHOLD_M) continue;
      if (change > 0) climbM += change;
      else descentM -= change;
      anchor = h;
    }
  }
  return { climbM: Math.round(climbM), descentM: Math.round(descentM) };
}
