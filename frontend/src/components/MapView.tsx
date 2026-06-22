"use client";

import React, { useEffect, useState, useCallback } from "react";
import { GoogleMap, Polyline, OverlayView } from "@react-google-maps/api";
import { Mountain as MountainIcon, Tent, Footprints, Bike, Map as MapIcon, MapPin, Bookmark, type LucideIcon } from "lucide-react";
import { type ActivityPolyline } from "@/lib/activityTypes";
import { type SavedPlace } from "@/lib/useSavedPlaces";

interface Route {
  id: string;
  name: string;
  coordinates: [number, number];
  distance_km: number;
  elevation_gain_m: number;
  difficulty: string;
  activity_type: string;
  polyline?: [number, number][];
}

interface Mountain {
  id: string;
  name: string;
  coordinates: [number, number];
  elevation_m: number;
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
  activityPolylines?: ActivityPolyline[];
  userLocation?: [number, number];
  isLoaded: boolean;
  loadError: Error | undefined;
  onRouteClick?: (route: Route) => void;
  onMountainClick?: (mountain: Mountain) => void;
  onCampsiteClick?: (campsite: Campsite) => void;
  onFocusUserLocation?: (fn: () => void) => void;
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

const SOURCE_POLYLINE_COLOR: Record<string, string> = {
  strava: "#fc4c02",
  coros: "#2563eb",
  garmin: "#0ea5e9",
  komoot: "#16a34a",
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
  activityPolylines = [],
  userLocation: userLocationProp,
  isLoaded,
  loadError,
  onRouteClick,
  onMountainClick,
  onCampsiteClick,
  onFocusUserLocation,
}: MapViewProps) {
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const [runtimeMapError, setRuntimeMapError] = useState<string | null>(null);
  const loadErrorMessage = loadError?.message ?? "";
  const effectiveMapErrorMessage = runtimeMapError ?? loadErrorMessage;
  const isMapAuthError = /RefererNotAllowedMapError|gm_authFailure|authentication failed/i.test(effectiveMapErrorMessage);
  const allowedReferrers = (() => {
    if (!currentOrigin) {
      return ["http://localhost:4790/*", "http://127.0.0.1:4790/*", "http://localhost/*", "http://127.0.0.1/*"];
    }

    try {
      const url = new URL(currentOrigin);
      return Array.from(
        new Set([
          `${url.protocol}//${url.host}/*`,
          `http://localhost${url.port ? `:${url.port}` : ""}/*`,
          `http://127.0.0.1${url.port ? `:${url.port}` : ""}/*`,
          "http://localhost/*",
          "http://127.0.0.1/*",
        ])
      );
    } catch {
      return ["http://localhost:4790/*", "http://127.0.0.1:4790/*", "http://localhost/*", "http://127.0.0.1/*"];
    }
  })();
  const [userLocation, setUserLocation] = useState<[number, number] | null>(userLocationProp || null);
  const [mapCenter, setMapCenter] = useState({
    lat: initialCenter[1],
    lng: initialCenter[0],
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onWindowError = (event: ErrorEvent) => {
      const text = `${event.message ?? ""} ${event.error?.message ?? ""} ${event.error?.stack ?? ""}`;
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
      const text = typeof reason === "string"
        ? reason
        : `${reason?.message ?? ""} ${reason?.stack ?? ""}`;

      if (
        /maps\.googleapis\.com/i.test(text) ||
        /Google Maps/i.test(text) ||
        /RefererNotAllowedMapError/i.test(text) ||
        /IntersectionObserver/i.test(text)
      ) {
        setRuntimeMapError(text || "Google Maps initialization failed.");
      }
    };

    const windowWithMapsAuth = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailure = windowWithMapsAuth.gm_authFailure;

    windowWithMapsAuth.gm_authFailure = () => {
      setRuntimeMapError("Google Maps authentication failed (gm_authFailure)");
      if (typeof previousAuthFailure === "function") {
        previousAuthFailure();
      }
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      windowWithMapsAuth.gm_authFailure = previousAuthFailure;
    };
  }, []);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

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
  }, []);

  // On initial load, fit the map to a 50 km circle around the user
  useEffect(() => {
    if (!map || !userLocation) return;
    const center = new google.maps.LatLng(userLocation[1], userLocation[0]);
    const circle = new google.maps.Circle({ center, radius: 50000 });
    map.fitBounds(circle.getBounds()!);
  }, [map, userLocation]);

  // After data loads, expand bounds to include all markers
  useEffect(() => {
    if (!map || (routes.length === 0 && mountains.length === 0 && campsites.length === 0)) return;

    const bounds = new google.maps.LatLngBounds();
    let hasValidCoordinates = false;

    // Add user location to bounds if available
    if (userLocation) {
      bounds.extend({ lat: userLocation[1], lng: userLocation[0] });
      hasValidCoordinates = true;
    }

    // Add all route coordinates to bounds
    routes.forEach((route) => {
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
    mountains.forEach((mountain) => {
      if (mountain.coordinates && mountain.coordinates.length === 2) {
        bounds.extend({ lat: mountain.coordinates[1], lng: mountain.coordinates[0] });
        hasValidCoordinates = true;
      }
    });

    // Add all campsite coordinates to bounds
    campsites.forEach((campsite) => {
      if (campsite.coordinates && campsite.coordinates.length === 2) {
        bounds.extend({ lat: campsite.coordinates[1], lng: campsite.coordinates[0] });
        hasValidCoordinates = true;
      }
    });

    // Fit map to bounds with padding
    if (hasValidCoordinates) {
      map.fitBounds(bounds, {
        top: 50,
        right: 50,
        bottom: 50,
        left: 50,
      });
    }
  }, [map, routes, mountains, campsites, userLocation]);

  // Get user's current location
  useEffect(() => {
    if (userLocationProp) {
      setUserLocation(userLocationProp);
      setMapCenter({
        lat: userLocationProp[1],
        lng: userLocationProp[0],
      });
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: [number, number] = [
            position.coords.longitude,
            position.coords.latitude,
          ];
          setUserLocation(coords);
          setMapCenter({
            lat: coords[1],
            lng: coords[0],
          });
        },
        (error) => {
          console.debug("Location unavailable, using fallback coordinates.", error);
          // Fallback to default location (San Francisco)
          const fallback: [number, number] = [-122.4194, 37.7749];
          setUserLocation(fallback);
          setMapCenter({
            lat: fallback[1],
            lng: fallback[0],
          });
        }
      );
    } else {
      // Browser doesn't support geolocation
      const fallback: [number, number] = [-122.4194, 37.7749];
      setUserLocation(fallback);
      setMapCenter({
        lat: fallback[1],
        lng: fallback[0],
      });
    }
  }, [userLocationProp]);

  const getDifficultyColor = (difficulty: string): string => {
    switch (difficulty.toLowerCase()) {
      case "easy":
        return "#22c55e";
      case "moderate":
        return "#f59e0b";
      case "hard":
        return "#ef4444";
      default:
        return "#3b82f6";
    }
  };

  const getActivityIconComponent = (activityType: string): LucideIcon => {
    switch (activityType.toLowerCase()) {
      case "bike":
      case "ride":
        return Bike;
      case "rock_climb":
        return MountainIcon;
      case "tour":
        return MapIcon;
      default:
        return Footprints;
    }
  };

  if (loadError || runtimeMapError) {
    return (
      <div className="relative h-full w-full flex items-center justify-center bg-slate-100">
        <div className="max-w-xl text-center px-6">
          <p className="text-red-600 font-semibold">Error loading Google Maps</p>
          <p className="text-sm text-slate-600 mt-2">
            Verify your Maps API key, HTTP referrer allowlist, and enabled APIs.
          </p>
          {isMapAuthError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-left text-xs text-red-900">
              <p className="font-semibold">Detected: Google Maps auth/referrer restriction</p>
              <p className="mt-1">
                Your current origin is not authorized for this Google Maps key. Add these HTTP referrers in Google Cloud Console.
              </p>
              <ul className="mt-2 space-y-1">
                {allowedReferrers.map((ref) => (
                  <li key={ref} className="font-mono text-[11px]">{ref}</li>
                ))}
              </ul>
            </div>
          )}
          {effectiveMapErrorMessage && (
            <p className="mt-3 text-xs text-slate-500">
              Error detail: <span className="font-mono break-all">{effectiveMapErrorMessage}</span>
            </p>
          )}
          {currentOrigin && (
            <p className="mt-3 text-xs text-slate-500">
              Current site origin: <span className="font-mono">{currentOrigin}</span>
            </p>
          )}
          <div className="mt-4 rounded-md border border-slate-200 bg-white p-3 text-left text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Quick checks</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Enable Maps JavaScript API, Places API, and Elevation API.</li>
              <li>Add allowed referrers, including localhost dev ports (for example: http://localhost:4790/*).</li>
              <li>Ensure billing is enabled for the Google Cloud project.</li>
              <li>Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local and restart Next.js.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="relative h-full w-full flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-4" />
          <p className="text-slate-500">Loading map...</p>
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
          options={{
            mapTypeId: "terrain",
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: true,
            fullscreenControl: true,
          }}
        >
        {/* User Location — animated GPS pulse overlay */}
        {userLocation && (
          <OverlayView
            position={{ lat: userLocation[1], lng: userLocation[0] }}
            mapPaneName="overlayMouseTarget"
            getPixelPositionOffset={() => ({ x: -14, y: -14 })}
          >
            <div style={{ position: 'relative', width: 28, height: 28, pointerEvents: 'none' }}>
              <div
                className="loc-ring"
                style={{
                  position: 'absolute', inset: 0,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(59,130,246,0.45)',
                  transformOrigin: 'center',
                }}
              />
              <div
                className="loc-ring-2"
                style={{
                  position: 'absolute', inset: 0,
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
        {routes
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
        {activityPolylines
          .filter((ap) => ap.coords.length > 0)
          .map((ap) => (
            <Polyline
              key={`activity-${ap.id}`}
              path={ap.coords.map(([lng, lat]) => ({ lat, lng }))}
              options={{
                strokeColor: SOURCE_POLYLINE_COLOR[ap.source] ?? "#8b5cf6",
                strokeOpacity: 0.75,
                strokeWeight: 3,
                geodesic: true,
              }}
            />
          ))}

        {/* Route Markers */}
        {routes
          .filter(
            (route) =>
              route.coordinates &&
              route.coordinates.length === 2 &&
              typeof route.coordinates[0] === "number" &&
              typeof route.coordinates[1] === "number"
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
                <div
                  title={route.name}
                  onClick={() => onRouteClick?.(route)}
                  style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", cursor: "pointer", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))" }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    backgroundColor: color, border: "2.5px solid white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <ActivityIcon size={15} color="white" />
                  </div>
                  <div style={{
                    width: 0, height: 0,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: `7px solid ${color}`,
                    marginTop: -1,
                  }} />
                </div>
              </OverlayView>
            );
          })}

        {/* Mountain/Peak Markers */}
        {mountains
          .filter(
            (mountain) =>
              mountain.coordinates &&
              mountain.coordinates.length === 2 &&
              typeof mountain.coordinates[0] === "number" &&
              typeof mountain.coordinates[1] === "number"
          )
          .map((mountain) => (
            <OverlayView
              key={mountain.id}
              position={{ lat: mountain.coordinates[1], lng: mountain.coordinates[0] }}
              mapPaneName="overlayMouseTarget"
              getPixelPositionOffset={() => ({ x: -16, y: -44 })}
            >
              <div
                title={`${mountain.name} (${mountain.elevation_m}m)`}
                onClick={() => onMountainClick?.(mountain)}
                style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", cursor: "pointer", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))" }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  backgroundColor: "#78350f", border: "2.5px solid white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <MountainIcon size={15} color="white" />
                </div>
                <div style={{
                  width: 0, height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: "7px solid #78350f",
                  marginTop: -1,
                }} />
              </div>
            </OverlayView>
          ))}

        {/* Campsite Markers */}
        {campsites
          .filter(
            (campsite) =>
              campsite.coordinates &&
              campsite.coordinates.length === 2 &&
              typeof campsite.coordinates[0] === "number" &&
              typeof campsite.coordinates[1] === "number"
          )
          .map((campsite) => (
            <OverlayView
              key={campsite.id}
              position={{ lat: campsite.coordinates[1], lng: campsite.coordinates[0] }}
              mapPaneName="overlayMouseTarget"
              getPixelPositionOffset={() => ({ x: -16, y: -44 })}
            >
              <div
                title={`${campsite.name}${campsite.rating ? ` (★${campsite.rating})` : ""}`}
                onClick={() => onCampsiteClick?.(campsite)}
                style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", cursor: "pointer", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))" }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  backgroundColor: "#15803d", border: "2.5px solid white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Tent size={15} color="white" />
                </div>
                <div style={{
                  width: 0, height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: "7px solid #15803d",
                  marginTop: -1,
                }} />
              </div>
            </OverlayView>
          ))}

        {/* Saved Place Star Markers */}
        {savedPlaces
          .filter(
            (place) =>
              place.coordinates &&
              place.coordinates.length === 2 &&
              typeof place.coordinates[0] === "number" &&
              typeof place.coordinates[1] === "number"
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
                style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", cursor: "pointer", filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))" }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  backgroundColor: "#d97706", border: "2.5px solid white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Bookmark size={12} color="white" fill="white" />
                </div>
                <div style={{
                  width: 0, height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: "6px solid #d97706",
                  marginTop: -1,
                }} />
              </div>
            </OverlayView>
          ))}

        </GoogleMap>
      </MapRenderErrorBoundary>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Legend</h3>
        <div className="space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Route Difficulty</p>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-slate-600">Easy</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-orange-500" />
                <span className="text-slate-600">Moderate</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-slate-600">Hard</span>
              </div>
            </div>
          </div>
          {(mountains.length > 0 || campsites.length > 0) && (
            <div className="pt-2 border-t border-slate-200">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Points of Interest</p>
              <div className="space-y-1 text-xs">
                {mountains.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-900">
                      <MountainIcon size={10} color="white" />
                    </div>
                    <span className="text-slate-600">Mountain/Peak</span>
                  </div>
                )}
                {campsites.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-700">
                      <Tent size={10} color="white" />
                    </div>
                    <span className="text-slate-600">Campsite</span>
                  </div>
                )}
                {savedPlaces.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-600">
                      <Bookmark size={9} color="white" fill="white" />
                    </div>
                    <span className="text-slate-600">Saved</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-slate-600">Your Location</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Route, Mountain, and Campsite Count */}
      {(routes.length > 0 || mountains.length > 0 || campsites.length > 0) && (
        <div className="absolute top-4 left-4 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg">
          <div className="space-y-1">
            {routes.length > 0 && (
              <div className="text-[13px] font-semibold text-slate-900">
                {routes.length} {routes.length === 1 ? "Route" : "Routes"}
              </div>
            )}
            {mountains.length > 0 && (
              <div className="text-[13px] text-slate-500">
                {mountains.length} {mountains.length === 1 ? "Mountain" : "Mountains"}
              </div>
            )}
            {campsites.length > 0 && (
              <div className="text-[13px] text-slate-500">
                {campsites.length} {campsites.length === 1 ? "Campsite" : "Campsites"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
