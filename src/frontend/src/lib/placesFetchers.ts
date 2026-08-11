// Fetches mountains/routes/campsites near a point from the Google Places API,
// enriched with real Elevation/Distance-Matrix data. Each fetcher is
// independent and reports its own failure — see usePlacesData.ts, which
// treats a failed collection as "unknown", never as "empty".

import type { Route, Mountain, Campsite } from '@/lib/placesTypes';
import {
  haversineKm,
  fetchElevations,
  fetchTravelDistances,
  trailClassFromElevation,
} from '@/lib/mapsGeometry';
import { classifyDifficulty } from '@/lib/routeDifficulty';
import {
  newPlacesService,
  textSearchOnce,
  textSearchPaged,
  nearbySearchOnce,
  dedupedPlacesCollector,
} from '@/lib/placesSearch';

type LatLng = google.maps.LatLngLiteral;
type PlaceResult = google.maps.places.PlaceResult;

const EXCLUDE_COMMERCIAL_TYPES = new Set([
  'restaurant',
  'food',
  'bar',
  'cafe',
  'bakery',
  'meal_takeaway',
  'meal_delivery',
  'lodging',
  'store',
  'shopping_mall',
  'hospital',
  'school',
  'church',
  'place_of_worship',
  'gas_station',
  'bank',
]);

// --- Mountains -------------------------------------------------------------

const MOUNTAIN_TEXT_QUERIES = [
  'mountain',
  'mount',
  'Mt. mountain',
  'peak mountain',
  'summit mountain',
  'volcano mountain',
  'bundok', // Filipino word for mountain
  'tuloy', // Filipino for hill/peak
];

const PEAK_KEYWORDS = [
  'mount',
  'mt.',
  'mt ',
  'mountain',
  'peak',
  'summit',
  'hill',
  'ridge',
  'butte',
  'knob',
  'crest',
  'highland',
  'volcano',
  'volcan',
  'bulkan',
  'bundok',
];

async function searchMountainPlaces(
  service: google.maps.places.PlacesService,
  location: LatLng
): Promise<PlaceResult[]> {
  const { all, push } = dedupedPlacesCollector();

  // textSearch — no radius hard cap, surfaces mountains like Mt. Talamitam,
  // Mt. Lantik, Mt. Apayang that nearbySearch misses.
  await Promise.all(
    MOUNTAIN_TEXT_QUERIES.map((query) => textSearchOnce(service, query, location, 50000).then(push))
  );

  // nearbySearch as fallback for strictly typed natural_feature entries
  push(
    await nearbySearchOnce(service, {
      location,
      radius: 50000,
      type: 'natural_feature' as string,
      keyword: 'mountain peak summit volcano',
    })
  );

  return all
    .filter(
      (place) =>
        place.name &&
        place.geometry?.location &&
        PEAK_KEYWORDS.some((kw) => place.name!.toLowerCase().includes(kw)) &&
        !(place.types || []).some((t) => EXCLUDE_COMMERCIAL_TYPES.has(t))
    )
    .slice(0, 60);
}

function buildMountainRecord(
  place: PlaceResult,
  index: number,
  elevation: number | null
): Mountain {
  const prominence = elevation == null ? undefined : Math.round(elevation * 0.28);
  const jumpoff = elevation == null ? undefined : Math.round(elevation * 0.55);
  return {
    id: `m${index + 1}`,
    name: place.name || 'Unknown Mountain',
    coordinates: [place.geometry!.location!.lng(), place.geometry!.location!.lat()],
    elevation_m: elevation,
    prominence_m: prominence,
    trail_class: elevation == null ? undefined : trailClassFromElevation(elevation),
    mountain_type: 'peak',
    place_id: place.place_id,
    photos: [],
    jumpoff_elevation: jumpoff,
    summit_elevation: elevation ?? undefined,
  };
}

// Throws on a hard failure (network error, unexpected exception) so the
// caller's own try/catch can report the collection as failed — distinct from
// `elevationFailed`, which means the collection loaded but the Elevation API
// specifically degraded (results still usable, with null elevations).
export async function fetchMountainsNearby(
  userCoords: [number, number]
): Promise<{ data: Mountain[]; elevationFailed: boolean }> {
  const location: LatLng = { lat: userCoords[1], lng: userCoords[0] };
  const service = newPlacesService();
  const places = await searchMountainPlaces(service, location);

  // Batch-fetch real summit elevations from Google ElevationService
  const locations = places.map((p) => ({
    lat: p.geometry!.location!.lat(),
    lng: p.geometry!.location!.lng(),
  }));
  const { values: elevations, failed: elevationFailed } = await fetchElevations(locations);

  const data = places
    .map((place, index) => buildMountainRecord(place, index, elevations[index] ?? null))
    // Drop molehills, but only where we actually know the elevation.
    // Filtering on an unknown used to delete every peak whenever the
    // Elevation API was over quota — an empty tab with no explanation.
    .filter((m) => m.elevation_m == null || m.elevation_m >= 100);
  return { data, elevationFailed };
}

