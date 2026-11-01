// Geometry and elevation helpers: haversine, path sampling, batch elevation
// lookups through /api/elevation. No React, no component state, no Google SDK.

export function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

/** Points per `/api/elevation` call — the upstream's own per-request cap. */
const ELEVATION_CHUNK = 100;

/**
 * Coordinates rounded to ~1 m. Elevation does not change at that scale, and
 * rounding is what lets two visitors asking about the same peak share one
 * cached response at the edge.
 */
const round = (v: number) => Math.round(v * 1e5) / 1e5;

async function fetchChunk(
  chunk: LatLngLiteral[]
): Promise<{ values: (number | null)[]; failed: boolean }> {
  const locations = chunk.map((p) => `${round(p.lat)},${round(p.lng)}`).join('|');
  try {
    const res = await fetch(`/api/elevation?locations=${encodeURIComponent(locations)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { values?: (number | null)[] };
    if (!Array.isArray(data.values) || data.values.length !== chunk.length) {
      throw new Error('malformed elevation response');
    }
    return { values: data.values, failed: false };
  } catch (err) {
    // Surfaced rather than swallowed: a quota or outage is a configuration
    // problem, and a silent empty result hides it.
    console.error('Elevation lookup failed:', err);
    return { values: chunk.map(() => null), failed: true };
  }
}

/**
 * Look up ground elevation for a batch of points.
 *
 * A `null` entry means "we do not know", and callers must treat it that way —
 * never as zero, and never as a licence to substitute a plausible-looking
 * number. Silently swallowing a failed lookup here is what previously made
 * every route report exactly 50 m of gain and emptied the peaks tab, because
 * downstream code coerced the nulls into 0 and then floored or filtered them.
 *
 * Chunks run one after another, not in parallel: the free upstream allows one
 * request a second per caller, and a burst would be refused as a whole.
 */
export async function fetchElevations(
  locations: LatLngLiteral[]
): Promise<{ values: (number | null)[]; failed: boolean }> {
  const values: (number | null)[] = [];
  let failed = false;
  for (let i = 0; i < locations.length; i += ELEVATION_CHUNK) {
    const result = await fetchChunk(locations.slice(i, i + ELEVATION_CHUNK));
    values.push(...result.values);
    failed ||= result.failed;
  }
  return { values, failed };
}

/**
 * Samples per elevation profile.
 *
 * One upstream call's worth. A profile strip a few hundred pixels wide gains
 * nothing from more, and every extra call spends the shared daily quota.
 */
const MAX_PATH_SAMPLES = ELEVATION_CHUNK;

/**
 * How many vertices of the route we keep to describe its shape.
 *
 * A route carries far more detail than its shape needs: a 1.5 km snapped walk
 * already decodes to ~56 vertices, so a mountain route runs to hundreds or
 * thousands. 100 vertices describes the *course* of any hikeable route closely
 * enough for the sampled points to land on the same ground.
 */
const MAX_PATH_VERTICES = 100;

/**
 * Reduces a path to at most `max` vertices, keeping its start and end.
 *
 * Also drops consecutive duplicates, which the polyline decoder can emit and
 * which contribute a zero-length leg.
 *
 * Exported for its tests: this is arithmetic, and it is the part that was wrong.
 */
export function downsamplePath<TPoint extends { lat: number; lng: number }>(
  path: TPoint[],
  max = MAX_PATH_VERTICES
): TPoint[] {
  const deduped = path.filter(
    (point, i) => i === 0 || point.lat !== path[i - 1].lat || point.lng !== path[i - 1].lng
  );

  if (deduped.length <= max) return deduped;

  // Even stride across the interior, with the final vertex appended: the end of
  // a route is not a point to approximate, it is where the distance axis stops.
  const stride = (deduped.length - 1) / (max - 1);
  const picked: TPoint[] = [];
  for (let i = 0; i < max - 1; i++) picked.push(deduped[Math.round(i * stride)]);
  picked.push(deduped[deduped.length - 1]);
  return picked;
}

/**
 * `count` points evenly spaced by distance along a path, first and last
 * included.
 *
 * This is the interpolation Google's `getElevationAlongPath` used to do for us.
 * Spacing is by great-circle distance, not by vertex index: a route's vertices
 * bunch up on switchbacks and thin out on straights, and indexing by vertex
 * would sample the switchbacks to death and skip the climb between them.
 *
 * Exported for its tests.
 */
export function samplePath(path: LatLngLiteral[], count: number): LatLngLiteral[] {
  if (path.length < 2 || count < 2) return path.slice(0, Math.max(0, count));

  const legs: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const km = haversineKm([path[i - 1].lng, path[i - 1].lat], [path[i].lng, path[i].lat]);
    legs.push(km);
    total += km;
  }
  if (total === 0) return Array.from({ length: count }, () => ({ ...path[0] }));

  const samples: LatLngLiteral[] = [];
  let leg = 0;
  let walked = 0; // distance covered before the start of `leg`
  for (let s = 0; s < count; s++) {
    const target = (s / (count - 1)) * total;
    while (leg < legs.length - 1 && walked + legs[leg] < target) {
      walked += legs[leg];
      leg++;
    }
    const t = legs[leg] === 0 ? 0 : Math.min(1, (target - walked) / legs[leg]);
    const a = path[leg];
    const b = path[leg + 1];
    samples.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
  }
  return samples;
}

/**
 * Elevation sampled at even intervals *along* a path.
 *
 * Distinct from {@link fetchElevations}, which answers for points you name. A
 * profile needs the ground between the waypoints, and asking for the waypoints
 * alone is how the planner ended up reporting ascent as the sum of a handful of
 * corner elevations — a route that climbs a hill and comes back down between two
 * waypoints reads as flat.
 *
 * Failure yields an empty result with `failed` set rather than an exception, on
 * the same principle as its sibling: an unknown elevation must stay unknown
 * rather than becoming zero.
 */
export async function fetchElevationAlongPath(
  path: LatLngLiteral[],
  samples = 100
): Promise<{ values: (number | null)[]; failed: boolean }> {
  // The shape, not every vertex of it — see MAX_PATH_VERTICES.
  const reduced = downsamplePath(path);

  // Two *distinct* points is the minimum that describes a path; one is a
  // location, and a path of repeats has no length to sample along.
  if (reduced.length < 2) return { values: [], failed: false };

  const count = Math.max(2, Math.min(samples, MAX_PATH_SAMPLES));
  const { values, failed } = await fetchElevations(samplePath(reduced, count));
  return failed ? { values: [], failed: true } : { values, failed: false };
}
