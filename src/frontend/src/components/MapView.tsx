'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { GoogleMap, Polyline, OverlayView } from '@react-google-maps/api';
import {
  Mountain as MountainIcon,
  Tent,
  Footprints,
  Bike,
  Map as MapIcon,
  MapPin,
  Bookmark,
  Eye,
  EyeOff,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { type ActivityPolyline } from '@/lib/activityTypes';
import { type SavedPlace } from '@/lib/useSavedPlaces';
import type { Difficulty } from '@/lib/routeDifficulty';
import { layerForActivityType, type MapLayer } from '@/lib/mapLayers';
import { buttonPrimary, buttonSize } from '@/lib/ui';
import { fetchLatestRadarFrame, radarTileUrl } from '@/lib/radarLayer';

interface Route {
  id: string;
  name: string;
  coordinates: [number, number];
  distance_km: number;
  elevation_gain_m: number | null;
  difficulty: Difficulty;
  activity_type: string;
  polyline?: [number, number][];
}

interface Mountain {
  id: string;
  name: string;
  coordinates: [number, number];
  elevation_m: number | null;
  prominence_m?: number;
  trail_class?: string;
  mountain_type: string; // peak, summit, mountain
}

interface Campsite {
  id: string;
  name: string;
  coordinates: [number, number];
  type: string;
  rating?: number;
  amenities?: string[];
}

interface MapViewProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  routes?: Route[];
  mountains?: Mountain[];
  campsites?: Campsite[];
  savedPlaces?: SavedPlace[];
  /** Layers the user has switched off, owned by the page so the dock can drive it. */
  hiddenLayers?: MapLayer[];
  /** Google's own zoom / map-type / fullscreen controls. */
  showNativeControls?: boolean;
  /** Google's own POI pins — restaurants, shops, transit. */
  showNativePoi?: boolean;
  /** Closures, hazards and rescue notices that the feed has pinned to a place. */
  advisories?: {
    id: string;
    kind: string;
    title: string;
    coordinates?: [number, number];
  }[];
  onAdvisoryClick?: (id: string) => void;
  activityPolylines?: ActivityPolyline[];
  userLocation?: [number, number];
  /**
   * Whether `userLocation` is a real device fix. When false the map still
   * centres there, but must not draw the "Your Location" marker — pointing at
   * a fallback and calling it the user is a claim we cannot make.
   */
  hasPreciseLocation?: boolean;
  /** The dock owns legend visibility so both can't claim the same corner. */
  showLegend?: boolean;
  /** Precipitation radar tiles (RainViewer), toggled from the dock's layers panel. */
  showWeatherRadar?: boolean;
  isLoaded: boolean;
  loadError: Error | undefined;
  onRouteClick?: (route: Route) => void;
  onMountainClick?: (mountain: Mountain) => void;
  onCampsiteClick?: (campsite: Campsite) => void;
  onFocusUserLocation?: (fn: () => void) => void;
  /** Hands the map instance up so directions can be drawn on this same map. */
  onMapReady?: (map: google.maps.Map | null) => void;
  /** Waypoints being planned, drawn as a numbered line over the terrain. */
  plannerWaypoints?: { id: string; coordinates: [number, number]; name: string }[];
  /** The routed line through those waypoints; falls back to joining them. */
  plannerPath?: [number, number][];
  /**
   * Whether {@link plannerPath} is measured geometry or nothing yet. The map
   * draws a solid line only for a real route — see the planner polyline below.
   */
  plannerRouteStatus?: 'idle' | 'routing' | 'ready' | 'error';
  /**
   * Set while the planner is open. A click on empty map drops a plain
   * waypoint; a click on a place adds that place by name, which is far more
   * useful than an unnamed dot and is what makes the exported GPX readable.
   */
  onMapClick?: (coordinates: [number, number], name?: string) => void;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

/**
 * Floor for the auto-fit zoom. Roughly a regional view; anything below this
 * means the bounds swallowed a marker that has no business being in them.
 */
const MIN_AUTOFIT_ZOOM = 8;

/** Advisory kinds that get the red pin rather than amber. */
const URGENT_ADVISORY_KINDS = new Set(['closure', 'emergency', 'rescue']);

const VIEWPORT_KEY = 'fri_map_viewport';

/**
 * Marker/line groups the user can switch off. A crowded map is the main reason
 * people stop reading it, and activity tracks in particular pile up until the
 * routes underneath are unreadable — so every group is independently hideable.
 */
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

const SOURCE_POLYLINE_COLOR: Record<string, string> = {
  strava: '#fc4c02',
  coros: '#2563eb',
  garmin: '#0ea5e9',
  komoot: '#16a34a',
};

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

export default function MapView({
  initialCenter = [-122.4194, 37.7749],
  initialZoom = 12,
  routes = [],
  mountains = [],
  campsites = [],
  savedPlaces = [],
  hiddenLayers = [],
  showNativeControls = true,
  showNativePoi = true,
  advisories = [],
  onAdvisoryClick,
  activityPolylines = [],
  userLocation: userLocationProp,
  hasPreciseLocation = false,
  showLegend = true,
  showWeatherRadar = false,
  isLoaded,
  loadError,
  onRouteClick,
  onMountainClick,
  onCampsiteClick,
  onFocusUserLocation,
  onMapReady,
  plannerWaypoints = [],
  plannerPath,
  plannerRouteStatus = 'idle',
  onMapClick,
}: MapViewProps) {
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const [runtimeMapError, setRuntimeMapError] = useState<string | null>(null);

  const isLayerVisible = (layer: MapLayer) => !hiddenLayers.includes(layer);
  const visibleRoutes = routes.filter((r) => isLayerVisible(layerForActivityType(r.activity_type)));

  const loadErrorMessage = loadError?.message ?? '';
  const effectiveMapErrorMessage = runtimeMapError ?? loadErrorMessage;
  const isMapAuthError = /RefererNotAllowedMapError|gm_authFailure|authentication failed/i.test(
    effectiveMapErrorMessage
  );
  const allowedReferrers = (() => {
    if (!currentOrigin) {
      return [
        'http://localhost:4790/*',
        'http://127.0.0.1:4790/*',
        'http://localhost/*',
        'http://127.0.0.1/*',
      ];
    }

    try {
      const url = new URL(currentOrigin);
      return Array.from(
        new Set([
          `${url.protocol}//${url.host}/*`,
          `http://localhost${url.port ? `:${url.port}` : ''}/*`,
          `http://127.0.0.1${url.port ? `:${url.port}` : ''}/*`,
          'http://localhost/*',
          'http://127.0.0.1/*',
        ])
      );
    } catch {
      return [
        'http://localhost:4790/*',
        'http://127.0.0.1:4790/*',
        'http://localhost/*',
        'http://127.0.0.1/*',
      ];
    }
  })();
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    userLocationProp || null
  );
  const [mapCenter, setMapCenter] = useState({
    lat: initialCenter[1],
    lng: initialCenter[0],
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  /** Auto-framing is a one-time courtesy; after that the viewport is theirs. */
  const hasAutoFittedRef = useRef(false);

  // Precipitation radar overlay. Re-fetched each time it's switched on, since
  // RainViewer publishes a new frame roughly every 10 minutes and the map can
  // stay open far longer than that.
  useEffect(() => {
    if (!map || !showWeatherRadar) return;

    let cancelled = false;
    let overlay: google.maps.ImageMapType | null = null;

    fetchLatestRadarFrame().then((frame) => {
      if (cancelled || !frame) return;
      overlay = new google.maps.ImageMapType({
        getTileUrl: (coord, zoom) => radarTileUrl(frame, coord.x, coord.y, zoom),
        tileSize: new google.maps.Size(256, 256),
        opacity: 0.6,
        name: 'Precipitation radar',
      });
      map.overlayMapTypes.push(overlay);
    });

    return () => {
      cancelled = true;
      if (!overlay) return;
      const types = map.overlayMapTypes;
      for (let i = types.getLength() - 1; i >= 0; i--) {
        if (types.getAt(i) === overlay) types.removeAt(i);
      }
    };
  }, [map, showWeatherRadar]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onWindowError = (event: ErrorEvent) => {
      const text = `${event.message ?? ''} ${event.error?.message ?? ''} ${event.error?.stack ?? ''}`;
      if (
        /Google Maps JavaScript API error/i.test(text) ||
        /RefererNotAllowedMapError/i.test(text) ||
        (/IntersectionObserver/i.test(text) && /maps\.googleapis\.com/i.test(text))
      ) {
        setRuntimeMapError(text);
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const text =
        typeof reason === 'string' ? reason : `${reason?.message ?? ''} ${reason?.stack ?? ''}`;

      if (
        /maps\.googleapis\.com/i.test(text) ||
        /Google Maps/i.test(text) ||
        /RefererNotAllowedMapError/i.test(text) ||
        /IntersectionObserver/i.test(text)
      ) {
        setRuntimeMapError(text || 'Google Maps initialization failed.');
      }
    };

    const windowWithMapsAuth = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailure = windowWithMapsAuth.gm_authFailure;

    windowWithMapsAuth.gm_authFailure = () => {
      setRuntimeMapError('Google Maps authentication failed (gm_authFailure)');
      if (typeof previousAuthFailure === 'function') {
        previousAuthFailure();
      }
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      windowWithMapsAuth.gm_authFailure = previousAuthFailure;
    };
  }, []);

  const onLoad = useCallback(
    (instance: google.maps.Map) => {
      setMap(instance);
      onMapReady?.(instance);
    },
    [onMapReady]
  );

  // Register the focus-to-user-location handler with the parent
  useEffect(() => {
    if (!onFocusUserLocation) return;
    onFocusUserLocation(() => {
      if (!map || !userLocation) return;
      map.panTo({ lat: userLocation[1], lng: userLocation[0] });
      map.setZoom(14);
    });
  }, [map, userLocation, onFocusUserLocation]);

  const onUnmount = useCallback(() => {
    setMap(null);
    onMapReady?.(null);
  }, [onMapReady]);

  // Restore where the user last was, before any auto-fit runs.
  useEffect(() => {
    if (!map) return;
    const saved = readStoredViewport();
    if (!saved) return;
    map.setCenter({ lat: saved.lat, lng: saved.lng });
    map.setZoom(saved.zoom);
    hasAutoFittedRef.current = true;
  }, [map]);

  // Remember the viewport so a reload does not dump the user back at the
  // default framing of a map they had already navigated.
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('idle', () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (!center || zoom === undefined) return;
      writeStoredViewport({ lat: center.lat(), lng: center.lng(), zoom });
    });
    return () => google.maps.event.removeListener(listener);
  }, [map]);

  // On initial load, fit the map to a 50 km circle around the user
  useEffect(() => {
    if (!map || !userLocation) return;
    if (hasAutoFittedRef.current) return;
    const center = new google.maps.LatLng(userLocation[1], userLocation[0]);
    const circle = new google.maps.Circle({ center, radius: 50000 });
    map.fitBounds(circle.getBounds()!);
  }, [map, userLocation]);

  // After data loads, expand bounds to include all markers.
  //
  // Guarded to run once: `routes` is the *filtered* list, so without the guard
  // every filter change re-framed the map and threw away wherever the user had
  // panned to.
  useEffect(() => {
    if (!map || (routes.length === 0 && mountains.length === 0 && campsites.length === 0)) return;
    if (hasAutoFittedRef.current) return;
    hasAutoFittedRef.current = true;

    const bounds = new google.maps.LatLngBounds();
    let hasValidCoordinates = false;

    // Add user location to bounds if available
    if (userLocation) {
      bounds.extend({ lat: userLocation[1], lng: userLocation[0] });
      hasValidCoordinates = true;
    }

    // Only visible layers get a vote on the framing — otherwise the map zooms
    // out to fit markers the user has deliberately switched off.
    // Add all route coordinates to bounds
    visibleRoutes.forEach((route) => {
      if (route.coordinates && route.coordinates.length === 2) {
        bounds.extend({ lat: route.coordinates[1], lng: route.coordinates[0] });
        hasValidCoordinates = true;
      }
      // Also include polyline points if available
      if (route.polyline && route.polyline.length > 0) {
        route.polyline.forEach(([lng, lat]) => {
          bounds.extend({ lat, lng });
          hasValidCoordinates = true;
        });
      }
    });

    // Add all mountain coordinates to bounds
    (isLayerVisible('mountains') ? mountains : []).forEach((mountain) => {
      if (mountain.coordinates && mountain.coordinates.length === 2) {
        bounds.extend({ lat: mountain.coordinates[1], lng: mountain.coordinates[0] });
        hasValidCoordinates = true;
      }
    });

    // Add all campsite coordinates to bounds
    (isLayerVisible('campsites') ? campsites : []).forEach((campsite) => {
      if (campsite.coordinates && campsite.coordinates.length === 2) {
        bounds.extend({ lat: campsite.coordinates[1], lng: campsite.coordinates[0] });
        hasValidCoordinates = true;
      }
    });

    if (!hasValidCoordinates) return;

    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });

    // Belt and braces: even with the radius filter upstream, a single bad
    // coordinate must not be able to zoom the map out to the whole planet.
    // fitBounds is async, so correct on the next idle rather than immediately.
    if (!userLocation) return;
    const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
      const zoom = map.getZoom();
      if (zoom !== undefined && zoom < MIN_AUTOFIT_ZOOM) {
        map.setCenter({ lat: userLocation[1], lng: userLocation[0] });
        map.setZoom(MIN_AUTOFIT_ZOOM);
      }
    });
    return () => google.maps.event.removeListener(listener);
    // Deliberately keyed on the source collections rather than on
    // `visibleRoutes`/`isLayerVisible`. This effect moves the viewport, and
    // `visibleRoutes` is derived — a new array on most renders — so depending on
    // it would refit the bounds continuously and drag the map back every time
    // the user panned. Toggling a layer should hide pins, not re-frame the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refitting on derived state fights the user's pan/zoom
  }, [map, routes, mountains, campsites, userLocation]);

  // Centre on whatever the page resolved. This component no longer asks for
  // geolocation itself — useUserLocation owns that, so there is exactly one
  // permission prompt and one set of coordinates in the app.
  //
  // Keyed on the coordinate *values*, never on the array.
  //
  // `userLocation` arrives as a freshly built `[lng, lat]` tuple on every render
  // of the parent, so an effect depending on the array itself re-ran whenever
  // anything upstream changed — including adding a planner waypoint. It then set
  // `mapCenter` to a new object, `<GoogleMap center>` is controlled, and the map
  // snapped back to the user's location mid-edit: drop a waypoint, lose your
  // place. Comparing numbers means this runs only when the location genuinely
  // moves, which for a one-shot `getCurrentPosition` is approximately never.
  const userLng = userLocationProp?.[0];
  const userLat = userLocationProp?.[1];

  useEffect(() => {
    if (userLng == null || userLat == null) return;
    setUserLocation([userLng, userLat]);
    setMapCenter({ lat: userLat, lng: userLng });
  }, [userLng, userLat]);

  const getDifficultyColor = (difficulty: string): string => {
    switch (difficulty.toLowerCase()) {
      case 'easy':
        return '#22c55e';
      case 'moderate':
        return '#f59e0b';
      case 'challenging':
        return '#ef4444';
      default:
        return '#3b82f6';
    }
  };

  const getActivityIconComponent = (activityType: string): LucideIcon => {
    switch (activityType.toLowerCase()) {
      case 'bike':
      case 'ride':
        return Bike;
      case 'rock_climb':
        return MountainIcon;
      case 'tour':
        return MapIcon;
      default:
        return Footprints;
    }
  };

  if (loadError || runtimeMapError) {
    // The diagnostics below name env vars, referrer allowlists and Cloud
    // Console steps. That is exactly what a developer needs and exactly what a
    // visitor should never see. Gate on the host rather than NODE_ENV so a
    // production build served from a preview URL still shows visitor copy.
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

          {showDiagnostics && isMapAuthError && (
            <div className="mt-4 rounded-md border border-red-500/25 bg-red-500/10 p-3 text-left text-xs text-red-200">
              <p className="font-semibold">Detected: Google Maps auth/referrer restriction</p>
              <p className="mt-1">
                Your current origin is not authorized for this Google Maps key. Add these HTTP
                referrers in Google Cloud Console.
              </p>
              <ul className="mt-2 space-y-1">
                {allowedReferrers.map((ref) => (
                  <li key={ref} className="font-mono text-[11px]">
                    {ref}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showDiagnostics && effectiveMapErrorMessage && (
            <p className="mt-3 text-xs text-slate-500">
              Error detail: <span className="break-all font-mono">{effectiveMapErrorMessage}</span>
            </p>
          )}
          {showDiagnostics && currentOrigin && (
            <p className="mt-3 text-xs text-slate-500">
              Current site origin: <span className="font-mono">{currentOrigin}</span>
            </p>
          )}
          {showDiagnostics && (
            <div className="mt-4 rounded-md border border-ink/10 bg-slate-900 p-3 text-left text-xs text-slate-400">
              <p className="font-semibold text-slate-300">Quick checks (dev only)</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Enable Maps JavaScript API, Places API, and Elevation API.</li>
                <li>
                  Add allowed referrers, including localhost dev ports (for example:
                  http://localhost:4790/*).
                </li>
                <li>Ensure billing is enabled for the Google Cloud project.</li>
                <li>Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local and restart Next.js.</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500/25 border-t-blue-500" />
          <p className="text-sm text-slate-400">Loading map…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapRenderErrorBoundary
        onError={(error) => {
          setRuntimeMapError(`Google Maps render failed: ${error.message}`);
        }}
      >
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={mapCenter}
          zoom={initialZoom}
          onLoad={onLoad}
          onUnmount={onUnmount}
          onClick={(e) => {
            if (!onMapClick || !e.latLng) return;
            onMapClick([e.latLng.lng(), e.latLng.lat()]);
          }}
          options={{
            mapTypeId: 'terrain',
            // Google's own POI pins compete directly with ours for attention,
            // and at trail scale they are mostly shops and restaurants.
            styles: showNativePoi
              ? undefined
              : [
                  {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }],
                  },
                  {
                    featureType: 'transit',
                    elementType: 'labels.icon',
                    stylers: [{ visibility: 'off' }],
                  },
                ],
            draggableCursor: onMapClick ? 'crosshair' : undefined,
            zoomControl: showNativeControls,
            // Google puts zoom bottom-right by default, directly underneath the
            // chat FAB. Moving it to the right edge, vertically centred, frees
            // that corner without pushing it into the bottom-left legend.
            zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
            streetViewControl: false,
            mapTypeControl: showNativeControls,
            // Default is top-left, where it sat underneath our own count card.
            mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
            fullscreenControl: showNativeControls,
          }}
        >
          {/* User Location — animated GPS pulse overlay, real fixes only */}
          {userLocation && hasPreciseLocation && (
            <OverlayView
              position={{ lat: userLocation[1], lng: userLocation[0] }}
              mapPaneName="overlayMouseTarget"
              getPixelPositionOffset={() => ({ x: -14, y: -14 })}
            >
              <div style={{ position: 'relative', width: 28, height: 28, pointerEvents: 'none' }}>
                <div
                  className="loc-ring"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(59,130,246,0.45)',
                    transformOrigin: 'center',
                  }}
                />
                <div
                  className="loc-ring-2"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(59,130,246,0.3)',
                    transformOrigin: 'center',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 5,
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    border: '2.5px solid white',
                    boxShadow: '0 0 14px rgba(59,130,246,0.8), 0 2px 6px rgba(0,0,0,0.3)',
                  }}
                />
              </div>
            </OverlayView>
          )}

          {/* Route Polylines */}
          {visibleRoutes
            .filter((route) => route.polyline && route.polyline.length > 0)
            .map((route) => (
              <Polyline
                key={`polyline-${route.id}`}
                path={route.polyline!.map(([lng, lat]) => ({ lat, lng }))}
                options={{
                  strokeColor: getDifficultyColor(route.difficulty),
                  strokeOpacity: 0.8,
                  strokeWeight: 4,
                }}
              />
            ))}

          {/* Activity Polylines (from Strava / COROS / Garmin / Komoot) */}
          {(isLayerVisible('activities') ? activityPolylines : [])
            .filter((ap) => ap.coords.length > 0)
            .map((ap) => (
              <Polyline
                key={`activity-${ap.id}`}
                path={ap.coords.map(([lng, lat]) => ({ lat, lng }))}
                options={{
                  strokeColor: SOURCE_POLYLINE_COLOR[ap.source] ?? '#8b5cf6',
                  strokeOpacity: 0.75,
                  strokeWeight: 3,
                  geodesic: true,
                }}
              />
            ))}

          {/* Advisories. Drawn last of the data layers and in the loudest
              colour available: a closure or a rescue outranks discovery. */}
          {isLayerVisible('advisories') &&
            advisories
              .filter((a) => a.coordinates)
              .map((advisory) => (
                <OverlayView
                  key={`advisory-${advisory.id}`}
                  position={{
                    lat: advisory.coordinates![1],
                    lng: advisory.coordinates![0],
                  }}
                  mapPaneName="overlayMouseTarget"
                  getPixelPositionOffset={() => ({ x: -14, y: -14 })}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`${advisory.kind}: ${advisory.title}`}
                    title={advisory.title}
                    onClick={() => onAdvisoryClick?.(advisory.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onAdvisoryClick?.(advisory.id);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      backgroundColor: URGENT_ADVISORY_KINDS.has(advisory.kind)
                        ? '#e11d48'
                        : '#f59e0b',
                      border: '2px solid white',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
                    }}
                  >
                    <TriangleAlert aria-hidden="true" size={14} color="white" />
                  </div>
                </OverlayView>
              ))}

          {/* Planned route — drawn above everything so the line being built is
              never lost under the discovery markers. */}
          {(() => {
            /**
             * One line, and it says which kind it is.
             *
             * Two problems used to live here. The fallback drew a straight line
             * between waypoints styled *identically* to a measured route, so a
             * route that had not been snapped yet — or had failed to snap —
             * looked exactly like one that had. `usePlannerRoute` clears the path
             * precisely to avoid that ("nothing is drawn while we wait"), and
             * this component then drew the provisional line anyway. And the solid
             * stroke carried dash icons on top of it, which reads as a second
             * line laid over the first.
             *
             * Now: a measured route is a solid line. Un-snapped waypoints are a
             * dashed guide — no solid stroke at all, so the dashes *are* the line
             * — which is the "labelled as such" the API table promises. Nothing
             * is drawn mid-route, so adding a waypoint no longer flashes a
             * straight line across the map.
             */
            const snapped = plannerPath && plannerPath.length > 1;
            if (plannerWaypoints.length < 2) return null;
            if (!snapped && plannerRouteStatus === 'routing') return null;

            const path = (snapped ? plannerPath! : plannerWaypoints.map((w) => w.coordinates)).map(
              ([lng, lat]) => ({ lat, lng })
            );

            return (
              <Polyline
                path={path}
                options={
                  snapped
                    ? {
                        strokeColor: '#f97316',
                        strokeOpacity: 0.95,
                        strokeWeight: 4,
                        zIndex: 999,
                      }
                    : {
                        // strokeOpacity 0 is how Google draws a genuinely dashed
                        // line: the icons become the line rather than decorating
                        // a solid one underneath.
                        strokeColor: '#f97316',
                        strokeOpacity: 0,
                        strokeWeight: 3,
                        zIndex: 998,
                        icons: [
                          {
                            icon: {
                              path: 'M 0,-1 0,1',
                              strokeOpacity: 0.75,
                              strokeWeight: 3,
                              scale: 3,
                            },
                            offset: '0',
                            repeat: '12px',
                          },
                        ],
                      }
                }
              />
            );
          })()}
          {plannerWaypoints.map((w, index) => (
            <OverlayView
              key={w.id}
              position={{ lat: w.coordinates[1], lng: w.coordinates[0] }}
              mapPaneName="overlayMouseTarget"
              getPixelPositionOffset={() => ({ x: -12, y: -12 })}
            >
              <div
                title={w.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: '#f97316',
                  border: '2px solid white',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                }}
              >
                {index + 1}
              </div>
            </OverlayView>
          ))}

          {/* Route Markers */}
          {visibleRoutes
            .filter(
              (route) =>
                route.coordinates &&
                route.coordinates.length === 2 &&
                typeof route.coordinates[0] === 'number' &&
                typeof route.coordinates[1] === 'number'
            )
            .map((route) => {
              const color = getDifficultyColor(route.difficulty);
              const ActivityIcon = getActivityIconComponent(route.activity_type);
              return (
                <OverlayView
                  key={route.id}
                  position={{ lat: route.coordinates[1], lng: route.coordinates[0] }}
                  mapPaneName="overlayMouseTarget"
                  getPixelPositionOffset={() => ({ x: -16, y: -44 })}
                >
                  {/* A `title` is not an accessible name and never appears on
                      touch. Markers were `div onClick` with no role and no tab
                      stop, so the whole POI layer was mouse-only. */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`${route.name}, ${route.difficulty} ${route.activity_type} route`}
                    title={route.name}
                    onClick={() =>
                      onMapClick ? onMapClick(route.coordinates, route.name) : onRouteClick?.(route)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (onMapClick) onMapClick(route.coordinates, route.name);
                        else onRouteClick?.(route);
                      }
                    }}
                    style={{
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      cursor: 'pointer',
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: color,
                        border: '2.5px solid white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ActivityIcon size={15} color="white" />
                    </div>
                    <div
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '5px solid transparent',
                        borderRight: '5px solid transparent',
                        borderTop: `7px solid ${color}`,
                        marginTop: -1,
                      }}
                    />
                  </div>
                </OverlayView>
              );
            })}

          {/* Mountain/Peak Markers */}
          {(isLayerVisible('mountains') ? mountains : [])
            .filter(
              (mountain) =>
                mountain.coordinates &&
                mountain.coordinates.length === 2 &&
                typeof mountain.coordinates[0] === 'number' &&
                typeof mountain.coordinates[1] === 'number'
            )
            .map((mountain) => (
              <OverlayView
                key={mountain.id}
                position={{ lat: mountain.coordinates[1], lng: mountain.coordinates[0] }}
                mapPaneName="overlayMouseTarget"
                getPixelPositionOffset={() => ({ x: -16, y: -44 })}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={
                    mountain.elevation_m == null
                      ? `${mountain.name}, elevation unknown`
                      : `${mountain.name}, ${mountain.elevation_m} metres`
                  }
                  title={
                    mountain.elevation_m == null
                      ? mountain.name
                      : `${mountain.name} (${mountain.elevation_m}m)`
                  }
                  onClick={() =>
                    onMapClick
                      ? onMapClick(mountain.coordinates, mountain.name)
                      : onMountainClick?.(mountain)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onMapClick) onMapClick(mountain.coordinates, mountain.name);
                      else onMountainClick?.(mountain);
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: '#78350f',
                      border: '2.5px solid white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MountainIcon aria-hidden="true" size={15} color="white" />
                  </div>
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: '7px solid #78350f',
                      marginTop: -1,
                    }}
                  />
                </div>
              </OverlayView>
            ))}

          {/* Campsite Markers */}
          {(isLayerVisible('campsites') ? campsites : [])
            .filter(
              (campsite) =>
                campsite.coordinates &&
                campsite.coordinates.length === 2 &&
                typeof campsite.coordinates[0] === 'number' &&
                typeof campsite.coordinates[1] === 'number'
            )
            .map((campsite) => (
              <OverlayView
                key={campsite.id}
                position={{ lat: campsite.coordinates[1], lng: campsite.coordinates[0] }}
                mapPaneName="overlayMouseTarget"
                getPixelPositionOffset={() => ({ x: -16, y: -44 })}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`${campsite.name} campsite${campsite.rating ? `, rated ${campsite.rating} out of 5` : ''}`}
                  title={`${campsite.name}${campsite.rating ? ` (★${campsite.rating})` : ''}`}
                  onClick={() =>
                    onMapClick
                      ? onMapClick(campsite.coordinates, campsite.name)
                      : onCampsiteClick?.(campsite)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onMapClick) onMapClick(campsite.coordinates, campsite.name);
                      else onCampsiteClick?.(campsite);
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: '#15803d',
                      border: '2.5px solid white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Tent aria-hidden="true" size={15} color="white" />
                  </div>
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: '7px solid #15803d',
                      marginTop: -1,
                    }}
                  />
                </div>
              </OverlayView>
            ))}

          {/* Saved Place Star Markers */}
          {(isLayerVisible('saved') ? savedPlaces : [])
            .filter(
              (place) =>
                place.coordinates &&
                place.coordinates.length === 2 &&
                typeof place.coordinates[0] === 'number' &&
                typeof place.coordinates[1] === 'number'
            )
            .map((place) => (
              <OverlayView
                key={`saved-${place.id}`}
                position={{ lat: place.coordinates[1], lng: place.coordinates[0] }}
                mapPaneName="overlayMouseTarget"
                getPixelPositionOffset={() => ({ x: -12, y: -38 })}
              >
                <div
                  title={`Saved: ${place.name}`}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))',
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      backgroundColor: '#d97706',
                      border: '2.5px solid white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Bookmark aria-hidden="true" size={12} color="white" fill="white" />
                  </div>
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      borderTop: '6px solid #d97706',
                      marginTop: -1,
                    }}
                  />
                </div>
              </OverlayView>
            ))}
        </GoogleMap>
      </MapRenderErrorBoundary>

      {/* Legend — bottom-left, so it doesn't stack under Google Maps' native
          zoom control or the ChatBot floating button, which both sit bottom-right */}
      {showLegend && (
        <div className="absolute bottom-24 left-4 hidden rounded-xl border border-ink/10 bg-slate-900/90 p-4 shadow-xl backdrop-blur sm:block">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Legend
          </h3>
          <div className="space-y-2">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Route Difficulty
              </p>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-slate-300">Easy</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-orange-500" />
                  <span className="text-slate-300">Moderate</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="text-slate-300">Hard</span>
                </div>
              </div>
            </div>
            {(mountains.length > 0 || campsites.length > 0) && (
              <div className="border-t border-ink/10 pt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Points of Interest
                </p>
                <div className="space-y-1 text-xs">
                  {mountains.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-900">
                        <MountainIcon aria-hidden="true" size={10} color="white" />
                      </div>
                      <span className="text-slate-300">Mountain/Peak</span>
                    </div>
                  )}
                  {campsites.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-700">
                        <Tent aria-hidden="true" size={10} color="white" />
                      </div>
                      <span className="text-slate-300">Campsite</span>
                    </div>
                  )}
                  {savedPlaces.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-600">
                        <Bookmark aria-hidden="true" size={9} color="white" fill="white" />
                      </div>
                      <span className="text-slate-300">Saved</span>
                    </div>
                  )}
                  {hasPreciseLocation && (
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-blue-500" />
                      <span className="text-slate-300">Your Location</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* The layer toggles that lived here as a floating card are now in the
          navigation dock, so there is one place to control what the map draws
          rather than two that could disagree. */}
    </div>
  );
}
