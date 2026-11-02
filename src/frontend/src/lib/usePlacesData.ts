import { useEffect, useRef, useState } from 'react';
import { authedFetch } from '@/lib/firebaseClient';
import type { Route as RouteData, Mountain as MountainData, Campsite } from '@/lib/placesTypes';
import { PLACES_CACHE_VERSION } from '@/lib/placesCacheSchema';
import { withinSearchRadius } from '@/lib/placesGeometry';
import { normaliseDifficulty } from '@/lib/routeDifficulty';
import type { UserLocation, LocationSource, LocationStatus } from '@/lib/useUserLocation';

export type CollectionName = 'routes' | 'mountains' | 'campsites';

export const COLLECTION_LABELS: Record<CollectionName, string> = {
  routes: 'routes',
  mountains: 'peaks',
  campsites: 'campsites',
};

/**
 * This device's copy of the last area's results.
 *
 * `localStorage` for 24 h — the shared Firestore tier's TTL — rather than
 * `sessionStorage` for 30 minutes: every new tab and every return after half
 * an hour used to re-run ~100 paid Places calls for an area whose results had
 * not changed. Keyed on the location, because it used to be read regardless
 * of where the user now was, so moving within the TTL showed the previous
 * area's places as if they were nearby. It holds the resolved location, so it
 * is cleared on sign-out (`lib/personalStorage.ts`).
 */
const LOCAL_CACHE_KEY = 'fri_places_cache';
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000;
const GEO_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedPlacesPayload {
  ts: number;
  v?: number;
  /** The 0.1° key the results were fetched for. */
  locationKey?: string;
  routes: RouteData[];
  mountains: MountainData[];
  campsites: Campsite[];
  location?: { lat: number; lng: number; address?: string };
}

function readLocalCache(locationKey: string): CachedPlacesPayload | null {
  try {
    const cached = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as CachedPlacesPayload;
    if (
      parsed.v === PLACES_CACHE_VERSION &&
      parsed.locationKey === locationKey &&
      Date.now() - parsed.ts < LOCAL_TTL_MS &&
      parsed.routes &&
      parsed.mountains &&
      parsed.campsites
    ) {
      return parsed;
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}

function writeLocalCache(
  locationKey: string,
  payload: Omit<CachedPlacesPayload, 'ts' | 'v' | 'locationKey'>
) {
  try {
    localStorage.setItem(
      LOCAL_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), v: PLACES_CACHE_VERSION, locationKey, ...payload })
    );
  } catch {
    /* storage quota */
  }
}

// Get reverse geocoding for address (cached 24 h in sessionStorage). Starts
// from whatever label the location already carries so a failed geocode
// degrades to "the area we searched", not "Unknown Location".
async function resolveAddress(userCoords: [number, number], fallback: string): Promise<string> {
  const geoKey = `fri_geocode_${Math.round(userCoords[1] * 10) / 10}_${Math.round(userCoords[0] * 10) / 10}`;
  try {
    const raw = sessionStorage.getItem(geoKey);
    if (raw) {
      const { ts, address } = JSON.parse(raw) as { ts: number; address: string };
      if (Date.now() - ts < GEO_TTL_MS) return address;
    }
  } catch {
    /* corrupt cache */
  }

  try {
    const geocoded = await reverseGeocode(userCoords);
    if (!geocoded) return fallback;
    try {
      sessionStorage.setItem(geoKey, JSON.stringify({ ts: Date.now(), address: geocoded }));
    } catch {
      /* quota */
    }
    return geocoded;
  } catch (err) {
    console.warn('Reverse geocoding unavailable.', err);
    return fallback;
  }
}

/**
 * The nearest settlement and its region, from Nominatim.
 *
 * Nominatim's usage policy allows one request a second and asks that results
 * be cached; the 0.1° session cache above means one call per area per day.
 * The full `display_name` is a street address, which is more than a label for
 * "routes near …" needs and more than a screenshot should carry.
 */
async function reverseGeocode([lng, lat]: [number, number]): Promise<string | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${lat}&lon=${lng}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = (await res.json()) as { address?: Record<string, string> };
  const a = data.address ?? {};
  const place = a.village ?? a.town ?? a.city ?? a.municipality ?? a.county;
  const region = a.state ?? a.country;
  return [place, region].filter(Boolean).join(', ') || null;
}

