import MapLoadingOverlay from '@/components/MapLoadingOverlay';
import MapNotices from '@/components/map/MapNotices';
import MapNavDock from '@/components/map/MapNavDock';
import MapCanvas from '@/components/map/MapCanvas';
import type { ContentTab, DockAlert, DockWeather, TerrainPulse } from '@/components/NavDock';
import type { DirectionsTarget } from '@/components/MapDirections';
import type { PlannerRoute, PlannerTravelMode } from '@/lib/usePlannerRoute';
import type { PlannerWaypoint } from '@/lib/gpxBuilder';
import type { Advisory } from '@/lib/advisories';
import type { MapLayer } from '@/lib/mapLayers';
import type { Route as RouteData, Mountain as MountainData, Campsite } from '@/lib/placesTypes';
import type { SavedPlace } from '@/lib/useSavedPlaces';
import type { ActivityPolyline } from '@/lib/activityTypes';

interface MapAreaProps {
  isLoading: boolean;
  isLocating: boolean;
  userLocation: { lat: number; lng: number; address?: string } | null;
  showFirstRunHint: boolean;
  onDismissFirstRunHint: () => void;
  saveError: string | null;
  authError: string | null;
  onDismissSaveError: () => void;
  onDismissAuthError: () => void;
  saveToast: { message: string; undo: () => void } | null;
  savedCount: number;
  isSignedIn: boolean;
  isAdmin: boolean;
  dockAlerts: DockAlert[];
  terrainPulse: TerrainPulse;
  dockWeather: DockWeather;
  onRequestWeather: () => void;
  onOpenPlanner: () => void;
  onOpenFitness: () => void;
  onOpenConnectDevices: () => void;
  onOpenAdmin: () => void;
  onOpenRoadmap: () => void;
  showLegend: boolean;
  onToggleLegend: () => void;
  showNativeControls: boolean;
  onToggleNativeControls: () => void;
  showNativePoi: boolean;
  onToggleNativePoi: () => void;
  activeTab: ContentTab | string;
  tabCounts: Record<ContentTab, number>;
  onSelectTab: (tab: ContentTab) => void;
  onSelectTabAuthRequired: () => void;
  hiddenLayers: MapLayer[];
  advisories: Advisory[];
  advisorySource: { configured: boolean; status: 'idle' | 'loading' | 'error' };
  layerCounts: Record<MapLayer, number>;
  onToggleLayer: (layer: MapLayer) => void;
  showWeatherRadar: boolean;
  onToggleWeatherRadar: () => void;
  onLocate: () => void;
  mapInstance: google.maps.Map | null;
  onMapReady: (map: google.maps.Map | null) => void;
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
  onClearPlanner: () => void;
  onLoadPlan: (waypoints: PlannerWaypoint[]) => void;
  onMapClick: ((coordinates: [number, number], name?: string) => void) | undefined;
  hasPreciseLocation: boolean;
  isLoaded: boolean;
  loadError: Error | undefined;
  filteredRoutes: RouteData[];
  mountains: MountainData[];
  campsites: Campsite[];
  savedPlaces: SavedPlace[];
  onRouteClick: (route: RouteData) => void;
  onMountainClick: (mountain: MountainData) => void;
  onCampsiteClick: (campsite: Campsite) => void;
  onFocusUserLocation: (fn: () => void) => void;
  activityPolylines: ActivityPolyline[];
  onAdvisoryUrlOpen: (url: string) => void;
}

export default function MapArea(props: MapAreaProps) {
  const { isLoading, isLocating, userLocation } = props;

  return (
    <div className="relative flex-1">
      <MapLoadingOverlay
        isLoading={isLoading || isLocating}
        message={isLocating ? 'Locating you' : 'Finding routes near you'}
        detail={!isLocating ? userLocation?.address : undefined}
      />

      <MapNotices
        showFirstRunHint={props.showFirstRunHint}
        isLoading={isLoading}
        onDismissFirstRunHint={props.onDismissFirstRunHint}
        saveError={props.saveError}
        authError={props.authError}
        onDismissSaveError={props.onDismissSaveError}
        onDismissAuthError={props.onDismissAuthError}
        saveToast={props.saveToast}
      />

      <MapNavDock
        areaLabel={userLocation?.address ?? null}
        savedCount={props.savedCount}
        isSignedIn={props.isSignedIn}
        isAdmin={props.isAdmin}
        dockAlerts={props.dockAlerts}
        terrainPulse={props.terrainPulse}
        dockWeather={props.dockWeather}
        onRequestWeather={props.onRequestWeather}
        onOpenPlanner={props.onOpenPlanner}
        onOpenFitness={props.onOpenFitness}
        onOpenConnectDevices={props.onOpenConnectDevices}
        onOpenAdmin={props.onOpenAdmin}
        onOpenRoadmap={props.onOpenRoadmap}
        showLegend={props.showLegend}
        onToggleLegend={props.onToggleLegend}
        showNativeControls={props.showNativeControls}
        onToggleNativeControls={props.onToggleNativeControls}
        showNativePoi={props.showNativePoi}
        onToggleNativePoi={props.onToggleNativePoi}
        activeTab={props.activeTab}
        tabCounts={props.tabCounts}
        onSelectTab={props.onSelectTab}
        onSelectTabAuthRequired={props.onSelectTabAuthRequired}
        hiddenLayers={props.hiddenLayers}
        advisories={props.advisories}
        advisorySource={props.advisorySource}
        layerCounts={props.layerCounts}
        onToggleLayer={props.onToggleLayer}
        showWeatherRadar={props.showWeatherRadar}
        onToggleWeatherRadar={props.onToggleWeatherRadar}
        onLocate={props.onLocate}
        mapInstance={props.mapInstance}
      />

      <MapCanvas
        mapInstance={props.mapInstance}
        onMapReady={props.onMapReady}
        userLocation={userLocation}
        directionsTarget={props.directionsTarget}
        onClearDirections={props.onClearDirections}
        plannerOpen={props.plannerOpen}
        plannerWaypoints={props.plannerWaypoints}
        onClosePlanner={props.onClosePlanner}
        onRemoveWaypoint={props.onRemoveWaypoint}
        onMoveWaypoint={props.onMoveWaypoint}
        plannerRoute={props.plannerRoute}
        plannerTravelMode={props.plannerTravelMode}
        onPlannerTravelModeChange={props.onPlannerTravelModeChange}
        onClearPlanner={props.onClearPlanner}
        onLoadPlan={props.onLoadPlan}
        onMapClick={props.onMapClick}
        showLegend={props.showLegend}
        showNativeControls={props.showNativeControls}
        showNativePoi={props.showNativePoi}
        showWeatherRadar={props.showWeatherRadar}
        advisories={props.advisories}
        onAdvisoryUrlOpen={props.onAdvisoryUrlOpen}
        hiddenLayers={props.hiddenLayers}
        filteredRoutes={props.filteredRoutes}
        mountains={props.mountains}
        campsites={props.campsites}
        savedPlaces={props.savedPlaces}
        hasPreciseLocation={props.hasPreciseLocation}
        isLoaded={props.isLoaded}
        loadError={props.loadError}
        onRouteClick={props.onRouteClick}
        onMountainClick={props.onMountainClick}
        onCampsiteClick={props.onCampsiteClick}
        onFocusUserLocation={props.onFocusUserLocation}
        activityPolylines={props.activityPolylines}
      />
    </div>
  );
}
