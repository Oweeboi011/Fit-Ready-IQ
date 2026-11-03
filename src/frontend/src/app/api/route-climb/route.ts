import { NextResponse, type NextRequest } from 'next/server';

import { createLogger, serializeError } from '@/lib/logger';
import { WAYMARKED_SITES, type WaymarkedSite } from '@/lib/osmDiscovery';
import { OsmHttpError, fetchOsmJson } from '@/lib/osmFetch';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { ROUTE_CLIMB_RATE_LIMIT } from '@/lib/rateLimitRules';
import { climbFrom, routeSegments, samplePoints, type WaymarkedRouteNode } from '@/lib/routeClimb';

export const runtime = 'nodejs';

/**
 * A Waymarked Trails route's climb, measured from a terrain model along its
 * mapped path (#142).
 *
 * Asked for one route at a time, when someone opens it, rather than for every
 * route discovery lists: the public OpenTopoData instance allows one call a
 * second and a thousand a day, and a cell's hundred routes would spend that in
 * minutes. A route's path changes rarely, so each answer is held at the CDN for
 * a month and the terrain service sees a route about once.
 *
 * `reason` says why there is no number: `too_long` (the samples would be too
 * far apart to see the climbs between them), `no_geometry`, `upstream` or
 * `quota` (a 429 from either service). Only the last two are worth retrying.
 */

const ELEVATION_URL = process.env.ELEVATION_API_URL || 'https://api.opentopodata.org/v1/mapzen';

/** OpenTopoData's cap per request, and its public instance's one call a second. */
const ELEVATION_BATCH = 100;
const ELEVATION_GAP_MS = 1_100;

type Reason = 'too_long' | 'no_geometry' | 'upstream' | 'quota';

const MONTH = 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400';

function unmeasured(reason: Reason, status = 200) {
  return NextResponse.json(
    { climbM: null, reason },
    // A route that is too long or has no path stays that way; an upstream
    // failure is the next minute's problem, and must not be cached for a month.
    { status, headers: { 'Cache-Control': status === 200 ? MONTH : 'no-store' } }
  );
}

/** Heights for `points` (`[lng, lat]`), in order, a batch at a time. */
async function fetchHeights(points: [number, number][]): Promise<(number | null)[]> {
  const heights: (number | null)[] = [];
  for (let i = 0; i < points.length; i += ELEVATION_BATCH) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, ELEVATION_GAP_MS));
    const query = points
      .slice(i, i + ELEVATION_BATCH)
      .map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
      .join('|');
    const data = await fetchOsmJson<{ results?: { elevation?: number | null }[] }>(
      `${ELEVATION_URL}?locations=${encodeURIComponent(query)}`
    );
    for (const r of data.results ?? []) {
      heights.push(
        typeof r.elevation === 'number' && Number.isFinite(r.elevation) ? r.elevation : null
      );
    }
  }
  if (heights.length !== points.length) throw new Error('elevation count mismatch');
  return heights;
}

export async function GET(request: NextRequest) {
  const log = createLogger('/api/route-climb', request);
  const limit = await rateLimit(request, ROUTE_CLIMB_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const site = request.nextUrl.searchParams.get('site');
  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!site || !Object.hasOwn(WAYMARKED_SITES, site) || !Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'site and id required' }, { status: 400 });
  }

  try {
    const { host } = WAYMARKED_SITES[site as WaymarkedSite];
    const details = await fetchOsmJson<{ route?: WaymarkedRouteNode }>(
      `${host}/api/v1/details/relation/${id}`
    );
    const segments = routeSegments(details.route);
    if (segments.length === 0) return unmeasured('no_geometry');

    const samples = samplePoints(segments);
    if (!samples) return unmeasured('too_long');

    const flat = samples.segments.flat();
    const heights = await fetchHeights(flat);
    let at = 0;
    const climb = climbFrom(samples.segments.map((s) => heights.slice(at, (at += s.length))));
    // A hole in the terrain model is not a flat stretch.
    if (!climb) return unmeasured('no_geometry');

    return NextResponse.json(
      { ...climb, spacingM: Math.round(samples.spacingM), samples: flat.length },
      { headers: { 'Cache-Control': MONTH } }
    );
  } catch (err) {
    // A 429 from either service is a quota: retry later, unlike an outage.
    const quota = err instanceof OsmHttpError && err.status === 429;
    log.warn(quota ? 'route_climb_quota' : 'route_climb_failed', {
      site,
      id,
      error: serializeError(err),
    });
    return unmeasured(quota ? 'quota' : 'upstream', 502);
  }
}