// --- Routes ------------------------------------------------------------------

const ROUTE_TEXT_QUERIES = [
  'hiking trail',
  'hiking area',
  'trekking trail',
  'trail park',
  'national park hiking',
  'protected area trail',
  'forest park trail',
  'eco park hiking',
  'nature trail',
  'mountain trail',
  'ridge trail',
  'forest trail',
  'wilderness trail',
  'scenic trail',
  'walking trail',
  'trail head',
  'nature park',
  'protected forest',
  'likha trail', // Filipino
  'dayhike area', // Filipino community term
  'jumpoff site', // Filipino mountaineering term
  'trail Philippines',
  'DENR protected area',
  'provincial park trail',
  'heritage trail',
  'rock climbing area',
  'climbing crag',
  'bouldering area',
  'outdoor climbing wall',
  'rappelling site',
];

const EXCLUDE_ROUTE_KEYWORDS = ['farm', 'resort', 'hotel', 'casino', 'supermarket', 'mall'];

async function searchRoutePlaces(
  service: google.maps.places.PlacesService,
  location: LatLng
): Promise<PlaceResult[]> {
  const { all, push } = dedupedPlacesCollector();

  // textSearch (not nearbySearch) so the 50 km hard cap doesn't apply and
  // all Google Maps hiking-tagged areas are surfaced. Up to 3 pages each.
  await Promise.all(
    ROUTE_TEXT_QUERIES.map((query) => textSearchPaged(service, query, location, 50000, push))
  );

  // Also pull nearbySearch for parks / tourist_attractions / natural_feature tagged as hiking
  const nearbyTypes = ['park', 'tourist_attraction', 'natural_feature'];
  await Promise.all(
    nearbyTypes.map((type) =>
      nearbySearchOnce(service, {
        location,
        radius: 50000,
        type,
        keyword: 'hiking trail trek dayhike',
      }).then(push)
    )
  );

  return all
    .filter(
      (place) =>
        place.name &&
        place.geometry?.location &&
        !(place.types || []).some((t) => EXCLUDE_COMMERCIAL_TYPES.has(t)) &&
        !EXCLUDE_ROUTE_KEYWORDS.some((kw) => place.name!.toLowerCase().includes(kw))
    )
    .slice(0, 100);
}

function classifyRouteActivityType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('bike') || lower.includes('cycling') || lower.includes('bikepacking'))
    return 'bike';
  if (
    lower.includes('climb') ||
    lower.includes('crag') ||
    lower.includes('boulder') ||
    lower.includes('rock wall') ||
    lower.includes('rappel')
  )
    return 'rock_climb';
  if (
    lower.includes('tour') ||
    lower.includes('road') ||
    lower.includes('scenic drive') ||
    lower.includes('heritage road') ||
    lower.includes('route')
  )
    return 'tour';
  return 'hike';
}

interface RouteMetricsInput {
  place: PlaceResult;
  index: number;
  userCoords: [number, number];
  travelDistancesM: (number | null)[];
  routeBaseElevations: (number | null)[];
  terrainProbeElevations: (number | null)[];
}

function deriveRouteDistanceKm({
  place,
  index,
  userCoords,
  travelDistancesM,
}: RouteMetricsInput): number {
  const fallbackKm = Math.max(
    1,
    Math.round(
      haversineKm(userCoords, [place.geometry!.location!.lng(), place.geometry!.location!.lat()]) *
        1.15 *
        10
    ) / 10
  );
  return travelDistancesM[index]
    ? Math.max(0.5, Math.round((travelDistancesM[index]! / 1000) * 10) / 10)
    : fallbackKm;
}

/**
 * Relief sampled from five points ~900 m around the trailhead. This is
 * terrain relief near the start, NOT gain along a trail — there is no trail
 * geometry here to walk. It stays null when the probes came back empty; the
 * old `Math.max(50, ...)` floor turned every such failure into a
 * confident-looking "50 m" on every route.
 */
function deriveRouteRelief({
  index,
  routeBaseElevations,
  terrainProbeElevations,
}: RouteMetricsInput): { jumpoff: number | null; localRelief: number | null } {
  const probeStart = index * 5;
  const probeSamples = terrainProbeElevations
    .slice(probeStart, probeStart + 5)
    .filter((v): v is number => v !== null);
  const jumpoff = routeBaseElevations[index] ?? probeSamples[0] ?? null;
  const localRelief =
    probeSamples.length > 0 && jumpoff != null
      ? Math.max(0, Math.round(Math.max(...probeSamples) - jumpoff))
      : null;
  return { jumpoff, localRelief };
}

