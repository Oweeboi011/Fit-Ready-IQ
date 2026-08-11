import { useEffect, useRef, useState } from 'react';
import type { Route as RouteData, Mountain as MountainData, Campsite } from '@/lib/placesTypes';
import { withinSearchRadius } from '@/lib/placesGeometry';
import { normaliseDifficulty } from '@/lib/routeDifficulty';
import {
  fetchMountainsNearby,
  fetchRoutesNearby,
  fetchCampsitesNearby,
} from '@/lib/placesFetchers';
import type { UserLocation, LocationSource, LocationStatus } from '@/lib/useUserLocation';

export type CollectionName = 'routes' | 'mountains' | 'campsites';

export const COLLECTION_LABELS: Record<CollectionName, string> = {
  routes: 'routes',
  mountains: 'peaks',
  campsites: 'campsites',
};

/**
 * Schema version for cached place payloads.
 *
 * Both cache tiers store whole `Route`/`Mountain`/`Campsite` objects, so a
 * change to what a field *means* silently keeps serving the old meaning until
 * the entry expires — and the Firestore tier is shared, so one stale entry
 * feeds every visitor to that region for 24 hours. That is how a hardcoded
 * "50 m" elevation floor kept appearing long after the code that produced it
 * was deleted.
 *
 * Bump this whenever the shape or the semantics of a cached field change.
 *
 * v2 — elevation may be null, difficulty derived from terrain not star rating.
 */
const PLACES_CACHE_VERSION = 2;
const SESSION_CACHE_KEY = 'fri_places_cache';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const GEO_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedPlacesPayload {
  ts: number;
  v?: number;
  routes: RouteData[];
  mountains: MountainData[];
  campsites: Campsite[];
  location?: { lat: number; lng: number; address?: string };
}

function readSessionCache(): CachedPlacesPayload | null {
  try {
    const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as CachedPlacesPayload;
    if (
      parsed.v === PLACES_CACHE_VERSION &&
      Date.now() - parsed.ts < SESSION_TTL_MS &&
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

function writeSessionCache(payload: Omit<CachedPlacesPayload, 'ts' | 'v'>) {
  try {
    sessionStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), v: PLACES_CACHE_VERSION, ...payload })
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
    const geocoder = new google.maps.Geocoder();
    const geocoded = await new Promise<string | null>((resolve) => {
      geocoder.geocode(
        { location: { lat: userCoords[1], lng: userCoords[0] } },
        (results, status) => {
          resolve(
            status === google.maps.GeocoderStatus.OK && results && results[0]
              ? results[0].formatted_address
              : null
          );
        }
      );
    });
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

function writeFirestoreCache(
  userCoords: [number, number],
  payload: {
    routes: RouteData[];
    mountains: MountainData[];
    campsites: Campsite[];
    location: unknown;
  }
) {
  fetch('/api/places/cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      v: PLACES_CACHE_VERSION,
      lat: userCoords[1],
      lng: userCoords[0],
      ...payload,
    }),
  }).catch(() => {
    /* non-critical */
  });
}

interface UsePlacesDataParams {
  isLoaded: boolean;
  userLocation: UserLocation | null;
  locationStatus: LocationStatus;
  locationSource: LocationSource | null;
  saveAndSetUserLocation: (location: UserLocation, source?: LocationSource) => void;
}

