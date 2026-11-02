'use client';

import 'maplibre-gl/dist/maplibre-gl.css';

import MapGL, {
  AttributionControl,
  FullscreenControl,
  NavigationControl,
  type ErrorEvent as MapErrorEvent,
} from '@vis.gl/react-maplibre';
import { setWorkerUrl, type Map as MapLibreMap } from 'maplibre-gl';
import { Map as MapIcon } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { BaseOverlays, MapLineLayers } from '@/components/map/MapLines';
import MapLegend from '@/components/map/MapLegend';
import {
  AdvisoryMarker,
  PlaceMarkers,
  UserLocationMarker,
  WaypointMarker,
} from '@/components/map/MapMarkers';
import { useMapCamera } from '@/components/map/useMapCamera';
import { type ActivityPolyline } from '@/lib/activityTypes';
import { layerForActivityType, type MapLayer } from '@/lib/mapLayers';
import { BASE_STYLE_URL, DEFAULT_CENTER, firstSymbolLayerId, poiLayerIds } from '@/lib/mapStyle';
import type { Campsite, Mountain, Route } from '@/lib/placesTypes';
import { buttonPrimary, buttonSize } from '@/lib/ui';
import { type SavedPlace } from '@/lib/useSavedPlaces';

interface MapViewProps {
  routes: Route[];
  mountains: Mountain[];
  campsites: Campsite[];
  savedPlaces: SavedPlace[];
  /** Layers the user has switched off, owned by the page so the dock can drive it. */
  hiddenLayers: MapLayer[];
  /** The map's own zoom / compass / fullscreen controls. */
  showNativeControls: boolean;
  /** The base map's own POI pins — restaurants, shops, transit. */
  showNativePoi: boolean;
  /** Closures, hazards and rescue notices that the feed has pinned to a place. */
  advisories: {
    id: string;
    kind: string;
    title: string;
    coordinates?: [number, number];
  }[];
  onAdvisoryClick?: (id: string) => void;
  activityPolylines: ActivityPolyline[];
  userLocation?: [number, number];
  /**
   * Whether `userLocation` is a real device fix. When false the map still
   * centres there, but must not draw the "Your Location" marker — pointing at
   * a fallback and calling it the user is a claim we cannot make.
   */
  hasPreciseLocation: boolean;
  /** The dock owns legend visibility so both can't claim the same corner. */
  showLegend: boolean;
  /** Precipitation radar tiles (RainViewer), toggled from the dock's layers panel. */
  showWeatherRadar: boolean;
  onRouteClick?: (route: Route) => void;
  onMountainClick?: (mountain: Mountain) => void;
  onCampsiteClick?: (campsite: Campsite) => void;
  onFocusUserLocation?: (fn: () => void) => void;
  /** Hands the map instance up so search, the dock and directions can move it. */
  onMapReady: (map: MapLibreMap | null) => void;
  /** The routed directions line, `[lng, lat]`; empty when there is none. */
  directionsPath: [number, number][];
  /** Waypoints being planned, drawn as a numbered line over the terrain. */
  plannerWaypoints: { id: string; coordinates: [number, number]; name: string }[];
  /** The routed line through those waypoints; falls back to joining them. */
  plannerPath?: [number, number][];
  /**
   * Whether {@link plannerPath} is measured geometry or nothing yet. The map
   * draws a solid line only for a real route — see `plannerLine`.
   */
  plannerRouteStatus: 'idle' | 'routing' | 'ready' | 'error';
  /**
   * Set while the planner is open. A click on empty map drops a plain
   * waypoint; a click on a place adds that place by name.
   */
  onMapClick?: (coordinates: [number, number], name?: string) => void;
}

// MapLibre looks for its worker beside its own module, which the bundler has
// moved; scripts/copy-maplibre-worker.ts puts a matching copy in public/.
setWorkerUrl('/maplibre-gl-worker.mjs');

/** Before the camera frames the user's area; a town-sized view. */
const INITIAL_ZOOM = 12;

/** Stable, so hiding the layer does not hand the line source a new array per render. */
const NO_ACTIVITIES: ActivityPolyline[] = [];

