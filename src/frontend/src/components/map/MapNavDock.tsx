import {
  NavDock,
  type DockAlert,
  type DockWeather,
  type TerrainPulse,
  type ContentTab,
} from '@/components/NavDock';
import type { Advisory } from '@/lib/advisories';
import type { MapLayer } from '@/lib/mapLayers';

interface MapNavDockProps {
  areaLabel: string | null;
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
}

export default function MapNavDock({
  areaLabel,
  savedCount,
  isSignedIn,
  isAdmin,
  dockAlerts,
  terrainPulse,
  dockWeather,
  onRequestWeather,
  onOpenPlanner,
  onOpenFitness,
  onOpenConnectDevices,
  onOpenAdmin,
  onOpenRoadmap,
  showLegend,
  onToggleLegend,
  showNativeControls,
  onToggleNativeControls,
  showNativePoi,
  onToggleNativePoi,
  activeTab,
  tabCounts,
  onSelectTab,
  onSelectTabAuthRequired,
  hiddenLayers,
  advisories,
  advisorySource,
  layerCounts,
  onToggleLayer,
  showWeatherRadar,
  onToggleWeatherRadar,
  onLocate,
  mapInstance,
}: MapNavDockProps) {
  return (
    <NavDock
      areaLabel={areaLabel}
      savedCount={savedCount}
      isSignedIn={isSignedIn}
      isAdmin={isAdmin}
      alerts={dockAlerts}
      pulse={terrainPulse}
      weather={dockWeather}
      onRequestWeather={onRequestWeather}
      onOpenPlanner={onOpenPlanner}
      onOpenFitness={onOpenFitness}
      onOpenConnectDevices={onOpenConnectDevices}
      onOpenAdmin={onOpenAdmin}
      onOpenRoadmap={onOpenRoadmap}
      legendVisible={showLegend}
      onToggleLegend={onToggleLegend}
      nativeControlsVisible={showNativeControls}
      onToggleNativeControls={onToggleNativeControls}
      nativePoiVisible={showNativePoi}
      onToggleNativePoi={onToggleNativePoi}
      activeTab={activeTab}
      tabCounts={tabCounts}
      onSelectTab={(tab) => {
        if (tab === 'saved' && !isSignedIn) {
          onSelectTabAuthRequired();
          return;
        }
        onSelectTab(tab);
      }}
      hiddenLayers={hiddenLayers}
      advisories={advisories}
      advisorySource={advisorySource}
      onSelectAdvisory={(a) => {
        if (!a.coordinates) return;
        mapInstance?.panTo({ lat: a.coordinates[1], lng: a.coordinates[0] });
        mapInstance?.setZoom(12);
      }}
      layerCounts={layerCounts}
      onToggleLayer={onToggleLayer}
      weatherRadarVisible={showWeatherRadar}
      onToggleWeatherRadar={onToggleWeatherRadar}
      onLocate={onLocate}
    />
  );
}