// Loads routes/mountains/campsites near the user via a 3-tier cache
// (sessionStorage → Firestore /api/places/cache → live Google
// Places/Elevation/Distance-Matrix calls via placesFetchers.ts), scoped to a
// search radius since Google's `location`+`radius` is a bias, not a filter.
// Location comes from the already-extracted useUserLocation() hook rather
// than being owned here.
export function usePlacesData({
  isLoaded,
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
  const [elevationUnavailable, setElevationUnavailable] = useState(false);
  const [placesAttempt, setPlacesAttempt] = useState(0);

  // Coarse key for the pipeline below. Rounding to 0.1° means a GPS fix that
  // merely refines a restored location does not re-run 40+ paid queries.
  const locationKey = userLocation
    ? `${(Math.round(userLocation.lat * 10) / 10).toFixed(1)},${(Math.round(userLocation.lng * 10) / 10).toFixed(1)}`
    : null;
  const fetchedLocationKeyRef = useRef<string | null>(null);

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
    if (!isLoaded) return;
    if (typeof window === 'undefined' || !window.google) return;
    // Wait for useUserLocation to settle so we search where the user actually
    // is, and only re-search when they have meaningfully moved.
    if (locationStatus !== 'ready' || !userLocation || !locationKey) return;
    if (fetchedLocationKeyRef.current === locationKey) return;
    fetchedLocationKeyRef.current = locationKey;

    // --- 3-tier cache strategy ---
    // L1: sessionStorage (30-min TTL, instant, per-tab)
    // L2: Firestore via /api/places/cache (24-h TTL, shared across users in same region)
    // L3: Live Google Maps API calls (expensive, only on full miss)
    const sessionCached = readSessionCache();
    if (sessionCached) {
      applyResult(sessionCached);
      return;
    }

    const run = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setFailedCollections([]);
        setElevationUnavailable(false);

        // Location is already resolved by useUserLocation — this pipeline no
        // longer prompts for it a second time.
        const userCoords: [number, number] = [userLocation.lng, userLocation.lat];
        const address = await resolveAddress(userCoords, userLocation.address ?? 'this area');
        const resolvedLocation = { lat: userCoords[1], lng: userCoords[0], address };

        // Keep the provenance we already established — attaching an address
        // must not promote a fallback guess into a claimed device fix.
        saveAndSetUserLocation(resolvedLocation, locationSource ?? 'restored');

        const firestoreCached = await fetchFirestoreCache(userCoords);
        if (firestoreCached) {
          writeSessionCache({ ...firestoreCached, location: resolvedLocation });
          applyResult({ ...firestoreCached, location: resolvedLocation });
          return;
        }

        // Each collection is fetched independently, in sequence (each fans
        // out ~30 concurrent Places sub-queries on its own — running all
        // three collections at once would triple that peak request rate and
        // risk OVER_QUERY_LIMIT). Each can fail on its own; collect the
        // casualties rather than silently substituting an empty list. A
        // fetcher now throws on a hard failure (network error, unexpected
        // exception) instead of swallowing it, so each gets its own
        // try/catch here — distinct from `elevationFailed`, which means the
        // collection loaded but the Elevation API specifically degraded.
        const failed: CollectionName[] = [];
        let elevationFailed = false;

        let mountainsData: MountainData[] = [];
        try {
          const mountainsResult = await fetchMountainsNearby(userCoords);
          mountainsData = mountainsResult.data;
          elevationFailed = elevationFailed || mountainsResult.elevationFailed;
        } catch (err) {
          console.error('Mountains fetch error:', err);
          failed.push('mountains');
        }

        let routesData: RouteData[] = [];
        try {
          const routesResult = await fetchRoutesNearby(userCoords);
          routesData = routesResult.data;
          elevationFailed = elevationFailed || routesResult.elevationFailed;
        } catch (err) {
          console.error('Routes fetch error:', err);
          failed.push('routes');
        }

        let campsitesData: Campsite[] = [];
        try {
          const campsitesResult = await fetchCampsitesNearby(userCoords);
          campsitesData = campsitesResult.data;
        } catch (err) {
          console.error('Campsite fetch error:', err);
          failed.push('campsites');
        }

        // An empty tab after a failed fetch is indistinguishable from "nothing
        // here" unless we say which collections did not come back.
        setFailedCollections(failed);
        setElevationUnavailable(elevationFailed);

        // Drop results Google returned from the other side of the world before
        // they reach the UI *or* the caches — otherwise every later visitor to
        // this grid cell inherits them.
        const routes = withinSearchRadius(routesData, resolvedLocation);
        const mountains = withinSearchRadius(mountainsData, resolvedLocation);
        const campsites = withinSearchRadius(campsitesData, resolvedLocation);

        setRoutes(routes);
        setMountains(mountains);
        setCampsites(campsites);
        setIsLoading(false);

        // Write live results to both caches so future visitors skip the API calls
        writeSessionCache({ routes, mountains, campsites, location: resolvedLocation });
        writeFirestoreCache(userCoords, {
          routes,
          mountains,
          campsites,
          location: resolvedLocation,
        });
      } catch (err) {
        console.error('Places pipeline failed:', err);
        setError("We couldn't load places near you.");
        setIsLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, locationStatus, locationKey, placesAttempt]);

  // Drop both caches and re-run the pipeline. Without clearing sessionStorage
  // the retry would replay the same failed-and-cached result.
  const retryPlacesFetch = () => {
    try {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
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
    elevationUnavailable,
    retryPlacesFetch,
  };
}
