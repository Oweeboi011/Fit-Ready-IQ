import type { Difficulty } from './routeDifficulty';
import type { Campsite, Mountain, Route } from './placesTypes';

/**
 * The shape a shared places-cache entry is allowed to have.
 *
 * `places_cache` is filled by browsers and read by everyone in a 0.5° cell for
 * a day, so whatever one client writes, a region's worth of visitors is shown.
 * The route used to check only that each list held plain objects, which let any
 * signed-in account park arbitrary fields and values — invented elevations,
 * fake difficulty, megabyte strings — in front of strangers.
 *
 * Every parser here builds a fresh object from the fields the app actually
 * writes (see `placesFetchers.ts`) and drops everything else. A known field
 * with a value outside its range fails the item, and one failed item fails the
 * write: an honest client never produces one, so it is a bug or an attempt, and
 * either way it should not reach the shared cache.
 *
 * This bounds *shape*, not truth. A well-formed lie still passes; what stops
 * one account rewriting a region is first-writer-wins in the route.
 */

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
 * Shared by the client (both cache tiers) and `/api/places/cache`, which
 * refuses to store any other version: readers discard it anyway, and under
 * first-writer-wins it would hold a cell against a correct entry for a day.
 *
 * v2 — elevation may be null, difficulty derived from terrain not star rating.
 * v3 — route `distance_km` is null (it was the distance from whoever filled
 *      the cache, not the trail's length); mountains no longer carry the
 *      prominence, jump-off and trail class that were derived from altitude.
 */
export const PLACES_CACHE_VERSION = 3;

export const MAX_ITEMS_PER_KIND = 200;

const MAX_ID = 64;
const MAX_NAME = 200;
const MAX_PLACE_ID = 512;
const MAX_LABEL = 40;
const MAX_URL = 2048;
const MAX_PHOTOS = 10;
const MAX_AMENITIES = 30;
const MAX_POLYLINE_POINTS = 2000;

/** Below the Dead Sea shore to above Everest, with margin. */
const MIN_ELEVATION_M = -500;
const MAX_ELEVATION_M = 9000;
const MAX_ROUTE_KM = 1000;

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'moderate', 'challenging', 'unknown'];

type Parsed<T> = T | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function numberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Optional fields: absent (or explicitly undefined) is fine, present must be valid. */
function optional<T>(value: unknown, check: (v: unknown) => v is T): T | undefined | false {
  if (value === undefined) return undefined;
  return check(value) ? value : false;
}

function nullableNumber(value: unknown, min: number, max: number): number | null | false {
  if (value === null) return null;
  return numberIn(value, min, max) ? value : false;
}

/** `[lng, lat]` — the codebase's GeoJSON order. */
function isLngLat(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    numberIn(value[0], -180, 180) &&
    numberIn(value[1], -90, 90)
  );
}

function isElevation(value: unknown): value is number {
  return numberIn(value, MIN_ELEVATION_M, MAX_ELEVATION_M);
}

function isLabel(value: unknown): value is string {
  return text(value, MAX_LABEL);
}

function isPlaceId(value: unknown): value is string {
  return text(value, MAX_PLACE_ID);
}

/** Photo URLs are rendered as images for every visitor, so https only. */
function isPhotoList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_PHOTOS &&
    value.every((url) => text(url, MAX_URL) && url.startsWith('https://'))
  );
}

function isAmenityList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.length <= MAX_AMENITIES && value.every((a) => text(a, MAX_LABEL))
  );
}

function isPolyline(value: unknown): value is [number, number][] {
  return Array.isArray(value) && value.length <= MAX_POLYLINE_POINTS && value.every(isLngLat);
}

/** The fields every kind shares, or null if any is invalid. */
function parseBase(
  item: Record<string, unknown>
): Parsed<{ id: string; name: string; coordinates: [number, number] }> {
  if (!text(item.id, MAX_ID) || !text(item.name, MAX_NAME) || !isLngLat(item.coordinates)) {
    return null;
  }
  return { id: item.id, name: item.name, coordinates: [item.coordinates[0], item.coordinates[1]] };
}

/**
 * Collects optional fields, returning null if any present one is invalid.
 * `undefined` values are left off so the stored document carries no noise.
 */
function collectOptional(
  entries: Record<string, unknown | undefined | false>
): Parsed<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value === false) return null;
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function parseRoute(value: unknown): Parsed<Route> {
  if (!isRecord(value)) return null;
  const base = parseBase(value);
  if (!base) return null;

  // Nullable: a trail's length is unknown whenever there is no trail geometry,
  // which for a Google Places result is always. See placesFetchers.ts.
  const distance = nullableNumber(value.distance_km, 0, MAX_ROUTE_KM);
  const gain = nullableNumber(value.elevation_gain_m, 0, MAX_ELEVATION_M);
  if (distance === false || gain === false) return null;
  if (!DIFFICULTIES.includes(value.difficulty as Difficulty)) return null;
  if (!isLabel(value.activity_type)) return null;

  const rest = collectOptional({
    place_id: optional(value.place_id, isPlaceId),
    photos: optional(value.photos, isPhotoList),
    polyline: optional(value.polyline, isPolyline),
    jumpoff_elevation: optional(value.jumpoff_elevation, isElevation),
    summit_elevation: optional(value.summit_elevation, isElevation),
  });
  if (!rest) return null;

  // Deliberately dropped: `distance_from_user_km` is relative to whoever wrote
  // the entry, so it is wrong for every reader and says where the writer was;
  // the page derives it per viewer. `strava_segment` has no writer at all.
  return {
    ...base,
    distance_km: distance,
    elevation_gain_m: gain,
    difficulty: value.difficulty as Difficulty,
    activity_type: value.activity_type,
    ...rest,
  };
}

export function parseMountain(value: unknown): Parsed<Mountain> {
  if (!isRecord(value)) return null;
  const base = parseBase(value);
  if (!base) return null;

  const elevation = nullableNumber(value.elevation_m, MIN_ELEVATION_M, MAX_ELEVATION_M);
  if (elevation === false) return null;
  if (!isLabel(value.mountain_type)) return null;

  const rest = collectOptional({
    prominence_m: optional(value.prominence_m, isElevation),
    trail_class: optional(value.trail_class, isLabel),
    place_id: optional(value.place_id, isPlaceId),
    photos: optional(value.photos, isPhotoList),
    jumpoff_elevation: optional(value.jumpoff_elevation, isElevation),
    summit_elevation: optional(value.summit_elevation, isElevation),
  });
  if (!rest) return null;

  return { ...base, elevation_m: elevation, mountain_type: value.mountain_type, ...rest };
}

export function parseCampsite(value: unknown): Parsed<Campsite> {
  if (!isRecord(value)) return null;
  const base = parseBase(value);
  if (!base) return null;
  if (!isLabel(value.type)) return null;

  const rest = collectOptional({
    rating: optional(value.rating, (v): v is number => numberIn(v, 0, 5)),
    amenities: optional(value.amenities, isAmenityList),
    place_id: optional(value.place_id, isPlaceId),
    photos: optional(value.photos, isPhotoList),
  });
  if (!rest) return null;

  return { ...base, type: value.type, ...rest };
}

/** A whole list, or null if it is not a list, is too long, or holds one bad item. */
export function parseList<T>(value: unknown, parse: (item: unknown) => Parsed<T>): Parsed<T[]> {
  if (!Array.isArray(value) || value.length > MAX_ITEMS_PER_KIND) return null;
  const parsed: T[] = [];
  for (const item of value) {
    const result = parse(item);
    if (result === null) return null;
    parsed.push(result);
  }
  return parsed;
}
