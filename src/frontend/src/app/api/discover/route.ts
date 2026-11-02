import { NextResponse, type NextRequest } from 'next/server';

import { createLogger, upstreamSnippet } from '@/lib/logger';
import {
  MAX_CAMPSITES,
  MAX_MOUNTAINS,
  MAX_ROUTES,
  PHOTON_QUERIES,
  WAYMARKED_SITES,
  campsiteFromPhoton,
  commonsUrlFromWikidata,
  mountainFromPhoton,
  nearestFirst,
  photonReverseUrl,
  routeFromWaymarked,
  uniqueById,
  waymarkedBbox,
  wikidataId,
  withElevations,
  withWikidataPhotos,
  worthClimbing,
  type PhotonPlace,
  type WaymarkedDetails,
  type WaymarkedSite,
} from '@/lib/osmDiscovery';
import type { Campsite, Mountain, Route } from '@/lib/placesTypes';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { DISCOVER_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

/**
 * Routes, peaks and campsites near a point, from OpenStreetMap (#86).
 *
 * Routes come from Waymarked Trails, which serves OSM route relations with
 * their mapped length; peaks and campsites from Photon, komoot's OSM geocoder,
 * with summit heights from the same terrain model as `/api/elevation`.
 * Overpass was the first choice and was dropped: its public servers were at
 * capacity often enough that peaks and campsites failed more than they loaded.
 *
 * Run on the server rather than in the browser for three reasons: a route's
 * details can be megabytes for a long traverse, of which we keep a dozen
 * fields; the CDN can then hold one answer per 0.1° cell for a week, so the
 * volunteer-run upstreams see a region once rather than once per visitor; and
 * they ask for an identifying User-Agent, which a browser cannot set.
 *
 * Each collection fails on its own and says so in `failed`, so the client can
 * tell "no campsites here" from "we could not ask". A response with a failure
 * is never cached, or one bad minute upstream would be a week of empty tabs.
 */

const USER_AGENT = 'Fit-Ready-IQ/1.0 (+https://github.com/Oweeboi011/Fit-Ready-IQ)';

const UPSTREAM_TIMEOUT_MS = 8_000;
const WIKIDATA_TIMEOUT_MS = 5_000;
/** Detail lookups in flight at once, per site. Polite to a volunteer service. */
const DETAIL_CONCURRENCY = 6;
const ELEVATION_URL = process.env.ELEVATION_API_URL || 'https://api.opentopodata.org/v1/mapzen';

type Collection = 'routes' | 'mountains' | 'campsites';

async function fetchJson<T>(url: string, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const host = new URL(url).host;
    throw new Error(`HTTP ${res.status} from ${host}: ${upstreamSnippet(await res.text())}`);
  }
  return (await res.json()) as T;
}