function buildRouteRecord(input: RouteMetricsInput): Route {
  const { place, index } = input;
  const distance = deriveRouteDistanceKm(input);
  const { jumpoff, localRelief } = deriveRouteRelief(input);

  return {
    id: `r${index + 1}`,
    name: place.name || 'Trail',
    coordinates: [place.geometry!.location!.lng(), place.geometry!.location!.lat()],
    distance_km: distance,
    elevation_gain_m: localRelief,
    // Was read off the Google star rating, which measures how much people
    // liked a place, not how hard it is to walk.
    difficulty: classifyDifficulty(distance, localRelief),
    activity_type: classifyRouteActivityType(place.name || ''),
    place_id: place.place_id,
    photos: [],
    jumpoff_elevation: jumpoff ?? undefined,
    summit_elevation: jumpoff != null && localRelief != null ? jumpoff + localRelief : undefined,
  };
}

// Throws on a hard failure — see fetchMountainsNearby's comment on
// elevationFailed vs. a thrown/caught error.
export async function fetchRoutesNearby(
  userCoords: [number, number]
): Promise<{ data: Route[]; elevationFailed: boolean }> {
  const location: LatLng = { lat: userCoords[1], lng: userCoords[0] };
  const service = newPlacesService();
  const places = await searchRoutePlaces(service, location);

  const routeLocations = places.map((p) => ({
    lat: p.geometry!.location!.lat(),
    lng: p.geometry!.location!.lng(),
  }));
  const { values: routeBaseElevations, failed: routeBaseFailed } =
    await fetchElevations(routeLocations);
  const travelDistancesM = await fetchTravelDistances(location, routeLocations);

  const terrainProbeLocations = routeLocations.flatMap((loc) => [
    loc,
    { lat: loc.lat + 0.008, lng: loc.lng },
    { lat: loc.lat - 0.008, lng: loc.lng },
    { lat: loc.lat, lng: loc.lng + 0.008 },
    { lat: loc.lat, lng: loc.lng - 0.008 },
  ]);
  const { values: terrainProbeElevations, failed: probeFailed } =
    await fetchElevations(terrainProbeLocations);

  const data = places.map((place, index) =>
    buildRouteRecord({
      place,
      index,
      userCoords,
      travelDistancesM,
      routeBaseElevations,
      terrainProbeElevations,
    })
  );
  return { data, elevationFailed: routeBaseFailed || probeFailed };
}

// --- Campsites ---------------------------------------------------------------

const CAMPSITE_TEXT_QUERIES = [
  'campground',
  'campsite',
  'camping area',
  'camping site',
  'camp ground',
  'eco camp',
  'glamping',
  'tent camping',
  'campsite park',
];

const EXCLUDE_CAMP_TYPES = new Set([...EXCLUDE_COMMERCIAL_TYPES, 'farm']);
const EXCLUDE_CAMP_KEYWORDS = ['farm', 'resort', 'hotel', 'motel', 'inn', 'pension', 'hostel'];

// Throws on a hard failure — see fetchMountainsNearby's comment on
// elevationFailed vs. a thrown/caught error. Campsites have no elevation
// concept (no Elevation API call), so there is no elevationFailed to report.
export async function fetchCampsitesNearby(
  userCoords: [number, number]
): Promise<{ data: Campsite[] }> {
  const location: LatLng = { lat: userCoords[1], lng: userCoords[0] };
  const service = newPlacesService();
  const { all, push } = dedupedPlacesCollector();

  // textSearch — no radius cap, catches all Google Maps campground tags
  await Promise.all(
    CAMPSITE_TEXT_QUERIES.map((query) => textSearchOnce(service, query, location, 50000).then(push))
  );

  // nearbySearch with campground type for anything textSearch missed
  push(await nearbySearchOnce(service, { location, radius: 50000, type: 'campground' as string }));

  const data: Campsite[] = all
    .filter(
      (place) =>
        place.name &&
        place.geometry?.location &&
        !(place.types || []).some((t) => EXCLUDE_CAMP_TYPES.has(t)) &&
        !EXCLUDE_CAMP_KEYWORDS.some((kw) => place.name!.toLowerCase().includes(kw))
    )
    .slice(0, 60)
    .map((place, index) => ({
      id: `c${index + 1}`,
      name: place.name || 'Campsite',
      coordinates: [place.geometry!.location!.lng(), place.geometry!.location!.lat()],
      type: 'campground',
      rating: place.rating,
      amenities: [],
      place_id: place.place_id,
      photos: [],
    }));
  return { data };
}
