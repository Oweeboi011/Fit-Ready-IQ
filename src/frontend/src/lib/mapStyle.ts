import type { LngLatBoundsLike, RasterDEMSourceSpecification } from 'maplibre-gl';

/**
 * The map's base layers, all free and keyless.
 *
 * The map used to be Google's `terrain` map type, billed per load. It is now
 * MapLibre drawing OpenFreeMap's vector tiles (OpenStreetMap data, no key, no
 * quota) with hillshading from the AWS Terrain Tiles open dataset, so a hiker
 * still reads the shape of the ground. Attribution for OpenFreeMap arrives in
 * its TileJSON; the terrain source carries its own.
 *
 * Everything here is pure, so the decisions can be tested without WebGL.
 */

export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const TERRAIN_SOURCE: RasterDEMSourceSpecification = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 15,
  attribution:
    '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain Tiles</a>',
};

/** Where the map opens when there is no saved viewport and no location yet. */
export const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];

/** The style's own shop/restaurant/transit pins, which the dock can hide. */
export function poiLayerIds(layers: { id: string; 'source-layer'?: string }[]): string[] {
  return layers.filter((l) => l['source-layer'] === 'poi').map((l) => l.id);
}

/**
 * The first label layer, so hillshading slides in underneath the text rather
 * than greying it out. Undefined puts it on top, which is legible if uglier.
 */
export function firstSymbolLayerId(layers: { id: string; type: string }[]): string | undefined {
  return layers.find((l) => l.type === 'symbol')?.id;
}

/**
 * The box around a set of `[lng, lat]` points, or null when there is nothing
 * to frame. Non-finite coordinates are skipped: one NaN would otherwise turn
 * the whole box into NaN and the camera into a blank screen.
 */
export function boundsOf(points: Iterable<[number, number]>): LngLatBoundsLike | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of points) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  if (west === Infinity) return null;
  return [
    [west, south],
    [east, north],
  ];
}

const KM_PER_DEGREE_LAT = 111.32;

/** The box around a circle of `radiusKm` — the "50 km around you" first view. */
export function circleBounds(center: [number, number], radiusKm: number): LngLatBoundsLike {
  const [lng, lat] = center;
  const dLat = radiusKm / KM_PER_DEGREE_LAT;
  // Clamp the cosine so a fix near a pole cannot divide by ~0.
  const dLng = radiusKm / (KM_PER_DEGREE_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat + dLat],
  ];
}

/** A GeoJSON line collection, one feature per path with a colour to paint it. */
export function lineCollection(
  lines: { id: string; path: [number, number][]; color: string }[]
): GeoJSON.FeatureCollection<GeoJSON.LineString, { id: string; color: string }> {
  return {
    type: 'FeatureCollection',
    features: lines
      .filter((l) => l.path.length > 1)
      .map((l) => ({
        type: 'Feature',
        properties: { id: l.id, color: l.color },
        geometry: { type: 'LineString', coordinates: l.path },
      })),
  };
}
