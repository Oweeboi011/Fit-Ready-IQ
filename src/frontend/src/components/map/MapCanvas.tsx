import dynamic from 'next/dynamic';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useMemo, useState } from 'react';
import { MapDirections, type DirectionsTarget } from '@/components/MapDirections';
import { RoutePlanner } from '@/components/RoutePlanner';
import type { PlannerRoute, PlannerTravelMode } from '@/lib/usePlannerRoute';
import type { PlannerWaypoint } from '@/lib/gpxBuilder';
import type { Advisory } from '@/lib/advisories';
import type { MapLayer } from '@/lib/mapLayers';
import type { Route as RouteData, Mountain as MountainData, Campsite } from '@/lib/placesTypes';
import type { SavedPlace } from '@/lib/useSavedPlaces';
import type { ActivityPolyline } from '@/lib/activityTypes';
import { boundsOf } from '@/lib/mapStyle';

// MapLibre needs WebGL and `window`, so the map is client-only. Code-split too:
// the renderer is the largest dependency on the page.
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-950">
      <div className="relative h-14 w-14">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-blue-500/20 border-t-blue-500" />
        <div className="absolute inset-0 m-auto h-6 w-6 animate-pulse rounded-full bg-blue-500/20" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-300">Loading map…</p>
        <p className="mt-1 text-xs text-slate-500">Discovering nearby adventures</p>
      </div>
    </div>
  ),
});

interface MapCanvasProps {
  mapInstance: MapLibreMap | null;
  onMapReady: (map: MapLibreMap | null) => void;
  userLocation: { lat: number; lng: number } | null;
  directionsTarget: DirectionsTarget | null;
  onClearDirections: () => void;
  plannerOpen: boolean;
  plannerWaypoints: PlannerWaypoint[];
  onClosePlanner: () => void;
  onRemoveWaypoint: (id: string) => void;
  onMoveWaypoint: (id: string, direction: -1 | 1) => void;
  plannerRoute: PlannerRoute;
  plannerTravelMode: PlannerTravelMode;
  onPlannerTravelModeChange: (mode: PlannerTravelMode) => void;
  /** The signed-in user, whose plans sync to their account. */
  uid: string | null;
  onClearPlanner: () => void;
  onLoadPlan: (waypoints: PlannerWaypoint[]) => void;
  onMapClick: ((coordinates: [number, number], name?: string) => void) | undefined;
  showLegend: boolean;
  showNativeControls: boolean;
  showNativePoi: boolean;
  showWeatherRadar: boolean;
  advisories: Advisory[];
  onAdvisoryUrlOpen: (url: string) => void;
  hiddenLayers: MapLayer[];
  filteredRoutes: RouteData[];
  mountains: MountainData[];
  campsites: Campsite[];
  savedPlaces: SavedPlace[];
  hasPreciseLocation: boolean;
  onRouteClick: (route: RouteData) => void;
  onMountainClick: (mountain: MountainData) => void;
  onCampsiteClick: (campsite: Campsite) => void;
  onFocusUserLocation: (fn: () => void) => void;
  activityPolylines: ActivityPolyline[];
}

export default function MapCanvas({
  mapInstance,
  onMapReady,
  userLocation,
  directionsTarget,
  onClearDirections,
  plannerOpen,
  plannerWaypoints,
  onClosePlanner,
  onRemoveWaypoint,
  onMoveWaypoint,
  plannerRoute,
  plannerTravelMode,
  onPlannerTravelModeChange,
  uid,
  onClearPlanner,
  onLoadPlan,
  onMapClick,
  showLegend,
  showNativeControls,
  showNativePoi,
  showWeatherRadar,
  advisories,
  onAdvisoryUrlOpen,
  hiddenLayers,
  filteredRoutes,
  mountains,
  campsites,
  savedPlaces,
  hasPreciseLocation,
  onRouteClick,
  onMountainClick,
  onCampsiteClick,
  onFocusUserLocation,
  activityPolylines,
}: MapCanvasProps) {
  /**
   * Stable `[lng, lat]` tuple.
   *
   * Built inline, this allocated a new array on every render, so any effect in
   * MapView keyed on it fired constantly — which is how adding a planner
   * waypoint used to snap the camera back to the user's location. MapView now
   * compares the coordinates rather than the array, and this keeps the prop from
   * churning in the first place.
   */
  const lng = userLocation?.lng;
  const lat = userLocation?.lat;
  const userLocationTuple = useMemo<[number, number] | undefined>(
    () => (lng == null || lat == null ? undefined : [lng, lat]),
    [lng, lat]
  );
  const [directionsPath, setDirectionsPath] = useState<[number, number][]>([]);

  return (
    <>
      <MapDirections
        map={mapInstance}
        origin={userLocation}
        target={directionsTarget}
        onClear={onClearDirections}
        onPathChange={setDirectionsPath}
      />

      <RoutePlanner
        isOpen={plannerOpen}
        waypoints={plannerWaypoints}
        onClose={onClosePlanner}
        onRemove={onRemoveWaypoint}
        onMove={onMoveWaypoint}
        route={plannerRoute}
        travelMode={plannerTravelMode}
        onTravelModeChange={onPlannerTravelModeChange}
        uid={uid}
        onClear={onClearPlanner}
        onLoadPlan={(waypoints) => {
          onLoadPlan(waypoints);
          // Frame the loaded plan so it is not off-screen.
          const bounds = boundsOf(waypoints.map((w) => w.coordinates));
          if (mapInstance && bounds) mapInstance.fitBounds(bounds, { padding: 80, maxZoom: 15 });
        }}
      />

      <MapView
        onMapReady={onMapReady}
        directionsPath={directionsPath}
        plannerWaypoints={plannerWaypoints}
        plannerPath={plannerRoute.path}
        plannerRouteStatus={plannerRoute.status}
        onMapClick={onMapClick}
        showLegend={showLegend}
        showNativeControls={showNativeControls}
        showNativePoi={showNativePoi}
        showWeatherRadar={showWeatherRadar}
        advisories={advisories}
        onAdvisoryClick={(id) => {
          const advisory = advisories.find((a) => a.id === id);
          if (advisory?.url) onAdvisoryUrlOpen(advisory.url);
        }}
        hiddenLayers={hiddenLayers}
        routes={filteredRoutes}
        mountains={mountains}
        campsites={campsites}
        savedPlaces={savedPlaces}
        userLocation={userLocationTuple}
        hasPreciseLocation={hasPreciseLocation}
        onRouteClick={onRouteClick}
        onMountainClick={onMountainClick}
        onCampsiteClick={onCampsiteClick}
        onFocusUserLocation={onFocusUserLocation}
        activityPolylines={activityPolylines}
      />
    </>
  );
}
