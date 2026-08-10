import { NextResponse } from 'next/server';

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

interface RouteRequest {
  origin: LatLng;
  destination: LatLng;
  stops: LatLng[];
  travelMode: 'DRIVE' | 'WALK';
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
    travelMode: mode === 'DRIVE' ? 'DRIVE' : 'WALK',
  };
}

export async function POST(request: Request) {
  const key = process.env.GOOGLE_ROUTES_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Routing is not configured' }, { status: 503 });
  }

  const parsed = await parseRequest(request);
  if (!parsed) {
    return NextResponse.json({ error: 'origin and destination are required' }, { status: 400 });
  }
  const { origin, destination, stops, travelMode } = parsed;

  return callRoutesApi(key, parsed);
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

/** The Routes API call itself, split out to keep the handler readable. */
async function callRoutesApi(key: string, req: RouteRequest) {
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
      // Surface the reason in our logs; the client gets something actionable.
      console.error('Routes API failed:', res.status, data?.error?.message ?? data);
      return NextResponse.json(
        { error: 'Routing service unavailable' },
        { status: res.status === 403 ? 503 : 502 }
      );
    }

    const result = toResult(data);
    if (!result) {
      // A genuine "no route exists" — common between unmapped trail points.
      return NextResponse.json({ error: 'No route found' }, { status: 404 });
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' },
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    console.error('Routes request failed:', err);
    return NextResponse.json(
      { error: timedOut ? 'Routing timed out' : 'Routing service unreachable' },
      { status: 504 }
    );
  } finally {
    clearTimeout(timer);
  }
}
