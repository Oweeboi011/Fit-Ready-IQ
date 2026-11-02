'use client';

import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useRef } from 'react';

import { layerForActivityType, type MapLayer } from '@/lib/mapLayers';
import { boundsOf, circleBounds } from '@/lib/mapStyle';
import type { Campsite, Mountain, Route } from '@/lib/placesTypes';

/**
 * Where the camera goes, and when it leaves the user alone.
 *
 * Auto-framing is a one-time courtesy: the first view fits 50 km around the
 * user, then widens once to take in whatever discovery found. After that the
 * viewport is theirs. A restored viewport counts as already framed, so a reload
 * puts them back where they were instead of re-framing a map they had already
 * navigated.
 */

/**
 * Floor for the auto-fit zoom. Roughly a regional view; anything below this
 * means the bounds swallowed a marker that has no business being in them.
 */
const MIN_AUTOFIT_ZOOM = 8;
const FIRST_VIEW_RADIUS_KM = 50;
const FIT_PADDING = 50;

const VIEWPORT_KEY = 'fri_map_viewport';
/** Viewports older than this are stale enough that re-framing is kinder. */
const VIEWPORT_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredViewport {
  lat: number;
  lng: number;
  zoom: number;
}

function readStoredViewport(): StoredViewport | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as StoredViewport & { ts?: number };
    if (Date.now() - (saved.ts ?? 0) > VIEWPORT_TTL_MS) return null;
    if (typeof saved.lat !== 'number' || typeof saved.lng !== 'number') return null;
    if (typeof saved.zoom !== 'number') return null;
    return { lat: saved.lat, lng: saved.lng, zoom: saved.zoom };
  } catch {
    return null;
  }
}

function writeStoredViewport(v: StoredViewport): void {
  try {
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify({ ...v, ts: Date.now() }));
  } catch {
    /* private mode — the map just won't remember */
  }
}

/**
 * Only visible layers get a vote on the framing — otherwise the map zooms out
 * to fit markers the user has deliberately switched off.
 */
function framingPoints(
  userLocation: [number, number] | undefined,
  routes: Route[],
  mountains: Mountain[],
  campsites: Campsite[],
  hiddenLayers: MapLayer[]
): [number, number][] {
  const visible = (layer: MapLayer) => !hiddenLayers.includes(layer);
  const points: [number, number][] = userLocation ? [userLocation] : [];
  for (const route of routes) {
    if (!visible(layerForActivityType(route.activity_type))) continue;
    points.push(route.coordinates, ...(route.polyline ?? []));
  }
  if (visible('mountains')) points.push(...mountains.map((m) => m.coordinates));
  if (visible('campsites')) points.push(...campsites.map((c) => c.coordinates));
  return points;
}

interface CameraInputs {
  map: MapLibreMap | null;
  userLocation: [number, number] | undefined;
  routes: Route[];
  mountains: Mountain[];
  campsites: Campsite[];
  hiddenLayers: MapLayer[];
  onFocusUserLocation?: (fn: () => void) => void;
}

export function useMapCamera({
  map,
  userLocation,
  routes,
  mountains,
  campsites,
  hiddenLayers,
  onFocusUserLocation,
}: CameraInputs) {
  const hasAutoFittedRef = useRef(false);
  const lastLocationRef = useRef<string | null>(null);

  /** Call once the map has loaded, before anything else moves the camera. */
  const restoreViewport = useCallback((instance: MapLibreMap) => {
    const saved = readStoredViewport();
    if (!saved) return;
    instance.jumpTo({ center: [saved.lng, saved.lat], zoom: saved.zoom });
    hasAutoFittedRef.current = true;
  }, []);

  const rememberViewport = useCallback((instance: MapLibreMap) => {
    const center = instance.getCenter();
    writeStoredViewport({ lat: center.lat, lng: center.lng, zoom: instance.getZoom() });
  }, []);

  useEffect(() => {
    if (!onFocusUserLocation) return;
    onFocusUserLocation(() => {
      if (!map || !userLocation) return;
      map.flyTo({ center: userLocation, zoom: 14 });
    });
  }, [map, userLocation, onFocusUserLocation]);

  // Follow the location the page resolved, keyed on the coordinate *values*.
  // Keyed on the array, this re-ran on every parent render — which is how
  // dropping a planner waypoint used to snap the camera back to the user.
  const userLng = userLocation?.[0];
  const userLat = userLocation?.[1];
  useEffect(() => {
    if (!map || userLng == null || userLat == null) return;
    const key = `${userLng},${userLat}`;
    const previous = lastLocationRef.current;
    if (previous === key) return;
    lastLocationRef.current = key;
    if (!hasAutoFittedRef.current) {
      map.fitBounds(circleBounds([userLng, userLat], FIRST_VIEW_RADIUS_KM), { duration: 0 });
    } else if (previous !== null) {
      // A genuine move after the first view, such as a fallback replaced by a
      // real fix. The first sighting never pans away from a restored viewport.
      map.easeTo({ center: [userLng, userLat] });
    }
  }, [map, userLng, userLat]);

  // After discovery lands, widen once to take in everything visible. Guarded
  // to run once: `routes` is the *filtered* list, so without the guard every
  // filter change re-framed the map and threw away wherever the user had panned.
  useEffect(() => {
    if (!map || hasAutoFittedRef.current) return;
    if (routes.length === 0 && mountains.length === 0 && campsites.length === 0) return;
    hasAutoFittedRef.current = true;

    const bounds = boundsOf(
      framingPoints(userLocation, routes, mountains, campsites, hiddenLayers)
    );
    if (!bounds) return;
    // Belt and braces: even with the radius filter upstream, a single bad
    // coordinate must not zoom the map out to the whole planet.
    const camera = map.cameraForBounds(bounds, { padding: FIT_PADDING });
    if (userLocation && camera?.zoom !== undefined && camera.zoom < MIN_AUTOFIT_ZOOM) {
      map.jumpTo({ center: userLocation, zoom: MIN_AUTOFIT_ZOOM });
      return;
    }
    map.fitBounds(bounds, { padding: FIT_PADDING });
    // Deliberately not keyed on `hiddenLayers`: toggling a layer should hide
    // pins, not re-frame the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refitting on a layer toggle fights the user's pan/zoom
  }, [map, routes, mountains, campsites, userLocation]);

  return { restoreViewport, rememberViewport };
}
