import { haversineKm } from './mapsGeometry';

/**
 * A Komoot tour, read from a shared link.
 *
 * Komoot publishes no API. The tour pages are rendered from
 * `api.komoot.de/v007/tours/{id}`, which answers without a key for a public
 * tour and for a private one when the link carries its `share_token`. That
 * endpoint is undocumented, so everything here treats its answer as untrusted:
 * every field is checked, an absent one stays `null`, and a shape we do not
 * recognise is a failure rather than a route made of zeroes.
 *
 * Parsing lives here, not in the route handler, so it can be tested without a
 * network and so the client and server agree on the shape.
 */

export interface KomootShare {
  /** Komoot's key, e.g. `sf#gravel` or `wt#hike_d3`. */
  type: string;
  label: string;
  /** Fraction of the route, 0–1. */
  share: number;
}

export interface KomootRoute {
  id: string;
  name: string;
  /** Komoot's sport key, e.g. `hike`, `mtb`, `jogging`. */
  sport: string;
  distanceKm: number;
  /** Komoot's own moving-time estimate, or null when it gave none. */
  durationSeconds: number | null;
  ascentM: number | null;
  descentM: number | null;
  /** Komoot's grade: `easy`, `moderate` or `difficult`; null when absent. */
  komootGrade: string | null;
  start: { lat: number; lng: number };
  /** `[lng, lat]` pairs, the codebase's polyline order, downsampled. */
  path: [number, number][];
  /** Metres for each `path` point; null where Komoot had no altitude. */
  altitudes: (number | null)[];
  surfaces: KomootShare[];
  wayTypes: KomootShare[];
  /** Fraction of the route off any mapped way. 0 when Komoot says nothing. */
  offGridShare: number;
  /** Link back to the tour on komoot.com, for attribution. */
  url: string;
}

export type KomootLink =
  | { ok: true; id: string; shareToken: string | null }
  | { ok: false; reason: 'invalid' | 'smarttour' };

/** Points kept for the map line and the profile. Plenty for a 320px strip. */
export const MAX_PATH_POINTS = 400;

const HOSTS = /(^|\.)komoot\.(com|de)$/i;

/**
 * Pull the tour id (and share token) out of whatever the user pasted.
 *
 * Accepts `komoot.com/tour/123`, locale-prefixed paths (`/de-de/tour/123`),
 * `komoot.de`, the bare number, and the URL with any tracking parameters
 * attached. Komoot's curated "smart tours" (`/smarttour/e123…`) are a different
 * resource behind a different endpoint, so they are named rather than lumped in
 * with nonsense input.
 */
export function parseKomootLink(raw: string): KomootLink {
  const text = raw.trim();
  if (/^\d{3,15}$/.test(text)) return { ok: true, id: text, shareToken: null };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!HOSTS.test(url.hostname)) return { ok: false, reason: 'invalid' };
  if (/\/smarttour\//i.test(url.pathname)) return { ok: false, reason: 'smarttour' };

  const match = url.pathname.match(/\/tour\/(\d{3,15})(?:\/|$)/);
  if (!match) return { ok: false, reason: 'invalid' };

  const token = url.searchParams.get('share_token');
  // Tokens are opaque, but anything other than URL-safe characters is not one.
  const shareToken = token && /^[A-Za-z0-9_-]{1,128}$/.test(token) ? token : null;
  return { ok: true, id: match[1], shareToken };
}

const SURFACE_LABELS: Record<string, string> = {
  'sf#asphalt': 'Asphalt',
  'sf#paved': 'Paved',
  'sf#concrete': 'Concrete',
  'sf#paving_stones': 'Paving stones',
  'sf#cobbles': 'Cobbles',
  'sf#compacted': 'Compacted gravel',
  'sf#gravel': 'Gravel',
  'sf#fine_gravel': 'Fine gravel',
  'sf#unpaved': 'Unpaved',
  'sf#nature': 'Natural ground',
  'sf#ground': 'Natural ground',
  'sf#sand': 'Sand',
  'sf#alpine': 'Alpine terrain',
  'sf#rock': 'Rock',
  'sf#snow': 'Snow',
  'sf#unknown': 'Unknown surface',
};

