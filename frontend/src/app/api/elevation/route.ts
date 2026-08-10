import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Ground elevation for a batch of points.
 *
 * The client used to call `google.maps.ElevationService` directly. On this
 * project that API returns REQUEST_DENIED — it is enabled separately from
 * the Maps JavaScript API and the console has never turned it on — so every
 * summit and jumpoff elevation silently came back `null`. Rather than block
 * on that console change, this route falls back to Open-Elevation (a free,
 * public, unauthenticated dataset) when Google's key is missing or its call
 * fails, so real numbers show up either way.
 *
 * `null` still means "we do not know" — Open-Elevation itself returns 0 for
 * ocean/void cells in some datasets, which is indistinguishable from "we
 * asked and it's genuinely sea level". That is a known limitation of a free
 * fallback and is preferable to inventing a plausible-looking number.
 */

interface LatLng {
  lat: number;
  lng: number;
}

export type ElevationSource = 'google' | 'open-elevation';

interface ElevationResult {
  values: (number | null)[];
  source: ElevationSource | null;
}

const TIMEOUT_MS = 12_000;
// Stays well under typical GET URL length limits at ~22 chars per point.
const GOOGLE_CHUNK = 200;
const OPEN_ELEVATION_CHUNK = 300;

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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchGoogleElevations(key: string, locations: LatLng[]): Promise<(number | null)[]> {
  const chunks = chunk(locations, GOOGLE_CHUNK);
  const results = await Promise.all(
    chunks.map(async (points) => {
      const query = points.map((p) => `${p.lat},${p.lng}`).join('|');
      const endpoint = `https://maps.googleapis.com/maps/api/elevation/json?locations=${query}&key=${key}`;
      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const data = (await res.json()) as {
        status?: string;
        results?: { elevation?: number }[];
      };
      if (data.status !== 'OK' || !data.results) {
        throw new Error(`Google Elevation ${data.status ?? res.status}`);
      }
      return data.results.map((r) => (r.elevation != null ? Math.round(r.elevation) : null));
    })
  );
  return results.flat();
}

async function fetchOpenElevations(locations: LatLng[]): Promise<(number | null)[]> {
  const baseUrl = process.env.OPEN_ELEVATION_BASE_URL ?? 'https://api.open-elevation.com/api/v1';
  const chunks = chunk(locations, OPEN_ELEVATION_CHUNK);
  const results = await Promise.all(
    chunks.map(async (points) => {
      const res = await fetch(`${baseUrl}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          locations: points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Open-Elevation ${res.status}`);
      const data = (await res.json()) as { results?: { elevation?: number }[] };
      if (!data.results) throw new Error('Open-Elevation returned no results');
      return data.results.map((r) => (r.elevation != null ? Math.round(r.elevation) : null));
    })
  );
  return results.flat();
}

async function resolveElevations(locations: LatLng[]): Promise<ElevationResult> {
  const googleKey =
    process.env.GOOGLE_ROUTES_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (googleKey) {
    try {
      return { values: await fetchGoogleElevations(googleKey, locations), source: 'google' };
    } catch (err) {
      console.warn('Google Elevation failed, falling back to Open-Elevation:', err);
    }
  }

  try {
    return { values: await fetchOpenElevations(locations), source: 'open-elevation' };
  } catch (err) {
    console.warn('Open-Elevation failed:', err);
    return { values: locations.map(() => null), source: null };
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { locations } = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(locations) || !locations.every(isLatLng)) {
    return NextResponse.json(
      { error: 'locations must be an array of { lat, lng }' },
      { status: 400 }
    );
  }
  if (locations.length === 0) {
    return NextResponse.json({ values: [], source: null });
  }

  const result = await resolveElevations(locations);
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600' },
  });
}