/** Runs `task` over `items`, at most `limit` at a time, keeping order. */
async function mapLimited<T, U>(items: T[], limit: number, task: (item: T) => Promise<U>) {
  const results: U[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * One Waymarked Trails site: the routes in the box, then each one's details for
 * its length. A detail that fails drops that route, not the site — a missing
 * route is better than one shown without the length it was fetched for.
 */
async function fetchWaymarked(
  site: WaymarkedSite,
  lat: number,
  lng: number
): Promise<{ routes: Route[]; wikidata: Map<string, string> }> {
  const { host, limit } = WAYMARKED_SITES[site];
  const list = await fetchJson<{ results?: { id: number }[] }>(
    `${host}/api/v1/list/by_area?bbox=${waymarkedBbox(lat, lng)}&limit=${limit}`
  );
  const ids = (list.results ?? []).map((r) => r.id).filter(Number.isInteger);
  const details = await mapLimited(ids, DETAIL_CONCURRENCY, (id) =>
    fetchJson<WaymarkedDetails>(`${host}/api/v1/details/relation/${id}`).catch(() => null)
  );

  const routes: Route[] = [];
  const wikidata = new Map<string, string>();
  for (const d of details) {
    const route = d && routeFromWaymarked(d, site);
    if (!route) continue;
    routes.push(route);
    const qid = wikidataId(d.tags);
    if (qid && route.place_id) wikidata.set(route.place_id, qid);
  }
  return { routes, wikidata };
}

async function fetchPhoton(
  lat: number,
  lng: number,
  query: (typeof PHOTON_QUERIES)[keyof typeof PHOTON_QUERIES]
): Promise<PhotonPlace[]> {
  const data = await fetchJson<{ features?: PhotonPlace[] }>(photonReverseUrl(lat, lng, query));
  return data.features ?? [];
}

/** Summits, nearest first, with heights from the terrain model where it answers. */
async function fetchMountains(lat: number, lng: number): Promise<Mountain[]> {
  const [peaks, volcanoes] = await Promise.all([
    fetchPhoton(lat, lng, PHOTON_QUERIES.peaks),
    // A volcano is a mountain too, and a peak search alone misses Taal and Mayon.
    fetchPhoton(lat, lng, PHOTON_QUERIES.volcanoes).catch(() => []),
  ]);
  const mountains = nearestFirst(
    uniqueById(
      [...peaks, ...volcanoes].map(mountainFromPhoton).filter((m): m is Mountain => m !== null)
    ),
    lat,
    lng,
    MAX_MOUNTAINS
  );
  return withElevations(mountains, await fetchHeights(mountains)).filter(worthClimbing);
}

/**
 * Ground height at each summit point, in one OpenTopoData call (it takes 100
 * points; discovery keeps at most 60). A failure leaves every height unknown
 * rather than failing the peaks: a summit with no height is still a summit.
 */
async function fetchHeights(mountains: Mountain[]): Promise<(number | null)[]> {
  if (mountains.length === 0) return [];
  const query = mountains.map((m) => `${m.coordinates[1]},${m.coordinates[0]}`).join('|');
  try {
    const data = await fetchJson<{ results?: { elevation?: number | null }[] }>(
      `${ELEVATION_URL}?locations=${encodeURIComponent(query)}`
    );
    const results = data.results ?? [];
    if (results.length !== mountains.length) return mountains.map(() => null);
    return results.map((r) =>
      typeof r.elevation === 'number' && Number.isFinite(r.elevation)
        ? Math.round(r.elevation)
        : null
    );
  } catch {
    return mountains.map(() => null);
  }
}

/**
 * Wikidata's main image (P18) for a set of items, in one SPARQL query. A
 * photo is a nicety: if this fails the places still ship, without pictures.
 */
async function fetchWikidataImages(ids: string[]): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  if (ids.length === 0) return images;
  const query = `SELECT ?item ?image WHERE { VALUES ?item { ${ids
    .map((id) => `wd:${id}`)
    .join(' ')} } ?item wdt:P18 ?image }`;
  const data = await fetchJson<{
    results?: { bindings?: { item: { value: string }; image: { value: string } }[] };
  }>(
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
    WIKIDATA_TIMEOUT_MS
  );
  for (const row of data.results?.bindings ?? []) {
    const qid = row.item.value.split('/').pop();
    const url = commonsUrlFromWikidata(row.image.value);
    if (qid && url && !images.has(qid)) images.set(qid, url);
  }
  return images;
}

/** Rounded to the 0.1° cell the client keys on, so every caller in it shares one CDN entry. */
function cell(value: string | null, limit: number): number | null {
  const n = Number(value);
  if (value === null || value.trim() === '' || !Number.isFinite(n) || Math.abs(n) > limit) {
    return null;
  }
  return Math.round(n * 10) / 10;
}

export async function GET(request: NextRequest) {
  const log = createLogger('/api/discover', request);
  const limit = await rateLimit(request, DISCOVER_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const lat = cell(request.nextUrl.searchParams.get('lat'), 90);
  const lng = cell(request.nextUrl.searchParams.get('lng'), 180);
  if (lat === null || lng === null) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  const [hiking, mtb, mountainsResult, campsitesResult] = await Promise.allSettled([
    fetchWaymarked('hiking', lat, lng),
    fetchWaymarked('mtb', lat, lng),
    fetchMountains(lat, lng),
    fetchPhoton(lat, lng, PHOTON_QUERIES.campsites),
  ]);

  const failed: Collection[] = [];
  const wikidataByPlace = new Map<string, string>();
  const routes: Route[] = [];
  for (const [site, result] of [
    ['hiking', hiking],
    ['mtb', mtb],
  ] as const) {
    if (result.status === 'fulfilled') {
      routes.push(...result.value.routes);
      result.value.wikidata.forEach((qid, place) => wikidataByPlace.set(place, qid));
    } else {
      log.warn('discover_waymarked_failed', { site, error: String(result.reason) });
    }
  }
  // Both route sources down is a failed collection; one down is fewer routes.
  if (hiking.status === 'rejected' && mtb.status === 'rejected') failed.push('routes');

  let mountains: Mountain[] = [];
  if (mountainsResult.status === 'fulfilled') {
    mountains = mountainsResult.value;
  } else {
    log.warn('discover_peaks_failed', { error: String(mountainsResult.reason) });
    failed.push('mountains');
  }

  let campsites: Campsite[] = [];
  if (campsitesResult.status === 'fulfilled') {
    campsites = campsitesResult.value
      .map(campsiteFromPhoton)
      .filter((c): c is Campsite => c !== null);
  } else {
    log.warn('discover_campsites_failed', { error: String(campsitesResult.reason) });
    failed.push('campsites');
  }

  const nearRoutes = nearestFirst(routes, lat, lng, MAX_ROUTES);
  const nearCampsites = nearestFirst(uniqueById(campsites), lat, lng, MAX_CAMPSITES);

  // Only ask about routes that will ship and have no photo of their own.
  const wanted = nearRoutes
    .filter((route) => !route.photos?.length && route.place_id)
    .map((route) => wikidataByPlace.get(route.place_id!))
    .filter((qid): qid is string => Boolean(qid));
  const images = await fetchWikidataImages([...new Set(wanted)]).catch((err) => {
    log.warn('discover_wikidata_failed', { error: String(err) });
    return new Map<string, string>();
  });

  const normalizeApiString = (value: string, maxLen = 280): string => {
    const withoutCtl = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    const compactWs = withoutCtl.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return compactWs.length > maxLen ? `${compactWs.slice(0, maxLen)}…` : compactWs;
  };

  const sanitizeForClient = (input: unknown): unknown => {
    if (typeof input === 'string') return normalizeApiString(input);
    if (Array.isArray(input)) return input.map((v) => sanitizeForClient(v));
    if (input && typeof input === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        out[k] = sanitizeForClient(v);
      }
      return out;
    }
    return input;
  };

  const responseBody = {
    routes: withWikidataPhotos(nearRoutes, wikidataByPlace, images),
    mountains,
    campsites: nearCampsites,
    failed,
    attribution: '© OpenStreetMap contributors, Waymarked Trails, Photon, Wikidata',
  };

  return NextResponse.json(
    sanitizeForClient(responseBody),
    {
      headers: {
        // Trails and summits change over months; a week at the edge is fresh enough.
        'Cache-Control':
          failed.length === 0
            ? 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400'
            : 'no-store',
      },
    }
  );
}
