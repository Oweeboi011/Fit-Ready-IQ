import { NextResponse } from 'next/server';

import { createLogger, upstreamSnippet, type Logger } from '@/lib/logger';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { DIRECTIONS_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

/**
 * Routing, via the Routes API.
 *
 * The client used to call `google.maps.DirectionsService` directly. That is the
 * legacy Directions API: Google does not enable it on new projects, so it
 * returned REQUEST_DENIED and every planned route silently fell back to a
 * straight line. It is also deprecated as of February 2026 in favour of
 * `routes.googleapis.com`.
 *
 * Routing server-side additionally keeps the key off the client and lets the
 * field mask stay tight, which is what the Routes API bills on.
 */

interface LatLng {
  lat: number;
  lng: number;
}

export interface DirectionsResult {
  /** Encoded polyline, precision 5 — feed to `decodePolyline`. */
  polyline: string;
  distanceKm: number;
  durationSeconds: number;
}

/**
 * Why a request produced no route.
 *
 * The status code alone cannot say: a missing key and a key Google refused both
 * end up as 503, and the fixes are completely different — set a key, versus
 * enable the Routes API and billing on the project the key belongs to. The
 * planner shows this to the user, so it has to be the real reason.
 */
export type DirectionsFailure =
  'not_configured' | 'rejected' | 'no_route' | 'bad_request' | 'upstream' | 'timeout';

function failure(reason: DirectionsFailure, error: string, status: number) {
  return NextResponse.json({ error, reason }, { status });
}

/** Routes API caps intermediates at 25. */
const MAX_INTERMEDIATES = 25;

const TIMEOUT_MS = 12_000;

function isLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.lat === 'number' &&
    typeof v.lng === 'number' &&
    Number.isFinite(v.lat) &&
    Number.isFinite(v.lng)
  );
}

function waypoint(point: LatLng) {
  return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}

/**
 * The Routes API travel modes we use.
 *
 * `BICYCLE` matters for the planner: cycling routing prefers cycleways and will
 * use roads a walking route avoids, and it refuses stairs and footpaths a bike
 * cannot ride. Routing a bike trip on foot returns a line no bike can follow and
 * a distance that is wrong in both directions.
 */
type TravelMode = 'DRIVE' | 'WALK' | 'BICYCLE';

const TRAVEL_MODES: readonly TravelMode[] = ['DRIVE', 'WALK', 'BICYCLE'];

interface RouteRequest {
  origin: LatLng;
  destination: LatLng;
  stops: LatLng[];
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

  return {
    origin,
    destination,
    stops: Array.isArray(intermediates) ? intermediates.filter(isLatLng) : [],
    // Unknown or missing modes fall back to walking — the most conservative
    // routing of the three, and the planner's original behaviour.
    travelMode: TRAVEL_MODES.includes(mode as TravelMode) ? (mode as TravelMode) : 'WALK',
  };
}

export async function POST(request: Request) {
  const log = createLogger('/api/directions', request);
  const limit = await rateLimit(request, DIRECTIONS_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  // `||`, not `??`: a declared-but-blank GOOGLE_ROUTES_API_KEY (the usual shape
  // of a .env copied from .env.example) is an empty string, not undefined, so
  // `??` would hand back "" and defeat the documented fallback to the Maps key.
  const key = process.env.GOOGLE_ROUTES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return failure('not_configured', 'Routing is not configured', 503);
  }

  const parsed = await parseRequest(request);
  if (!parsed) {
    return failure('bad_request', 'origin and destination are required', 400);
  }

  return callRoutesApi(key, parsed, log);
}

/** Maps a Routes API payload onto our shape, or null when it has no geometry. */
function toResult(data: unknown): DirectionsResult | null {
  const route = (
    data as {
      routes?: {
        polyline?: { encodedPolyline?: string };
        distanceMeters?: number;
        duration?: string;
      }[];
    }
  )?.routes?.[0];
  const polyline = route?.polyline?.encodedPolyline;
  if (!polyline) return null;

  // Routes returns duration as a string like "1234s".
  const seconds = Number.parseInt(String(route?.duration ?? '0').replace('s', ''), 10);

  return {
    polyline,
    distanceKm: (route?.distanceMeters ?? 0) / 1000,
    durationSeconds: Number.isFinite(seconds) ? seconds : 0,
  };
}

/**
 * The Routes API call itself, split out to keep the handler readable.
 *
 * The logger is passed in rather than created here so its request id matches
 * the handler's — a helper that minted its own would log the same request under
 * a different id, which defeats the point of having one.
 */
async function callRoutesApi(key: string, req: RouteRequest, log: Logger) {
  const { origin, destination, stops, travelMode } = req;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        // Routes API bills by the fields requested, so ask for the minimum.
        'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: waypoint(origin),
        destination: waypoint(destination),
        intermediates: stops.slice(0, MAX_INTERMEDIATES).map(waypoint),
        travelMode,
        polylineQuality: 'HIGH_QUALITY',
        ...(travelMode === 'DRIVE' ? { routingPreference: 'TRAFFIC_UNAWARE' } : {}),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const upstreamMessage = String(data?.error?.message ?? '');

      /**
       * The referrer-restricted-key case, called out separately because it is
       * the one failure whose cause is invisible from the symptom.
       *
       * `GOOGLE_ROUTES_API_KEY` falls back to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
       * and that public key *should* be HTTP-referrer restricted — which makes
       * it unusable from here, because a server-to-server call sends no referer.
       * Google answers "Requests from referer <empty> are blocked", the fallback
       * makes it look configured, and the operator sees a generic 503 while the
       * real fix is a second key with no referrer restriction.
       */
      const referrerBlocked = /referer|referrer/i.test(upstreamMessage);

      log.warn('routes_api_rejected', {
        status: res.status,
        referrer_blocked: referrerBlocked,
        upstream: upstreamSnippet(upstreamMessage),
      });

      if (referrerBlocked) {
        return failure(
          'rejected',
          'Routing is configured with a browser-restricted API key, which cannot be used ' +
            'server-side. Set GOOGLE_ROUTES_API_KEY to a key with no HTTP-referrer restriction.',
          503
        );
      }

      // Both 400 and 403 otherwise mean the credentials were refused, not that
      // our payload was wrong — we validated origin and destination above.
      // Google answers an unusable key with 400 "API key not valid", and a key
      // whose project lacks the Routes API (or billing) with 403. Either way the
      // fix is in the Cloud console, not the request, so they share a reason.
      return res.status === 403 || res.status === 400
        ? failure('rejected', 'Routing request was rejected by Google', 503)
        : failure('upstream', 'Routing service unavailable', 502);
    }

    const result = toResult(data);
    if (!result) {
      // A genuine "no route exists" — common between unmapped trail points.
      return failure('no_route', 'No route found', 404);
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' },
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    log.error('routes_request_failed', err);
    return failure(
      timedOut ? 'timeout' : 'upstream',
      timedOut ? 'Routing timed out' : 'Routing service unreachable',
      504
    );
  } finally {
    clearTimeout(timer);
  }
}
