// OpenStreetMap discovery: what `/api/discover` asks Waymarked Trails and
// Photon, and how their answers become Route / Mountain / Campsite records.
// Pure — no fetch — so every rule about what a number means is testable.
//
// Replaces Google Places (#86). The difference that matters is not the price:
// a Google result was a pin, so a trail had no length and every route was
// unrated. A Waymarked Trails route is an OSM relation whose length is measured
// from its mapped geometry, so `distance_km` is now a real number.

import type { Campsite, Mountain, Route } from '@/lib/placesTypes';
import { classifyDifficulty } from '@/lib/routeDifficulty';

/** Waymarked Trails sites this discovery reads, and what each one is for. */
export const WAYMARKED_SITES = {
  hiking: { host: 'https://hiking.waymarkedtrails.org', activity: 'hike', limit: 40 },
  mtb: { host: 'https://mtb.waymarkedtrails.org', activity: 'bike', limit: 15 },
} as const;

export type WaymarkedSite = keyof typeof WAYMARKED_SITES;

/** Half-width of the area searched for routes, in degrees of latitude (~22 km). */
const ROUTE_SEARCH_DEG = 0.2;

export const MAX_ROUTES = 100;
export const MAX_MOUNTAINS = 60;
export const MAX_CAMPSITES = 60;

const EARTH_RADIUS_M = 6_378_137;

/** WGS84 → Web Mercator, the projection Waymarked Trails' API speaks. */
export function toMercator(lng: number, lat: number): [number, number] {
  const x = (lng * Math.PI * EARTH_RADIUS_M) / 180;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * EARTH_RADIUS_M;
  return [x, y];
}

export function fromMercator(x: number, y: number): [number, number] {
  const lng = (x / EARTH_RADIUS_M) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * (180 / Math.PI);
  return [lng, lat];
}

/** The search box around a point, as Waymarked Trails' `bbox` parameter. */
export function waymarkedBbox(lat: number, lng: number): string {
  // Widen the longitude span with latitude so the box stays roughly square.
  const dLng = ROUTE_SEARCH_DEG / Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const [x1, y1] = toMercator(lng - dLng, lat - ROUTE_SEARCH_DEG);
  const [x2, y2] = toMercator(lng + dLng, lat + ROUTE_SEARCH_DEG);
  return [x1, y1, x2, y2].map(Math.round).join(',');
}

/** The subset of a Waymarked Trails `details/relation/{id}` response we read. */
export interface WaymarkedDetails {
  id: number;
  name?: string;
  /** `[minx, miny, maxx, maxy]` in Web Mercator. */
  bbox?: number[];
  tags?: Record<string, string>;
  route?: { length?: number };
}

/**
 * A metric height or climb from an OSM tag: `"4478"`, `"4478 m"`, `"14692 ft"`.
 * Anything else — a range, a note, a blank — is unknown rather than guessed at.
 */
