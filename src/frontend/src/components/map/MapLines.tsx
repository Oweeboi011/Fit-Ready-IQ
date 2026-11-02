'use client';

import { Layer, Source } from '@vis.gl/react-maplibre';
import { useEffect, useMemo, useState } from 'react';

import { difficultyColor } from '@/components/map/MapMarkers';
import type { ActivityPolyline } from '@/lib/activityTypes';
import { TERRAIN_SOURCE, lineCollection } from '@/lib/mapStyle';
import type { Route } from '@/lib/placesTypes';
import { plannerLine } from '@/lib/plannerLine';
import { fetchLatestRadarFrame, radarTileTemplate, type RadarFrame } from '@/lib/radarLayer';

export interface MapLine {
  id: string;
  /** `[lng, lat]` pairs. */
  path: [number, number][];
  color: string;
}

interface LineLayerProps {
  /** Source id; also prefixes the layer id. Unique per group on the map. */
  id: string;
  lines: MapLine[];
  width: number;
  opacity: number;
  /**
   * A dashed line is a guide, not a route. The planner draws un-snapped
   * waypoints this way so a provisional line is never mistaken for one that
   * follows real paths.
   */
  dashed?: boolean;
}

/**
 * One group of lines — route polylines, activity tracks, the planner, the
 * directions — as a single GeoJSON source. Groups render in the order they
 * appear in the tree, so later groups draw on top.
 */
function LineLayer({ id, lines, width, opacity, dashed = false }: LineLayerProps) {
  const data = useMemo(() => lineCollection(lines), [lines]);
  return (
    <Source id={id} type="geojson" data={data}>
      <Layer
        id={`${id}-line`}
        type="line"
        layout={{ 'line-join': 'round', 'line-cap': dashed ? 'butt' : 'round' }}
        paint={{
          'line-color': ['get', 'color'],
          'line-width': width,
          'line-opacity': opacity,
          ...(dashed ? { 'line-dasharray': [2, 2] } : {}),
        }}
      />
    </Source>
  );
}

const SOURCE_POLYLINE_COLOR: Record<string, string> = {
  strava: '#fc4c02',
  coros: '#2563eb',
  garmin: '#0ea5e9',
  komoot: '#16a34a',
};

const PLANNER_COLOR = '#f97316';
const NO_LINES: MapLine[] = [];

interface MapLineLayersProps {
  /** Already filtered to the visible layers. */
  routes: Route[];
  activityPolylines: ActivityPolyline[];
  directionsPath?: [number, number][];
  plannerWaypoints: { coordinates: [number, number] }[];
  plannerPath?: [number, number][];
  plannerRouteStatus: 'idle' | 'routing' | 'ready' | 'error';
}

/**
 * Every line on the map, bottom to top: trail polylines, activity tracks,
 * directions, then the planner — the line being built is never lost under
 * anything else.
 */
export function MapLineLayers({
  routes,
  activityPolylines,
  directionsPath,
  plannerWaypoints,
  plannerPath,
  plannerRouteStatus,
}: MapLineLayersProps) {
  const routeLines = useMemo<MapLine[]>(
    () =>
      routes
        .filter((r) => r.polyline && r.polyline.length > 1)
        .map((r) => ({ id: r.id, path: r.polyline!, color: difficultyColor(r.difficulty) })),
    [routes]
  );
  const activityLines = useMemo<MapLine[]>(
    () =>
      activityPolylines.map((a) => ({
        id: a.id,
        path: a.coords,
        color: SOURCE_POLYLINE_COLOR[a.source] ?? '#8b5cf6',
      })),
    [activityPolylines]
  );
  const directionsLines = useMemo<MapLine[]>(
    () =>
      directionsPath?.length
        ? [{ id: 'directions', path: directionsPath, color: '#3b82f6' }]
        : NO_LINES,
    [directionsPath]
  );
  // One line, and it says which kind it is: solid for a measured route, dashed
  // for waypoints joined as dropped, nothing mid-route. See `plannerLine`.
  const [plannerRoute, plannerGuide] = useMemo<[MapLine[], MapLine[]]>(() => {
    const planner = plannerLine(plannerWaypoints, plannerPath, plannerRouteStatus);
    const line = [{ id: 'planner', path: planner.path, color: PLANNER_COLOR }];
    if (planner.kind === 'route') return [line, NO_LINES];
    if (planner.kind === 'guide') return [NO_LINES, line];
    return [NO_LINES, NO_LINES];
  }, [plannerWaypoints, plannerPath, plannerRouteStatus]);

  return (
    <>
      <LineLayer id="routes" lines={routeLines} width={4} opacity={0.8} />
      <LineLayer id="activities" lines={activityLines} width={3} opacity={0.75} />
      <LineLayer id="directions" lines={directionsLines} width={5} opacity={0.9} />
      <LineLayer id="planner-route" lines={plannerRoute} width={4} opacity={0.95} />
      <LineLayer id="planner-guide" lines={plannerGuide} width={3} opacity={0.75} dashed />
    </>
  );
}

/**
 * RainViewer's latest frame while the radar is on. Re-fetched each time it is
 * switched on, since a new frame lands roughly every 10 minutes and the map can
 * stay open far longer than that.
 */
function useRadarFrame(show: boolean): RadarFrame | null {
  const [frame, setFrame] = useState<RadarFrame | null>(null);
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    fetchLatestRadarFrame().then((latest) => {
      if (!cancelled) setFrame(latest);
    });
    return () => {
      cancelled = true;
    };
  }, [show]);
  return show ? frame : null;
}

/**
 * Hillshading and the precipitation radar, both slid underneath the base
 * map's labels so place names stay readable. Rendered only once the style has
 * loaded, so `labelsBelow` is known when the layers are first added.
 */
export function BaseOverlays({
  labelsBelow,
  showWeatherRadar,
}: {
  labelsBelow: string | undefined;
  showWeatherRadar: boolean;
}) {
  const radarFrame = useRadarFrame(showWeatherRadar);
  return (
    <>
      <Source id="terrain" {...TERRAIN_SOURCE}>
        <Layer
          id="hillshade"
          type="hillshade"
          beforeId={labelsBelow}
          paint={{ 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#473b24' }}
        />
      </Source>
      {radarFrame && (
        <Source
          key={radarFrame.path}
          id="radar"
          type="raster"
          tiles={[radarTileTemplate(radarFrame)]}
          tileSize={256}
        >
          <Layer
            id="radar"
            type="raster"
            beforeId={labelsBelow}
            paint={{ 'raster-opacity': 0.6 }}
          />
        </Source>
      )}
    </>
  );
}