class MapRenderErrorBoundary extends React.Component<
  { onError: (error: Error) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { onError: (error: Error) => void; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

/**
 * The map could not start: no WebGL, or the base style would not load.
 *
 * The detail names the failure, which a developer needs and a visitor should
 * never see, so it is gated on the host rather than NODE_ENV — a production
 * build served from a preview URL still shows visitor copy.
 */
function MapUnavailable({ detail }: { detail: string }) {
  const showDiagnostics =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-slate-950">
      <div className="max-w-xl px-6 text-center">
        <MapIcon aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-slate-600" />
        <p className="text-base font-semibold text-white">We couldn&apos;t load the map</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
          Reloading usually fixes it. Your saved places and activities are safe.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${buttonPrimary} ${buttonSize.md} mt-5`}
        >
          Reload the map
        </button>
        {showDiagnostics && (
          <p className="mt-3 text-xs text-slate-500">
            Error detail: <span className="font-mono break-all">{detail}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** Hides or shows the base style's own POI layers on an already-loaded map. */
function usePoiVisibility(map: MapLibreMap | null, show: boolean) {
  useEffect(() => {
    if (!map) return;
    for (const id of poiLayerIds(map.getStyle().layers)) {
      map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
    }
  }, [map, show]);
}

export default function MapView({
  routes,
  mountains,
  campsites,
  savedPlaces,
  hiddenLayers,
  showNativeControls,
  showNativePoi,
  advisories,
  onAdvisoryClick,
  activityPolylines,
  userLocation,
  hasPreciseLocation,
  showLegend,
  showWeatherRadar,
  onRouteClick,
  onMountainClick,
  onCampsiteClick,
  onFocusUserLocation,
  onMapReady,
  directionsPath,
  plannerWaypoints,
  plannerPath,
  plannerRouteStatus,
  onMapClick,
}: MapViewProps) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [labelsBelow, setLabelsBelow] = useState<string | undefined>(undefined);
  const [mapError, setMapError] = useState<string | null>(null);
  usePoiVisibility(map, showNativePoi);

  const isLayerVisible = (layer: MapLayer) => !hiddenLayers.includes(layer);
  const visibleRoutes = useMemo(
    () => routes.filter((r) => !hiddenLayers.includes(layerForActivityType(r.activity_type))),
    [routes, hiddenLayers]
  );

  const { restoreViewport, rememberViewport } = useMapCamera({
    map,
    userLocation,
    routes,
    mountains,
    campsites,
    hiddenLayers,
    onFocusUserLocation,
  });

  useEffect(() => () => onMapReady(null), [onMapReady]);

  if (mapError) return <MapUnavailable detail={mapError} />;

  const start = userLocation ?? DEFAULT_CENTER;

  return (
    <div className="relative h-full w-full">
      <MapRenderErrorBoundary onError={(error) => setMapError(error.message)}>
        <MapGL
          initialViewState={{ longitude: start[0], latitude: start[1], zoom: INITIAL_ZOOM }}
          mapStyle={BASE_STYLE_URL}
          attributionControl={false}
          style={{ width: '100%', height: '100%' }}
          cursor={onMapClick ? 'crosshair' : undefined}
          onLoad={(e) => {
            const instance = e.target;
            restoreViewport(instance);
            setLabelsBelow(firstSymbolLayerId(instance.getStyle().layers));
            setMap(instance);
            onMapReady(instance);
          }}
          onMoveEnd={(e) => rememberViewport(e.target)}
          onClick={(e) => onMapClick?.([e.lngLat.lng, e.lngLat.lat])}
          onError={(e: MapErrorEvent) => {
            // After load, a failed tile is routine and MapLibre retries it.
            // Before load, it is the style itself, and the map stays blank.
            if (!map) setMapError(e.error?.message ?? 'The base map failed to load.');
          }}
        >
          {/* Not behind the controls toggle: the credit is a licence condition. */}
          <AttributionControl position="bottom-left" compact />
          {showNativeControls && <NavigationControl position="top-right" />}
          {showNativeControls && <FullscreenControl position="top-right" />}

          {map && <BaseOverlays labelsBelow={labelsBelow} showWeatherRadar={showWeatherRadar} />}
          <MapLineLayers
            routes={visibleRoutes}
            activityPolylines={isLayerVisible('activities') ? activityPolylines : NO_ACTIVITIES}
            directionsPath={directionsPath}
            plannerWaypoints={plannerWaypoints}
            plannerPath={plannerPath}
            plannerRouteStatus={plannerRouteStatus}
          />

          {userLocation && hasPreciseLocation && <UserLocationMarker coordinates={userLocation} />}

          {/* Drawn in the loudest colour available: a closure or a rescue
              outranks discovery. */}
          {isLayerVisible('advisories') &&
            advisories.map((a) =>
              a.coordinates ? (
                <AdvisoryMarker
                  key={`advisory-${a.id}`}
                  coordinates={a.coordinates}
                  kind={a.kind}
                  title={a.title}
                  onActivate={() => onAdvisoryClick?.(a.id)}
                />
              ) : null
            )}

          {plannerWaypoints.map((w, index) => (
            <WaypointMarker key={w.id} coordinates={w.coordinates} index={index} name={w.name} />
          ))}

          <PlaceMarkers
            routes={visibleRoutes}
            mountains={isLayerVisible('mountains') ? mountains : []}
            campsites={isLayerVisible('campsites') ? campsites : []}
            savedPlaces={isLayerVisible('saved') ? savedPlaces : []}
            onPlanClick={onMapClick}
            onRouteClick={onRouteClick}
            onMountainClick={onMountainClick}
            onCampsiteClick={onCampsiteClick}
          />
        </MapGL>
      </MapRenderErrorBoundary>

      {showLegend && (
        <MapLegend
          hasMountains={mountains.length > 0}
          hasCampsites={campsites.length > 0}
          hasSaved={savedPlaces.length > 0}
          hasPreciseLocation={hasPreciseLocation}
        />
      )}
    </div>
  );
}