export function parseOsmMetres(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*(m|ft|')?\s*$/i.exec(raw.replace(',', '.'));
  if (!match) return null;
  const value = Number(match[1]);
  const metres = match[2] && match[2].toLowerCase() !== 'm' ? value * 0.3048 : value;
  return Number.isFinite(metres) ? Math.round(metres) : null;
}

/**
 * The one photo an OSM object names directly, as a Commons URL.
 *
 * Only Wikimedia Commons is accepted: an arbitrary `image=` URL would be
 * rendered for every visitor from a host nobody vetted, and the CSP allows
 * Commons alone.
 */
export function commonsPhoto(tags: Record<string, string> | undefined): string | null {
  const commons = tags?.wikimedia_commons;
  if (commons?.startsWith('File:')) return commonsFileUrl(commons.slice('File:'.length));
  const image = tags?.image;
  const match = image && /^https?:\/\/commons\.wikimedia\.org\/wiki\/File:(.+)$/.exec(image);
  return match ? commonsFileUrl(decodeURIComponent(match[1])) : null;
}

/** A Commons file at a size a details card can use. */
export function commonsFileUrl(fileName: string): string {
  const name = encodeURIComponent(fileName.replace(/ /g, '_'));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=800`;
}

/**
 * Wikidata's P18 value (`http://commons.wikimedia.org/wiki/Special:FilePath/X.jpg`)
 * as the same sized Commons URL `commonsPhoto` produces.
 */
export function commonsUrlFromWikidata(raw: string): string | null {
  const match = /\/Special:FilePath\/(.+)$/.exec(raw);
  if (!match) return null;
  try {
    return commonsFileUrl(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

/** `Q123`, or null for anything that is not a Wikidata item id. */
export function wikidataId(tags: Record<string, string> | undefined): string | null {
  const id = tags?.wikidata?.trim();
  return id && /^Q\d{1,12}$/.test(id) ? id : null;
}

/**
 * A Waymarked Trails relation as a Route.
 *
 * `distance_km` is the mapped length of the relation — measured geometry, not a
 * tag someone typed. `elevation_gain_m` is the relation's `ascent` tag when it
 * has one; Waymarked Trails computes no climb, and nothing here invents one, so
 * a route without the tag stays unrated rather than guessed at.
 *
 * The pin is the centre of the route's bounding box. For a loop or a long
 * traverse that is not on the trail, so it locates the route; it does not mark
 * where it starts.
 */
export function routeFromWaymarked(details: WaymarkedDetails, site: WaymarkedSite): Route | null {
  const name = details.name?.trim() || details.tags?.name?.trim();
  const bbox = details.bbox;
  if (!name || !bbox || bbox.length !== 4 || !bbox.every(Number.isFinite)) return null;

  const coordinates = fromMercator((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2);
  const lengthM = details.route?.length;
  const distanceKm =
    typeof lengthM === 'number' && lengthM > 0 ? Math.round(lengthM / 100) / 10 : null;
  const gain = parseOsmMetres(details.tags?.ascent);
  const photo = commonsPhoto(details.tags);

  return {
    id: `wmt-${site}-${details.id}`,
    name,
    coordinates,
    distance_km: distanceKm,
    elevation_gain_m: gain,
    difficulty: classifyDifficulty(distanceKm, gain),
    activity_type: WAYMARKED_SITES[site].activity,
    place_id: `osm:relation/${details.id}`,
    photos: photo ? [photo] : [],
  };
}

/**
 * The OSM tags Photon is asked about, and how far out. Photon answers at most
 * 50 per request, nearest first, which is the right shortlist for discovery.
 */
export const PHOTON_QUERIES = {
  peaks: { tag: 'natural:peak', radiusKm: 30 },
  volcanoes: { tag: 'natural:volcano', radiusKm: 40 },
  campsites: { tag: 'tourism:camp_site', radiusKm: 40 },
} as const;

export function photonReverseUrl(
  lat: number,
  lng: number,
  query: (typeof PHOTON_QUERIES)[keyof typeof PHOTON_QUERIES]
): string {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    limit: '50',
    radius: String(query.radiusKm),
    osm_tag: query.tag,
  });
  return `https://photon.komoot.io/reverse?${params}`;
}

/** A Photon GeoJSON feature, with the fields discovery reads. */
export interface PhotonPlace {
  geometry?: { coordinates?: number[] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_value?: string;
    name?: string;
  };
}

const OSM_TYPES: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };

/** Name, point and OSM identity, or null if any is missing. */
function photonBase(feature: PhotonPlace) {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const p = feature.properties ?? {};
  const name = p.name?.trim();
  const type = p.osm_type && OSM_TYPES[p.osm_type];
  if (!name || !type || !p.osm_id || typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }
  return {
    id: `osm-${type}-${p.osm_id}`,
    name,
    coordinates: [lng, lat] as [number, number],
    place_id: `osm:${type}/${p.osm_id}`,
  };
}

/**
 * A summit. Photon does not carry OSM's `ele` tag, so the height is filled in
 * afterwards from a terrain model at the summit point — `null` until then, and
 * `null` for good if that lookup fails.
 */
export function mountainFromPhoton(feature: PhotonPlace): Mountain | null {
  const base = photonBase(feature);
  if (!base) return null;
  return {
    ...base,
    elevation_m: null,
    mountain_type: feature.properties?.osm_value === 'volcano' ? 'volcano' : 'peak',
    photos: [],
  };
}

export function campsiteFromPhoton(feature: PhotonPlace): Campsite | null {
  const base = photonBase(feature);
  if (!base) return null;
  return { ...base, type: 'campground', amenities: [], photos: [] };
}

/** Summit heights, in the same order as `mountains`; a `null` stays unknown. */
export function withElevations(mountains: Mountain[], heights: (number | null)[]): Mountain[] {
  return mountains.map((m, i) => {
    const h = heights[i];
    return typeof h === 'number' ? { ...m, elevation_m: h, summit_elevation: h } : m;
  });
}

/** Below this a "peak" is a mound in a park, not somewhere to plan a climb to. */
const MIN_SUMMIT_M = 100;

/**
 * Drops molehills, but only where the height is actually known. Filtering on an
 * unknown once emptied the whole peaks tab whenever the elevation lookup failed.
 */
export function worthClimbing(mountain: Mountain): boolean {
  return mountain.elevation_m == null || mountain.elevation_m >= MIN_SUMMIT_M;
}

/** One place per OSM object, first seen wins — the peak and volcano lists can overlap. */
export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/** Nearest first, then cut to `max` — discovery is about what is close. */
export function nearestFirst<T extends { coordinates: [number, number] }>(
  items: T[],
  lat: number,
  lng: number,
  max: number
): T[] {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dist = (item: T) => {
    const dx = (item.coordinates[0] - lng) * cosLat;
    const dy = item.coordinates[1] - lat;
    return dx * dx + dy * dy;
  };
  return [...items].sort((a, b) => dist(a) - dist(b)).slice(0, max);
}

/** Attaches a Wikidata image to items that have none, keyed by their `place_id`. */
export function withWikidataPhotos<T extends { place_id?: string; photos?: string[] }>(
  items: T[],
  wikidataByPlace: Map<string, string>,
  imageByWikidata: Map<string, string>
): T[] {
  return items.map((item) => {
    if (item.photos?.length || !item.place_id) return item;
    const qid = wikidataByPlace.get(item.place_id);
    const image = qid ? imageByWikidata.get(qid) : undefined;
    return image ? { ...item, photos: [image] } : item;
  });
}
