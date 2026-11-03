'use client';

import { useEffect, useState } from 'react';

import type { DetailsData, RouteDetails } from '@/lib/detailsData';
import { classifyDifficulty } from '@/lib/routeDifficulty';

/**
 * Where the climb on screen came from. `tagged` is the route's own data (or
 * there is nothing to measure); `measured` came from the terrain model along
 * its path (#142); `unavailable` means we asked and got no number, and the
 * view keeps saying unknown.
 */
export type ClimbSource = 'tagged' | 'measuring' | 'measured' | 'unavailable';

/** `wmt-hiking-123` → the Waymarked Trails site and relation it was discovered from. */
export function waymarkedRef(id: string): { site: string; id: string } | null {
  const match = /^wmt-(hiking|mtb)-(\d+)$/.exec(id);
  return match ? { site: match[1], id: match[2] } : null;
}

/** Up and down along the route as mapped. */
export interface MeasuredClimb {
  climbM: number;
  descentM: number;
}

/** The Waymarked Trails route to measure, or null when there is nothing to measure. */
function toMeasure(data: DetailsData | null) {
  return data?.type === 'route' && data.elevation_gain_m == null ? waymarkedRef(data.id) : null;
}

/** Answers for this session. The CDN holds them for a month; this saves the round trip. */
const measured = new Map<string, MeasuredClimb | null>();

async function fetchClimb(site: string, id: string): Promise<MeasuredClimb | null> {
  const res = await fetch(`/api/route-climb?site=${site}&id=${id}`);
  const body = (await res.json().catch(() => null)) as Partial<MeasuredClimb> | null;
  const climb =
    typeof body?.climbM === 'number' && typeof body.descentM === 'number'
      ? { climbM: body.climbM, descentM: body.descentM }
      : null;
  // Only a definite answer is remembered; an upstream failure is retried next open.
  if (res.ok) measured.set(`${site}/${id}`, climb);
  return climb;
}

/**
 * The details to show: a Waymarked Trails route without an `ascent` tag gets
 * its climb measured and its difficulty rated from it. Anything else passes
 * through untouched.
 */
export function useMeasuredClimb(data: DetailsData | null): {
  details: DetailsData | null;
  climbSource: ClimbSource;
  /** The measurement, when `climbSource` is `measured`. */
  measuredClimb?: MeasuredClimb;
} {
  // Strings, so a re-render with a new but equal `data` object does not refetch.
  const ref = toMeasure(data);
  const site = ref?.site ?? null;
  const relation = ref?.id ?? null;
  const key = ref ? `${ref.site}/${ref.id}` : null;
  const [result, setResult] = useState<{ key: string; climb: MeasuredClimb | null } | null>(null);

  useEffect(() => {
    if (!site || !relation) return;
    const asked = `${site}/${relation}`;
    if (measured.has(asked)) return;
    let cancelled = false;
    fetchClimb(site, relation).then(
      (climb) => !cancelled && setResult({ key: asked, climb }),
      () => !cancelled && setResult({ key: asked, climb: null })
    );
    return () => {
      cancelled = true;
    };
  }, [site, relation]);

  if (!key || data?.type !== 'route') return { details: data, climbSource: 'tagged' };
  const climb = measured.has(key)
    ? measured.get(key)!
    : result?.key === key
      ? result.climb
      : undefined;
  return withClimb(data, climb);
}

/**
 * The route as shown: still measuring (`undefined`), unmeasurable (`null`), or
 * with its climb and a difficulty rated from it.
 */
function withClimb(data: RouteDetails, climb: MeasuredClimb | null | undefined) {
  if (climb === undefined) return { details: data, climbSource: 'measuring' as const };
  if (climb === null) return { details: data, climbSource: 'unavailable' as const };
  // A route on the map has no set direction: rate it by the harder way round,
  // so a long descent is not called easy for someone walking it uphill.
  const hardest = Math.max(climb.climbM, climb.descentM);
  return {
    details: {
      ...data,
      elevation_gain_m: climb.climbM,
      difficulty: classifyDifficulty(data.distance_km, hardest),
    },
    climbSource: 'measured' as const,
    measuredClimb: climb,
  };
}