const WAY_TYPE_LABELS: Record<string, string> = {
  'wt#street': 'Street',
  'wt#minor_road': 'Minor road',
  'wt#primary': 'Main road',
  'wt#state_road': 'Road',
  'wt#service': 'Service road',
  'wt#way': 'Track',
  'wt#footway': 'Footpath',
  'wt#cycleway': 'Cycleway',
  'wt#trail': 'Trail',
  'wt#hike_d1': 'Hiking path',
  'wt#hike_d2': 'Hiking path',
  'wt#hike_d3': 'Mountain hiking path',
  'wt#hike_d4': 'Alpine path',
  'wt#hike_d5': 'Demanding alpine path',
  'wt#hike_d6': 'Difficult alpine route',
  'wt#mtb_d1': 'Mountain-bike trail',
  'wt#mtb_d2': 'Mountain-bike trail',
  'wt#mtb_d3': 'Technical singletrack',
  'wt#via_ferrata': 'Via ferrata',
  'wt#off_grid': 'Off the mapped network',
  'wt#ferry': 'Ferry',
};

/** `sf#fine_gravel` → "Fine gravel" for a key we have no label for. */
function humanise(type: string): string {
  const bare = type.replace(/^[a-z]+#/, '').replace(/_/g, ' ');
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function shares(raw: unknown, labels: Record<string, string>): KomootShare[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, KomootShare>();
  for (const item of raw) {
    const type = typeof item?.type === 'string' ? item.type : null;
    const amount = finite(item?.amount);
    if (!type || amount == null || amount <= 0) continue;
    const label = labels[type] ?? humanise(type);
    // Several keys share a label (paved / asphalt); show them as one.
    const existing = merged.get(label);
    if (existing) existing.share += amount;
    else merged.set(label, { type, label, share: amount });
  }
  return Array.from(merged.values()).sort((a, b) => b.share - a.share);
}

interface RawPoint {
  lat: number;
  lng: number;
  alt: number | null;
}

function points(raw: unknown): RawPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: RawPoint[] = [];
  for (const item of raw) {
    const lat = finite(item?.lat);
    const lng = finite(item?.lng);
    if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({ lat, lng, alt: finite(item?.alt) });
  }
  return out;
}

/** Every `step`-th point, always keeping the last so the line reaches the finish. */
function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}

/** A positive number, or null. */
function positive(value: unknown): number | null {
  const n = finite(value);
  return n != null && n > 0 ? n : null;
}

/** A whole non-negative number of metres, or null. */
function metres(value: unknown): number | null {
  const n = finite(value);
  return n != null && n >= 0 ? Math.round(n) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function trackKm(track: RawPoint[]): number {
  let km = 0;
  for (let i = 1; i < track.length; i++) {
    km += haversineKm([track[i - 1].lng, track[i - 1].lat], [track[i].lng, track[i].lat]);
  }
  return km;
}

/**
 * Komoot's JSON → a {@link KomootRoute}, or null when it is not a tour we can use.
 *
 * A tour needs a track: without coordinates there is nothing to draw, profile
 * or brief, and saying "unavailable" beats a briefing for a 0 km walk.
 */
export function normaliseKomootTour(json: unknown, id: string): KomootRoute | null {
  if (!json || typeof json !== 'object') return null;
  // Untrusted JSON: every field read below goes through a checker.
  const tour = json as Record<string, any>;

  const track = points(tour._embedded?.coordinates?.items);
  if (track.length < 2) return null;

  // Komoot's own distance when it gives one; otherwise measure the track.
  const reportedM = positive(tour.distance);
  const distanceKm = reportedM != null ? reportedM / 1000 : trackKm(track);
  if (!(distanceKm > 0)) return null;

  const wayTypes = shares(tour.summary?.way_types, WAY_TYPE_LABELS);
  const offGrid = wayTypes.find((w) => w.type === 'wt#off_grid')?.share ?? 0;
  const thinned = thin(track, MAX_PATH_POINTS);

  return {
    id,
    name: text(tour.name) ?? 'Komoot tour',
    sport: text(tour.sport) ?? 'hike',
    distanceKm,
    durationSeconds: positive(tour.duration),
    ascentM: metres(tour.elevation_up),
    descentM: metres(tour.elevation_down),
    komootGrade: text(tour.difficulty?.grade),
    start: { lat: track[0].lat, lng: track[0].lng },
    path: thinned.map((p) => [p.lng, p.lat]),
    altitudes: thinned.map((p) => (p.alt == null ? null : Math.round(p.alt))),
    surfaces: shares(tour.summary?.surfaces, SURFACE_LABELS),
    wayTypes,
    offGridShare: Math.min(1, offGrid),
    url: `https://www.komoot.com/tour/${id}`,
  };
}
