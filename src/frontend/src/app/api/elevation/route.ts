import { NextResponse, type NextRequest } from 'next/server';

import { createLogger, upstreamSnippet } from '@/lib/logger';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { ELEVATION_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

/**
 * Ground elevation for up to {@link MAX_POINTS} points.
 *
 * Replaces Google's ElevationService, which billed per call. The default
 * upstream is the public OpenTopoData API (no key, Mapzen terrain, global);
 * `ELEVATION_API_URL` points it at another OpenTopoData-compatible host — a
 * self-hosted one, once the public quota is not enough.
 *
 * Proxied rather than called from the browser so the CDN can cache it: terrain
 * does not change, and discovery asks for the same peaks for everyone in a
 * region. A GET keyed on rounded coordinates is what makes that cache hit.
 *
 * `null` in `values` means the upstream did not know — open water, or outside
 * the dataset. It is never turned into a zero.
 */

/** OpenTopoData's per-request cap. */
export const MAX_POINTS = 100;

const DEFAULT_URL = 'https://api.opentopodata.org/v1/mapzen';
const TIMEOUT_MS = 10_000;

/** `lat,lng|lat,lng|…`, the upstream's own format, parsed and bounds-checked. */
function parseLocations(raw: string | null): [number, number][] | null {
  if (!raw) return null;
  const parts = raw.split('|');
  if (parts.length === 0 || parts.length > MAX_POINTS) return null;

  const points: [number, number][] = [];
  for (const part of parts) {
    const [lat, lng] = part.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    points.push([lat, lng]);
  }
  return points;
}

export async function GET(request: NextRequest) {
  const log = createLogger('/api/elevation', request);
  const limit = await rateLimit(request, ELEVATION_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const points = parseLocations(request.nextUrl.searchParams.get('locations'));
  if (!points) {
    return NextResponse.json(
      { error: `locations must be 1–${MAX_POINTS} "lat,lng" pairs separated by |` },
      { status: 400 }
    );
  }

  const base = process.env.ELEVATION_API_URL || DEFAULT_URL;
  const query = points.map(([lat, lng]) => `${lat},${lng}`).join('|');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${base}?locations=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn('elevation_upstream_rejected', {
        status: res.status,
        body: upstreamSnippet(await res.text()),
      });
      // 429 is the shared daily quota running out — worth saying, because the
      // fix (self-host, or wait for tomorrow) differs from an outage.
      return NextResponse.json(
        {
          error: 'Elevation service unavailable',
          reason: res.status === 429 ? 'quota' : 'upstream',
        },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { results?: { elevation?: number | null }[] };
    const results = data.results ?? [];
    if (results.length !== points.length) {
      log.warn('elevation_upstream_mismatch', { asked: points.length, got: results.length });
      return NextResponse.json(
        { error: 'Elevation service unavailable', reason: 'upstream' },
        { status: 502 }
      );
    }

    const values = results.map((r) =>
      typeof r.elevation === 'number' && Number.isFinite(r.elevation)
        ? Math.round(r.elevation)
        : null
    );
    return NextResponse.json(
      { values },
      // Terrain is static: cache at the edge for a month.
      { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=2592000' } }
    );
  } catch (err) {
    log.error('elevation_failed', err);
    return NextResponse.json(
      { error: 'Elevation service unavailable', reason: 'upstream' },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