interface DiscoverResponse {
  routes: RouteData[];
  mountains: MountainData[];
  campsites: Campsite[];
  failed: CollectionName[];
}

/**
 * The live tier: OpenStreetMap through `/api/discover`, which holds each 0.1°
 * cell at the CDN for a week. Sent rounded to that cell so every visitor in it
 * asks the same URL and shares the one cached answer.
 */
async function fetchDiscovery([lng, lat]: [number, number]): Promise<DiscoverResponse> {
  const cell = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  const res = await fetch(`/api/discover?lat=${cell(lat)}&lng=${cell(lng)}`);
  if (!res.ok) throw new Error(`Discovery HTTP ${res.status}`);
  const data = (await res.json()) as Partial<DiscoverResponse>;
  return {
    routes: data.routes ?? [],
    mountains: data.mountains ?? [],
    campsites: data.campsites ?? [],
    failed: data.failed ?? [],
  };
}

async function fetchFirestoreCache(
  userCoords: [number, number]
): Promise<CachedPlacesPayload | null> {
  try {
    const res = await fetch(`/api/places/cache?lat=${userCoords[1]}&lng=${userCoords[0]}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      hit: boolean;
      v?: number;
      routes?: RouteData[];
      mountains?: MountainData[];
      campsites?: Campsite[];
    };
    if (
      data.hit &&
      data.v === PLACES_CACHE_VERSION &&
      data.routes &&
      data.mountains &&
      data.campsites
    ) {
      return {
        ts: Date.now(),
        v: data.v,
        routes: data.routes,
        mountains: data.mountains,
        campsites: data.campsites,
      };
    }
  } catch {
    /* Firestore cache unavailable, continue to live fetch */
  }
  return null;
}

/**
 * Warms the shared regional cache. Signed-in callers only — the route requires a
 * Firebase ID token because everything written here is served to every other
 * visitor in the cell. Signed out, `authedFetch` throws and we skip the write:
 * the caller already has its results, so the only cost is that this region stays
 * cold until a signed-in user visits it.
 */
function writeFirestoreCache(
  userCoords: [number, number],
  payload: {
    routes: RouteData[];
    mountains: MountainData[];
    campsites: Campsite[];
  }
) {
  authedFetch('/api/places/cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      v: PLACES_CACHE_VERSION,
      lat: userCoords[1],
      lng: userCoords[0],
      ...payload,
    }),
  }).catch(() => {
    /* non-critical: not signed in, or the shared cache is unavailable */
  });
}

interface UsePlacesDataParams {
  userLocation: UserLocation | null;
  locationStatus: LocationStatus;
  locationSource: LocationSource | null;
  saveAndSetUserLocation: (location: UserLocation, source?: LocationSource) => void;
}

// Loads routes/mountains/campsites near the user via a 3-tier cache
// (localStorage → Firestore /api/places/cache → OpenStreetMap through
// /api/discover), scoped to a search radius. Location comes from the
// already-extracted useUserLocation() hook rather than being owned here.
export function usePlacesData({
  userLocation,
  locationStatus,
  locationSource,
  saveAndSetUserLocation,
}: UsePlacesDataParams) {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [mountains, setMountains] = useState<MountainData[]>([]);
  const [campsites, setCampsites] = useState<Campsite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedCollections, setFailedCollections] = useState<CollectionName[]>([]);
  const [placesAttempt, setPlacesAttempt] = useState(0);

  // Coarse key for the pipeline below. Rounding to 0.1° means a GPS fix that
  // merely refines a restored location does not re-run 40+ paid queries.
  const locationKey = userLocation
    ? `${(Math.round(userLocation.lat * 10) / 10).toFixed(1)},${(Math.round(userLocation.lng * 10) / 10).toFixed(1)}`
    : null;
  const fetchedLocationKeyRef = useRef<string | null>(null);
  // Identifies the newest run. A run for a location the user has since left
  // used to finish anyway and overwrite the newer area's results; each await
  // now checks it is still the latest before it touches state.
  const runIdRef = useRef(0);

  const applyResult = (data: {
    routes: RouteData[];
    mountains: MountainData[];
    campsites: Campsite[];
    location?: { lat: number; lng: number; address?: string };
  }) => {
    // Cached payloads predate the radius filter, so they get it too.
    const near = data.location ?? userLocation;
    setRoutes(
      withinSearchRadius(data.routes, near).map((r) => ({
        ...r,
        difficulty: normaliseDifficulty(r.difficulty),
      }))
    );
    setMountains(withinSearchRadius(data.mountains, near));
    setCampsites(withinSearchRadius(data.campsites, near));
    if (data.location) saveAndSetUserLocation(data.location);
    setIsLoading(false);
  };

  useEffect(() => {
    // Wait for useUserLocation to settle so we search where the user actually
    // is, and only re-search when they have meaningfully moved.
    if (locationStatus !== 'ready' || !userLocation || !locationKey) return;
    if (fetchedLocationKeyRef.current === locationKey) return;
    fetchedLocationKeyRef.current = locationKey;
    const runId = ++runIdRef.current;
    const superseded = () => runIdRef.current !== runId;

    // --- 3-tier cache strategy ---
    // L1: localStorage (24-h TTL, instant, this device, this location only)
    // L2: Firestore via /api/places/cache (24-h TTL, shared across users in same region)
    // L3: /api/discover — OpenStreetMap, itself cached at the CDN for a week
    const localCached = readLocalCache(locationKey);
    if (localCached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- starts a load; the state set is its loading flag or a synchronous cache hit
      applyResult(localCached);
      return;
    }

    const run = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setFailedCollections([]);

        // Location is already resolved by useUserLocation — this pipeline no
        // longer prompts for it a second time.
        const userCoords: [number, number] = [userLocation.lng, userLocation.lat];
        const address = await resolveAddress(userCoords, userLocation.address ?? 'this area');
        if (superseded()) return;
        const resolvedLocation = { lat: userCoords[1], lng: userCoords[0], address };

        // Keep the provenance we already established — attaching an address
        // must not promote a fallback guess into a claimed device fix.
        saveAndSetUserLocation(resolvedLocation, locationSource ?? 'restored');

        const firestoreCached = await fetchFirestoreCache(userCoords);
        if (superseded()) return;
        if (firestoreCached) {
          writeLocalCache(locationKey, { ...firestoreCached, location: resolvedLocation });
          applyResult({ ...firestoreCached, location: resolvedLocation });
          return;
        }

        // Each collection succeeds or fails on its own server-side, and says
        // which in `failed`, rather than an empty list standing in for a
        // collection that never came back.
        const discovered = await fetchDiscovery(userCoords);
        const failed = discovered.failed;
        const {
          routes: routesData,
          mountains: mountainsData,
          campsites: campsitesData,
        } = discovered;

        if (superseded()) return;

        // An empty tab after a failed fetch is indistinguishable from "nothing
        // here" unless we say which collections did not come back.
        setFailedCollections(failed);

        // Belt and braces: the server searches a bounded area, but nothing
        // outside the radius should reach the UI *or* the caches.
        const routes = withinSearchRadius(routesData, resolvedLocation);
        const mountains = withinSearchRadius(mountainsData, resolvedLocation);
        const campsites = withinSearchRadius(campsitesData, resolvedLocation);

        setRoutes(routes);
        setMountains(mountains);
        setCampsites(campsites);
        setIsLoading(false);

        // A partial result is shown but not cached: caching it would hold the
        // gap for a day after the upstream recovered.
        if (failed.length === 0) {
          writeLocalCache(locationKey, {
            routes,
            mountains,
            campsites,
            location: resolvedLocation,
          });
          writeFirestoreCache(userCoords, { routes, mountains, campsites });
        }
      } catch (err) {
        if (superseded()) return;
        console.error('Places pipeline failed:', err);
        setError("We couldn't load places near you.");
        setIsLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationStatus, locationKey, placesAttempt]);

  // Drop the local cache and re-run the pipeline. Without clearing it
  // the retry would replay the same failed-and-cached result.
  const retryPlacesFetch = () => {
    try {
      localStorage.removeItem(LOCAL_CACHE_KEY);
    } catch {
      /* nothing cached to clear */
    }
    fetchedLocationKeyRef.current = null;
    setError(null);
    setFailedCollections([]);
    setPlacesAttempt((n) => n + 1);
  };

  return {
    routes,
    mountains,
    campsites,
    isLoading,
    error,
    setError,
    failedCollections,
    retryPlacesFetch,
  };
}
