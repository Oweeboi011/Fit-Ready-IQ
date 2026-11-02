import { NextResponse } from 'next/server';

import { createLogger, upstreamSnippet, type Logger } from '@/lib/logger';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { DIRECTIONS_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

/**
 * Routing, via OSRM on OpenStreetMap (#86).
 *
 * This was Google's Routes API, billed per call and refused outright on a
 * project without billing — which made every planned route a straight line.
 * The default upstream is now FOSSGIS's public OSRM servers, which route on
 * foot, by bike and by car over OSM with no key. `ROUTING_API_URL` points it
 * at another OSRM host (a self-hosted one, once the public servers are not
 * enough); it must serve `/routed-{foot,bike,car}/route/v1/…` like FOSSGIS.
 *
 * Proxied rather than called from the browser so the CDN can cache a route
 * and so the upstream sees an identifying User-Agent, which its usage policy
 * asks for.
 */

interface LatLng {
  lat: number;
  lng: number;
}

export interface DirectionsResult {
  /** Encoded polyline, precision 5 — feed to `decodePolyline`. */
  polyline: string;
  /** Null when the router did not report one — never a zero standing in for it. */
  distanceKm: number | null;
  durationSeconds: number | null;
}

/**
 * Why a request produced no route. The planner shows this to the user, so it
 * has to be the real reason: "no path joins these points" and "the router is
 * down" call for different things from the person planning.
 */
export type DirectionsFailure = 'no_route' | 'bad_request' | 'busy' | 'upstream' | 'timeout';

function failure(reason: DirectionsFailure, error: string, status: number) {
  return NextResponse.json({ error, reason }, { status });
}

/** Origin, destination and at most this many stops — a planner's worth, and polite upstream. */
const MAX_INTERMEDIATES = 25;

const TIMEOUT_MS = 12_000;

const DEFAULT_URL = 'https://routing.openstreetmap.de';

const USER_AGENT = 'Fit-Ready-IQ/1.0 (+https://github.com/Oweeboi011/Fit-Ready-IQ)';

function isLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.lat === 'number' &&
    typeof v.lng === 'number' &&
    Number.isFinite(v.lat) &&
    Number.isFinite(v.lng) &&
    Math.abs(v.lat) <= 90 &&
    Math.abs(v.lng) <= 180
  );
}

/**
 * The travel modes the client asks for, and the OSRM profile each maps to.
 *
 * `BICYCLE` matters for the planner: cycling routing prefers cycleways and will
 * use roads a walking route avoids, and it refuses stairs and footpaths a bike
 * cannot ride. Routing a bike trip on foot returns a line no bike can follow and
 * a distance that is wrong in both directions.
 */
const PROFILES = { DRIVE: 'car', WALK: 'foot', BICYCLE: 'bike' } as const;
type TravelMode = keyof typeof PROFILES;

interface RouteRequest {
  points: LatLng[];
  travelMode: TravelMode;
}

/** Parses and validates the body; returns null when it is unusable. */
async function parseRequest(request: Request): Promise<RouteRequest | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }

  const { origin, destination, intermediates, mode } = (body ?? {}) as Record<string, unknown>;
  if (!isLatLng(origin) || !isLatLng(destination)) return null;

  // Capped before validation, so a body of a million points costs one slice
  // rather than a million checks.
  const stops = Array.isArray(intermediates)
    ? intermediates.slice(0, MAX_INTERMEDIATES).filter(isLatLng)
    : [];

  return {
    points: [origin, ...stops, destination],
    // Unknown or missing modes fall back to walking — the most conservative
    // routing of the three, and the planner's original behaviour.
    travelMode: mode && Object.hasOwn(PROFILES, String(mode)) ? (mode as TravelMode) : 'WALK',
  };
}

export async function POST(request: Request) {
  const log = createLogger('/api/directions', request);
  const limit = await rateLimit(request, DIRECTIONS_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const parsed = await parseRequest(request);
  if (!parsed) {
    return failure('bad_request', 'origin and destination are required', 400);
  }

  return callOsrm(parsed, log);
}

/** The OSRM URL for a request: `lng,lat` pairs, GeoJSON order, joined by `;`. */
function osrmUrl(base: string, { points, travelMode }: RouteRequest): string {
  const coordinates = points.map((p) => `${p.lng},${p.lat}`).join(';');
  // FOSSGIS serves one OSRM per profile under its own path; the profile
  // segment in the OSRM URL itself is then ignored, so it stays "driving".
  return (
    `${base.replace(/\/$/, '')}/routed-${PROFILES[travelMode]}/route/v1/driving/${coordinates}` +
    '?overview=full&geometries=polyline&steps=false'
  );
}

/** Maps an OSRM payload onto our shape, or null when it has no geometry. */
function toResult(data: unknown): DirectionsResult | null {
  const route = (data as { routes?: { geometry?: string; distance?: number; duration?: number }[] })
    ?.routes?.[0];
  if (!route?.geometry) return null;

  const { distance, duration } = route;
  return {
    polyline: route.geometry,
    distanceKm: typeof distance === 'number' && Number.isFinite(distance) ? distance / 1000 : null,
    durationSeconds:
      typeof duration === 'number' && Number.isFinite(duration) ? Math.round(duration) : null,
  };
}

/** The failure an OSRM answer amounts to, or null when it carries a route. */
function refusal(status: number, ok: boolean, data: { code?: string } | null, log: Logger) {
  // OSRM answers "no path" with a 400 and a code, not an empty route list.
  if (data?.code === 'NoRoute' || data?.code === 'NoSegment') {
    return failure('no_route', 'No route found', 404);
  }
  if (ok && data?.code === 'Ok') return null;

  log.warn('routing_upstream_rejected', {
    status,
    code: data?.code ?? null,
    upstream: upstreamSnippet(JSON.stringify(data ?? '')),
  });
  // A shared public server refusing for load is worth naming: waiting fixes
  // it, where an outage might not.
  return status === 429
    ? failure('busy', 'The routing service is busy', 503)
    : failure('upstream', 'Routing service unavailable', 502);
}

/**
 * The OSRM call itself, split out to keep the handler readable.
 *
 * The logger is passed in rather than created here so its request id matches
 * the handler's — a helper that minted its own would log the same request under
 * a different id, which defeats the point of having one.
 */
async function callOsrm(req: RouteRequest, log: Logger) {
  const base = process.env.ROUTING_API_URL || DEFAULT_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(osrmUrl(base, req), {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    const data = (await res.json().catch(() => null)) as { code?: string } | null;
    const refused = refusal(res.status, res.ok, data, log);
    if (refused) return refused;

    const result = toResult(data);
    if (!result) return failure('no_route', 'No route found', 404);

    return NextResponse.json(result, {
      // Paths change slowly; the same waypoints can share an answer for a day.
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' },
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    log.error('routing_request_failed', err);
    return failure(
      timedOut ? 'timeout' : 'upstream',
      timedOut ? 'Routing timed out' : 'Routing service unreachable',
      504
    );
  } finally {
    clearTimeout(timer);
  }
}
