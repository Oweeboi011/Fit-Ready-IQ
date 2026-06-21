"use client";

import { useEffect, useState, useCallback } from "react";
import { GoogleMap, Marker, Polyline, OverlayView } from "@react-google-maps/api";
import { type ActivityPolyline } from "@/lib/activityTypes";

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

export default function MapView({
  initialCenter = [-122.4194, 37.7749],
  initialZoom = 12,
  routes = [],
  mountains = [],
  campsites = [],
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
  const [userLocation, setUserLocation] = useState<[number, number] | null>(userLocationProp || null);
  const [mapCenter, setMapCenter] = useState({
    lat: initialCenter[1],
    lng: initialCenter[0],
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);

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
          console.error("Error getting location:", error);
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
  }, []);

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

  const getActivityIcon = (activityType: string): string => {
    switch (activityType.toLowerCase()) {
      case "hike":
        return "HIKE";
      case "bike":
      case "ride":
        return "BIKE";
      case "run":
        return "RUN";
      case "rock_climb":
        return "CLIMB";
      default:
        return "PIN";
    }
  };

  if (loadError) {
    return (
      <div className="relative h-full w-full flex items-center justify-center bg-slate-100">
        <div className="max-w-lg text-center px-6">
          <p className="text-red-600 font-semibold">Error loading Google Maps</p>
          <p className="text-sm text-slate-600 mt-2">
            Verify your Maps API key, HTTP referrer allowlist, and enabled APIs.
          </p>
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
          .map((route) => (
            <Marker
              key={route.id}
              position={{ lat: route.coordinates[1], lng: route.coordinates[0] }}
              icon={{
                url: `data:image/svg+xml,${encodeURIComponent(`
                  <svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="18" fill="${getDifficultyColor(
                      route.difficulty
                    )}" stroke="white" stroke-width="2"/>
                    <text x="20" y="28" text-anchor="middle" font-size="20">${getActivityIcon(
                      route.activity_type
                    )}</text>
                  </svg>
                `)}`,
                scaledSize: new google.maps.Size(40, 40),
              }}
              title={route.name}
              onClick={() => {
                if (onRouteClick) {
                  onRouteClick(route);
                }
              }}
            />
          ))}

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
            <Marker
              key={mountain.id}
              position={{ lat: mountain.coordinates[1], lng: mountain.coordinates[0] }}
              icon={{
                url: `data:image/svg+xml,${encodeURIComponent(`
                  <svg width="36" height="36" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 4 L10 20 L26 20 Z" fill="#8b4513" stroke="white" stroke-width="2"/>
                    <circle cx="18" cy="8" r="3" fill="white"/>
                    <text x="18" y="31" text-anchor="middle" font-size="14" fill="#333">MTN</text>
                  </svg>
                `)}`,
                scaledSize: new google.maps.Size(36, 36),
              }}
              title={`${mountain.name} (${mountain.elevation_m}m)`}
              onClick={() => {
                if (onMountainClick) {
                  onMountainClick(mountain);
                }
              }}
            />
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
            <Marker
              key={campsite.id}
              position={{ lat: campsite.coordinates[1], lng: campsite.coordinates[0] }}
              icon={{
                url: `data:image/svg+xml,${encodeURIComponent(`
                  <svg width="36" height="36" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 8 L8 24 L28 24 Z" fill="#228b22" stroke="white" stroke-width="2"/>
                    <rect x="17" y="24" width="2" height="8" fill="#8b4513"/>
                    <text x="18" y="35" text-anchor="middle" font-size="12">CAMP</text>
                  </svg>
                `)}`,
                scaledSize: new google.maps.Size(36, 36),
              }}
              title={`${campsite.name}${campsite.rating ? ` (*${campsite.rating})` : ''}`}
              onClick={() => {
                if (onCampsiteClick) {
                  onCampsiteClick(campsite);
                }
              }}
            />
          ))}
      </GoogleMap>

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
                    <span>MTN</span>
                    <span className="text-slate-600">Mountain/Peak</span>
                  </div>
                )}
                {campsites.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span>CAMP</span>
                    <span className="text-slate-600">Campsite</span>
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
