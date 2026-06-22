"use client";

// Fit Ready IQ - Main Page
import React, { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useJsApiLoader } from "@react-google-maps/api";
import { type User as FirebaseUser } from "firebase/auth";
import { Mountain, Tent, Route, Search, X, Watch, User as UserIcon, ChevronRight, MapPin, TrendingUp, ArrowUpDown, Clock, Menu, Bookmark, Shield } from 'lucide-react';
import Link from 'next/link';
import RouteFilter, { FilterState } from "@/components/RouteFilter";
import ConnectDevicesModal from "@/components/ConnectDevicesModal";
import DetailsModal from "@/components/DetailsModal";
import ProfileModal from "@/components/ProfileModal";
import { type Activity, type ActivityPolyline, loadActivities, saveActivities, mergeActivities, SOURCE_BG, SOURCE_LABELS, formatDuration } from "@/lib/activityTypes";
import { decodePolyline } from "@/lib/polylineDecoder";
import {
  isFirebaseAuthConfigured,
  onFirebaseAuthStateChanged,
  signInWithGoogle,
  signOutFirebaseUser,
} from "@/lib/firebaseClient";
import ChatBot from "@/components/ChatBot";
import { useSavedPlaces, type SavedPlace } from "@/lib/useSavedPlaces";

const libraries: ("places" | "geometry")[] = ["places", "geometry"];

// Dynamically import MapView to avoid SSR issues with mapbox-gl
const MapView = dynamic(() => import("@/components/MapView"), {
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

interface Route {
  id: string;
  name: string;
  coordinates: [number, number];
  distance_km: number;
  elevation_gain_m: number;
  difficulty: string;
  activity_type: string;
  polyline?: [number, number][];
  photos?: string[];
  place_id?: string;
  jumpoff_elevation?: number;
  summit_elevation?: number;
  strava_segment?: {
    id: string;
    name: string;
    distance: number;
    avg_grade: number;
    kom_time?: string;
    qom_time?: string;
    total_efforts?: number;
  };
}

// Yosemite Decimal System trail class derived from summit elevation
function trailClassFromElevation(elevationM: number): string {
  if (elevationM >= 3000) return 'Class 4-5';
  if (elevationM >= 2000) return 'Class 3-4';
  if (elevationM >= 1000) return 'Class 2-3';
  if (elevationM >= 500)  return 'Class 2';
  return 'Class 1';
}

interface Mountain {
  id: string;
  name: string;
  coordinates: [number, number];
  elevation_m: number;
  prominence_m?: number;
  trail_class?: string;
  mountain_type: string;
  photos?: string[];
  place_id?: string;
  jumpoff_elevation?: number;
  summit_elevation?: number;
  strava_segment?: {
    id: string;
    name: string;
    distance: number;
    avg_grade: number;
    kom_time?: string;
    qom_time?: string;
    total_efforts?: number;
  };
}

interface Campsite {
  id: string;
  name: string;
  coordinates: [number, number];
  type: string;
  rating?: number;
  amenities?: string[];
  photos?: string[];
  place_id?: string;
}

export default function Home() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [filteredRoutes, setFilteredRoutes] = useState<Route[]>([]);
  const [mountains, setMountains] = useState<Mountain[]>([]);
  const [campsites, setCampsites] = useState<Campsite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'routes' | 'mountains' | 'campsites' | 'history' | 'saved'>('routes');
  const focusUserLocationRef = useRef<() => void>(() => {});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<
    | { type: 'route'; data: Route }
    | { type: 'mountain'; data: Mountain }
    | { type: 'campsite'; data: Campsite }
    | { type: 'activity'; data: Activity }
    | null
  >(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
    address?: string;
  } | null>(null);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const { savedPlaces, isSaved, toggleSave } = useSavedPlaces(authUser?.uid ?? null);

  const googleMapsLoaderOptions = useMemo(
    () => ({
      googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      libraries,
    }),
    []
  );

  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);

  useEffect(() => {
    if (!isFirebaseAuthConfigured()) {
      return;
    }
    const unsubscribe = onFirebaseAuthStateChanged((user) => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      // User closed the popup or clicked away — not an error worth surfacing
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return;
      }
      console.error("Google sign-in failed:", err);
      let message = "Google sign-in failed. Please try again.";
      if (code === "auth/unauthorized-domain") {
        message = `This domain (${window.location.hostname}) is not authorised in Firebase Auth.\nAdd it under Authentication > Settings > Authorised domains in the Firebase console.`;
      } else if (code === "auth/operation-not-allowed") {
        message = "Google sign-in is not enabled. Enable it under Authentication > Sign-in method in the Firebase console.";
      } else if (code === "auth/popup-blocked") {
        message = "Sign-in popup was blocked by your browser. Allow popups for this site and try again.";
      } else if (code === "auth/network-request-failed") {
        message = "Network error during sign-in. Check your connection and try again.";
      } else if (!code && !navigator.onLine) {
        message = "You appear to be offline. Connect to the internet and try again.";
      }
      alert(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutFirebaseUser();
    } catch (err) {
      console.error("Sign-out failed:", err);
      alert("Sign-out failed. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  // Helper function to fetch place photos on demand (called lazily when detail modal opens)
  const fetchPlaceDetails = async (placeId: string): Promise<{ photos: string[] }> => {
    try {
      if (!window.google || !window.google.maps || !window.google.maps.places) {
        console.warn('Google Maps API not loaded — no details available');
        return { photos: [] };
      }

      return new Promise((resolve) => {
        const placesService = new google.maps.places.PlacesService(
          document.createElement('div')
        );

        placesService.getDetails(
          {
            placeId,
            fields: ['photos'],
          },
          (place, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK) {
              resolve({ photos: [] });
              return;
            }

            const photoUrls = (place?.photos || [])
              .slice(0, 6)
              .map(photo => photo.getUrl({ maxWidth: 800, maxHeight: 600 }));

            resolve({ photos: photoUrls });
          }
        );
      });
    } catch (error) {
      console.error('Error in fetchPlaceDetails:', error);
      return { photos: [] };
    }
  };

  // Helper function to generate mock Strava segment data
  const generateStravaSegment = (name: string, distance: number, elevation: number) => {
    const avgGrade = ((elevation / (distance * 1000)) * 100);
    const hasSegment = Math.random() > 0.1; // 90% chance of having Strava data
    
    if (!hasSegment) return undefined;
    
    // Generate realistic KOM/QOM times
    const baseSpeed = 3.5; // meters per second
    const gradeAdjustment = 1 - (avgGrade / 100) * 0.5;
    const distanceMeters = distance * 1000;
    const timeSeconds = Math.floor((distanceMeters / baseSpeed) * gradeAdjustment);
    
    const komSeconds = timeSeconds + Math.floor(Math.random() * 60);
    const qomSeconds = Math.floor(komSeconds * 1.15); // QOM typically ~15% slower
    
    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    return {
      id: `seg_${Math.random().toString(36).substr(2, 9)}`,
      name: `${name} Climb`,
      distance,
      avg_grade: parseFloat(avgGrade.toFixed(1)),
      kom_time: formatTime(komSeconds),
      qom_time: formatTime(qomSeconds),
      total_efforts: Math.floor(Math.random() * 5000) + 100,
    };
  };

  // Batch-fetch real elevations from Google ElevationService (max 512 locations per request)
  const fetchElevations = (locations: google.maps.LatLngLiteral[]): Promise<(number | null)[]> => {
    return new Promise((resolve) => {
      if (!locations.length) { resolve([]); return; }
      const elevationService = new google.maps.ElevationService();
      const CHUNK = 512;
      const chunks: google.maps.LatLngLiteral[][] = [];
      for (let i = 0; i < locations.length; i += CHUNK) chunks.push(locations.slice(i, i + CHUNK));
      Promise.all(
        chunks.map(chunk =>
          new Promise<(number | null)[]>(res => {
            elevationService.getElevationForLocations(
              { locations: chunk },
              (results, status) => {
                if (status === google.maps.ElevationStatus.OK && results) {
                  res(results.map(r => r.elevation != null ? Math.round(r.elevation) : null));
                } else {
                  res(chunk.map(() => null));
                }
              }
            );
          })
        )
      ).then(all => resolve(all.flat()));
    });
  };

  const haversineKm = (a: [number, number], b: [number, number]): number => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const fetchTravelDistances = (
    origin: google.maps.LatLngLiteral,
    destinations: google.maps.LatLngLiteral[]
  ): Promise<(number | null)[]> => {
    return new Promise((resolve) => {
      if (!destinations.length) {
        resolve([]);
        return;
      }

      const service = new google.maps.DistanceMatrixService();
      const CHUNK = 25;
      const chunks: google.maps.LatLngLiteral[][] = [];
      for (let i = 0; i < destinations.length; i += CHUNK) {
        chunks.push(destinations.slice(i, i + CHUNK));
      }

      Promise.all(
        chunks.map(
          (chunk) =>
            new Promise<(number | null)[]>((res) => {
              service.getDistanceMatrix(
                {
                  origins: [origin],
                  destinations: chunk,
                  travelMode: google.maps.TravelMode.WALKING,
                  unitSystem: google.maps.UnitSystem.METRIC,
                },
                (result, status) => {
                  if (
                    status === google.maps.DistanceMatrixStatus.OK &&
                    result?.rows?.[0]?.elements
                  ) {
                    res(
                      result.rows[0].elements.map((el) =>
                        el.status === "OK" ? el.distance?.value ?? null : null
                      )
                    );
                    return;
                  }
                  res(chunk.map(() => null));
                }
              );
            })
        )
      ).then((all) => resolve(all.flat()));
    });
  };

  // Load activities from localStorage and refresh Strava on mount
  useEffect(() => {
    const stored = loadActivities();
    if (stored.length > 0) setActivities(stored);

    const tokenRaw = typeof window !== 'undefined' ? localStorage.getItem('fri_strava_token') : null;
    if (!tokenRaw) return;
    try {
      const token = JSON.parse(tokenRaw) as { access_token: string; expires_at: number };
      if (token.expires_at * 1000 < Date.now()) return;

      // Throttle Strava refresh — skip if fetched within last 5 minutes
      const STRAVA_REFRESH_KEY = 'fri_strava_last_fetch';
      const STRAVA_TTL_MS = 5 * 60 * 1000;
      const lastFetch = parseInt(localStorage.getItem(STRAVA_REFRESH_KEY) ?? '0', 10);
      if (Date.now() - lastFetch < STRAVA_TTL_MS) return;

      fetch(`/api/strava/activities?token=${encodeURIComponent(token.access_token)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((items: Array<{
          id: number; name: string; sport_type: string; start_date: string;
          distance: number; total_elevation_gain: number; moving_time: number;
          average_heartrate?: number; max_heartrate?: number;
          map?: { summary_polyline?: string };
          start_latlng?: [number, number];
        }>) => {
          const incoming: Activity[] = items.map(item => ({
            id: `strava-${item.id}`,
            source: 'strava' as const,
            name: item.name,
            sport_type: item.sport_type,
            start_date: item.start_date,
            distance_km: item.distance / 1000,
            elevation_gain_m: Math.round(item.total_elevation_gain),
            moving_time_s: item.moving_time,
            avg_heartrate: item.average_heartrate,
            max_heartrate: item.max_heartrate,
            external_id: String(item.id),
            start_latlng: item.start_latlng,
            polyline: item.map?.summary_polyline ? decodePolyline(item.map.summary_polyline) : undefined,
          }));
          const merged = mergeActivities(stored, incoming);
          saveActivities(merged);
          setActivities(merged);
          localStorage.setItem(STRAVA_REFRESH_KEY, String(Date.now()));

          // Background-sync all historical Strava activities to Firestore
          // Only runs when the user is authenticated (uid required for Firestore path)
          const uid = authUser?.uid;
          if (uid) {
            const SYNC_KEY = 'fri_strava_last_firestore_sync';
            const SYNC_TTL_MS = 60 * 60 * 1000; // re-sync at most once per hour
            const lastSync = parseInt(localStorage.getItem(SYNC_KEY) ?? '0', 10);
            if (Date.now() - lastSync > SYNC_TTL_MS) {
              fetch('/api/strava/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token.access_token, uid }),
              })
                .then(r => r.ok ? r.json() : Promise.reject())
                .then((result: { synced: number }) => {
                  localStorage.setItem(SYNC_KEY, String(Date.now()));
                  console.info(`Strava → Firestore sync complete: ${result.synced} activities`);
                })
                .catch(() => { /* non-critical, will retry next hour */ });
            }
          }
        })
        .catch(() => { /* Strava fetch failed silently */ });
    } catch {
      // ignore malformed token
    }
  }, []);

  // Fetch real data from Google Maps Places API
  useEffect(() => {
    if (!isLoaded) return;
    if (typeof window === 'undefined' || !window.google) return;

    // --- 3-tier cache strategy ---
    // L1: sessionStorage (30-min TTL, instant, per-tab)
    // L2: Firestore via /api/places/cache (24-h TTL, shared across users in same region)
    // L3: Live Google Maps API calls (expensive, only on full miss)
    const SESSION_CACHE_KEY = 'fri_places_cache';
    const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

    const applyCache = (data: {
      routes: Route[]; mountains: Mountain[]; campsites: Campsite[]; location?: { lat: number; lng: number; address?: string };
    }) => {
      setRoutes(data.routes);
      setFilteredRoutes(data.routes);
      setMountains(data.mountains);
      setCampsites(data.campsites);
      if (data.location) setUserLocation(data.location);
      setIsLoading(false);
    };

    // L1: sessionStorage check
    try {
      const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (cached) {
        const { ts, routes: r, mountains: m, campsites: c, location } = JSON.parse(cached) as {
          ts: number; routes: Route[]; mountains: Mountain[]; campsites: Campsite[]; location?: { lat: number; lng: number; address?: string };
        };
        if (Date.now() - ts < SESSION_TTL_MS && r && m && c) {
          applyCache({ routes: r, mountains: m, campsites: c, location });
          return;
        }
      }
    } catch { /* ignore corrupt cache */ }

    const fetchRoutes = async () => {
      try {
        setIsLoading(true);
        
        // Get user's location first
        const userCoords = await new Promise<[number, number]>((resolve, reject) => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                resolve([position.coords.longitude, position.coords.latitude]);
              },
              (error) => {
                console.warn("Geolocation unavailable, using fallback coordinates.", error);
                // Fallback to San Francisco
                resolve([-122.4194, 37.7749]);
              }
            );
          } else {
            resolve([-122.4194, 37.7749]);
          }
        });

        // Get reverse geocoding for address
        let addressResult = 'Unknown Location';
        try {
          const geocoder = new google.maps.Geocoder();
          addressResult = await new Promise<string>((resolve) => {
            geocoder.geocode(
              { location: { lat: userCoords[1], lng: userCoords[0] } },
              (results, status) => {
                if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
                  resolve(results[0].formatted_address);
                } else {
                  resolve('Unknown Location');
                }
              }
            );
          });
        } catch (err) {
          console.warn('Reverse geocoding unavailable, using Unknown Location.', err);
        }

        const resolvedLocation: { lat: number; lng: number; address?: string } = {
          lat: userCoords[1],
          lng: userCoords[0],
          address: addressResult,
        };

        setUserLocation(resolvedLocation);

        // L2: Firestore shared cache check
        try {
          const cacheRes = await fetch(
            `/api/places/cache?lat=${userCoords[1]}&lng=${userCoords[0]}`
          );
          if (cacheRes.ok) {
            const cacheData = await cacheRes.json() as {
              hit: boolean; routes?: Route[]; mountains?: Mountain[]; campsites?: Campsite[];
            };
            if (cacheData.hit && cacheData.routes && cacheData.mountains && cacheData.campsites) {
              // Write to sessionStorage so next visit in this tab is instant
              try {
                sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
                  ts: Date.now(),
                  routes: cacheData.routes,
                  mountains: cacheData.mountains,
                  campsites: cacheData.campsites,
                  location: resolvedLocation,
                }));
              } catch { /* storage quota */ }
              applyCache({
                routes: cacheData.routes,
                mountains: cacheData.mountains,
                campsites: cacheData.campsites,
                location: resolvedLocation,
              });
              return;
            }
          }
        } catch { /* Firestore cache unavailable, continue to live fetch */ }

        // TODO: Replace with actual backend API calls
        // Fetch routes from backend
        // const routesResponse = await fetch(
        //   `${process.env.NEXT_PUBLIC_API_URL}/api/routes/nearby?lat=${userCoords[1]}&lon=${userCoords[0]}&radius_km=50`
        // );
        // const routesData = await routesResponse.json();
        
        // Fetch mountains using Google Maps Places API
        let mountains: Mountain[] = [];
        try {
          const placesService = new google.maps.places.PlacesService(
            document.createElement('div')
          );

          mountains = await new Promise(async (resolve) => {
            const allMountainPlaces: google.maps.places.PlaceResult[] = [];
            const dedupe = (r: google.maps.places.PlaceResult) =>
              !allMountainPlaces.find(p => p.place_id === r.place_id);

            // textSearch — no radius hard cap, surfaces mountains like
            // Mt. Talamitam, Mt. Lantik, Mt. Apayang that nearbySearch misses
            const textQueries = [
              'mountain',
              'mount',
              'Mt. mountain',
              'peak mountain',
              'summit mountain',
              'volcano mountain',
              'bundok',       // Filipino word for mountain
              'tuloy',        // Filipino for hill/peak
            ];
            await Promise.all(textQueries.map(query =>
              new Promise<void>((res) => {
                placesService.textSearch(
                  {
                    query,
                    location: { lat: userCoords[1], lng: userCoords[0] },
                    radius: 50000,
                  },
                  (results, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                      results.filter(dedupe).forEach(r => allMountainPlaces.push(r));
                    }
                    res();
                  }
                );
              })
            ));

            // nearbySearch as fallback for strictly typed natural_feature entries
            await new Promise<void>((res) => {
              placesService.nearbySearch(
                {
                  location: { lat: userCoords[1], lng: userCoords[0] },
                  radius: 50000,
                  type: 'natural_feature' as string,
                  keyword: 'mountain peak summit volcano',
                },
                (results, status) => {
                  if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    results.filter(dedupe).forEach(r => allMountainPlaces.push(r));
                  }
                  res();
                }
              );
            });

            const PEAK_KEYWORDS = ['mount', 'mt.', 'mt ', 'mountain', 'peak', 'summit', 'hill', 'ridge', 'butte', 'knob', 'crest', 'highland', 'volcano', 'volcan', 'bulkan', 'bundok'];
            const EXCLUDE_TYPES = new Set(['restaurant', 'food', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'lodging', 'store', 'shopping_mall', 'hospital', 'school', 'church', 'place_of_worship', 'gas_station', 'bank']);
            const filteredMountainPlaces = allMountainPlaces
                .filter(place =>
                  place.name &&
                  place.geometry?.location &&
                  PEAK_KEYWORDS.some(kw => place.name!.toLowerCase().includes(kw)) &&
                  !(place.types || []).some(t => EXCLUDE_TYPES.has(t))
                )
                .slice(0, 60);

            // Batch-fetch real summit elevations from Google ElevationService
            const mountainLocations = filteredMountainPlaces.map(p => ({
              lat: p.geometry!.location!.lat(),
              lng: p.geometry!.location!.lng(),
            }));
            const mountainElevations = await fetchElevations(mountainLocations);

            const mountainData = filteredMountainPlaces
              .map((place, index) => {
                const elevation = mountainElevations[index] ?? 0;
                const prominence = Math.round(elevation * 0.28);
                const jumpoff = Math.round(elevation * 0.55);
                const distance = Math.max(2, Math.round((elevation / 450) * 10) / 10);
                return {
                  id: `m${index + 1}`,
                  name: place.name || 'Unknown Mountain',
                  coordinates: [
                    place.geometry!.location!.lng(),
                    place.geometry!.location!.lat(),
                  ] as [number, number],
                  elevation_m: elevation,
                  prominence_m: prominence,
                  trail_class: trailClassFromElevation(elevation),
                  mountain_type: 'peak',
                  place_id: place.place_id,
                  photos: [],
                  jumpoff_elevation: jumpoff,
                  summit_elevation: elevation,
                  strava_segment: generateStravaSegment(place.name || 'Mountain', distance, elevation - jumpoff),
                };
              })
              .filter(m => m.elevation_m >= 100);
            resolve(mountainData);
          });
        } catch (err) {
          console.error('Mountain fetch error:', err);
          mountains = [];
        }

        // Fetch routes — use textSearch (not nearbySearch) so the 50 km hard cap
        // doesn't apply and all Google Maps hiking-tagged areas are surfaced.
        let routes: Route[] = [];
        try {
          const placesService = new google.maps.places.PlacesService(
            document.createElement('div')
          );

          routes = await new Promise(async (resolve) => {
            const allRoutePlaces: google.maps.places.PlaceResult[] = [];
            const dedupe = (r: google.maps.places.PlaceResult) =>
              !allRoutePlaces.find(p => p.place_id === r.place_id);

            // textSearch queries — broad + Filipino-specific terms to surface all hiking areas
            const textQueries = [
              'hiking trail',
              'hiking area',
              'trekking trail',
              'trail park',
              'national park hiking',
              'protected area trail',
              'forest park trail',
              'eco park hiking',
              'nature trail',
              'mountain trail',
              'ridge trail',
              'forest trail',
              'wilderness trail',
              'scenic trail',
              'walking trail',
              'trail head',
              'nature park',
              'protected forest',
              'likha trail',         // Filipino
              'dayhike area',        // Filipino community term
              'jumpoff site',        // Filipino mountaineering term
              'trail Philippines',
              'DENR protected area',
              'provincial park trail',
              'heritage trail',
              'rock climbing area',
              'climbing crag',
              'bouldering area',
              'outdoor climbing wall',
              'rappelling site',
            ];

            // Helper: fetch one textSearch query with up to 3 pages of results
            const fetchTextSearchWithPaging = (query: string) =>
              new Promise<void>((res) => {
                const handlePage = (
                  results: google.maps.places.PlaceResult[] | null,
                  status: google.maps.places.PlacesServiceStatus,
                  pagination: google.maps.places.PlaceSearchPagination | null
                ) => {
                  if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    results.filter(dedupe).forEach(r => allRoutePlaces.push(r));
                    if (pagination?.hasNextPage) {
                      setTimeout(() => pagination.nextPage(), 300);
                    } else {
                      res();
                    }
                  } else {
                    res();
                  }
                };
                placesService.textSearch(
                  {
                    query,
                    location: { lat: userCoords[1], lng: userCoords[0] },
                    radius: 50000,
                  },
                  handlePage
                );
              });

            await Promise.all(textQueries.map(fetchTextSearchWithPaging));

            // Also pull nearbySearch for parks / tourist_attractions / natural_feature tagged as hiking
            const nearbyTypes: string[] = ['park', 'tourist_attraction', 'natural_feature'];
            await Promise.all(nearbyTypes.map(type =>
              new Promise<void>((res) => {
                placesService.nearbySearch(
                  {
                    location: { lat: userCoords[1], lng: userCoords[0] },
                    radius: 50000,
                    type,
                    keyword: 'hiking trail trek dayhike',
                  },
                  (results, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                      results.filter(dedupe).forEach(r => allRoutePlaces.push(r));
                    }
                    res();
                  }
                );
              })
            ));

            const EXCLUDE_ROUTE_TYPES = new Set(['restaurant', 'food', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'lodging', 'store', 'shopping_mall', 'hospital', 'school', 'church', 'place_of_worship', 'gas_station', 'bank']);
            const EXCLUDE_ROUTE_KEYWORDS = ['farm', 'resort', 'hotel', 'casino', 'supermarket', 'mall'];

            const filteredRoutePlaces = allRoutePlaces
              .filter(place =>
                place.name &&
                place.geometry?.location &&
                !(place.types || []).some(t => EXCLUDE_ROUTE_TYPES.has(t)) &&
                !EXCLUDE_ROUTE_KEYWORDS.some(kw => place.name!.toLowerCase().includes(kw))
              )
              .slice(0, 100);

            // Batch-fetch real base (jumpoff) elevations from Google ElevationService
            const routeLocations = filteredRoutePlaces.map(p => ({
              lat: p.geometry!.location!.lat(),
              lng: p.geometry!.location!.lng(),
            }));
            const routeBaseElevations = await fetchElevations(routeLocations);

            const travelDistancesM = await fetchTravelDistances(
              { lat: userCoords[1], lng: userCoords[0] },
              routeLocations
            );

            const terrainProbeLocations = routeLocations.flatMap((loc) => [
              loc,
              { lat: loc.lat + 0.008, lng: loc.lng },
              { lat: loc.lat - 0.008, lng: loc.lng },
              { lat: loc.lat, lng: loc.lng + 0.008 },
              { lat: loc.lat, lng: loc.lng - 0.008 },
            ]);
            const terrainProbeElevations = await fetchElevations(terrainProbeLocations);

            const routeData = filteredRoutePlaces.map((place, index) => {
                const name = place.name!.toLowerCase();
                let activityType = 'hike';
                if (name.includes('bike') || name.includes('cycling') || name.includes('bikepacking')) activityType = 'bike';
                else if (name.includes('climb') || name.includes('crag') || name.includes('boulder') || name.includes('rock wall') || name.includes('rappel')) activityType = 'rock_climb';
                else if (name.includes('tour') || name.includes('road') || name.includes('scenic drive') || name.includes('heritage road') || name.includes('route')) activityType = 'tour';

                let difficulty = 'moderate';
                if (place.rating && place.rating >= 4.5) difficulty = 'easy';
                else if (place.rating && place.rating < 3.5) difficulty = 'hard';

                const fallbackKm = Math.max(
                  1,
                  Math.round(
                    haversineKm(userCoords, [
                      place.geometry!.location!.lng(),
                      place.geometry!.location!.lat(),
                    ]) * 1.15 * 10
                  ) / 10
                );
                const distance = travelDistancesM[index]
                  ? Math.max(0.5, Math.round((travelDistancesM[index]! / 1000) * 10) / 10)
                  : fallbackKm;

                const probeStart = index * 5;
                const probeSamples = terrainProbeElevations
                  .slice(probeStart, probeStart + 5)
                  .filter((v): v is number => v !== null);
                const jumpoff = routeBaseElevations[index] ?? probeSamples[0] ?? 0;
                const localMaxElevation = probeSamples.length > 0 ? Math.max(...probeSamples) : jumpoff;
                const elevationGain = Math.max(50, Math.round(localMaxElevation - jumpoff));

                return {
                  id: `r${index + 1}`,
                  name: place.name || 'Trail',
                  coordinates: [
                    place.geometry!.location!.lng(),
                    place.geometry!.location!.lat(),
                  ] as [number, number],
                  distance_km: distance,
                  elevation_gain_m: elevationGain,
                  difficulty,
                  activity_type: activityType,
                  place_id: place.place_id,
                  photos: [],
                  jumpoff_elevation: jumpoff,
                  summit_elevation: jumpoff + elevationGain,
                  strava_segment: generateStravaSegment(place.name || 'Trail', distance, elevationGain),
                };
              });
            resolve(routeData);
          });
        } catch (err) {
          console.error('Routes fetch error:', err);
          routes = [];
        }

        // Fetch campsites
        let campsites: Campsite[] = [];
        try {
          const placesService = new google.maps.places.PlacesService(
            document.createElement('div')
          );

          campsites = await new Promise(async (resolve) => {
            const allCampsitePlaces: google.maps.places.PlaceResult[] = [];
            const dedupe = (r: google.maps.places.PlaceResult) =>
              !allCampsitePlaces.find(p => p.place_id === r.place_id);

            // textSearch — no radius cap, catches all Google Maps campground tags
            const textQueries = [
              'campground',
              'campsite',
              'camping area',
              'camping site',
              'camp ground',
              'eco camp',
              'glamping',
              'tent camping',
              'campsite park',
            ];
            await Promise.all(textQueries.map(query =>
              new Promise<void>((res) => {
                placesService.textSearch(
                  {
                    query,
                    location: { lat: userCoords[1], lng: userCoords[0] },
                    radius: 50000,
                  },
                  (results, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                      results.filter(dedupe).forEach(r => allCampsitePlaces.push(r));
                    }
                    res();
                  }
                );
              })
            ));

            // nearbySearch with campground type for anything textSearch missed
            await new Promise<void>((res) => {
              placesService.nearbySearch(
                {
                  location: { lat: userCoords[1], lng: userCoords[0] },
                  radius: 50000,
                  type: 'campground' as string,
                },
                (results, status) => {
                  if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    results.filter(dedupe).forEach(r => allCampsitePlaces.push(r));
                  }
                  res();
                }
              );
            });

            const EXCLUDE_CAMP_TYPES = new Set(['restaurant', 'food', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'store', 'shopping_mall', 'hospital', 'school', 'church', 'place_of_worship', 'gas_station', 'bank', 'farm']);
            const EXCLUDE_CAMP_KEYWORDS = ['farm', 'resort', 'hotel', 'motel', 'inn', 'pension', 'hostel'];

            const campsiteData = allCampsitePlaces
              .filter(place =>
                place.name &&
                place.geometry?.location &&
                !(place.types || []).some(t => EXCLUDE_CAMP_TYPES.has(t)) &&
                !EXCLUDE_CAMP_KEYWORDS.some(kw => place.name!.toLowerCase().includes(kw))
              )
              .slice(0, 60)
              .map((place, index) => ({
                id: `c${index + 1}`,
                name: place.name || 'Campsite',
                coordinates: [
                  place.geometry!.location!.lng(),
                  place.geometry!.location!.lat(),
                ] as [number, number],
                type: 'campground',
                rating: place.rating,
                amenities: [],
                place_id: place.place_id,
                photos: [],
              }));
            resolve(campsiteData);
          });
        } catch (err) {
          console.error('Campsite fetch error:', err);
          campsites = [];
        }

        setRoutes(routes);
        setFilteredRoutes(routes);
        setMountains(mountains);
        setCampsites(campsites);
        setIsLoading(false);

        // Write live results to both caches so future visitors skip the API calls
        const cachePayload = {
          routes, mountains, campsites, location: resolvedLocation,
          ts: Date.now(),
        };
        try {
          sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cachePayload));
        } catch { /* storage quota */ }
        fetch('/api/places/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: userCoords[1],
            lng: userCoords[0],
            routes,
            mountains,
            campsites,
            location: resolvedLocation,
          }),
        }).catch(() => { /* non-critical */ });
      } catch (err) {
        setError("Failed to load routes");
        setIsLoading(false);
      }
    };

    fetchRoutes();
  }, [isLoaded]);

  const handleFilterChange = (filters: FilterState) => {
    let filtered = [...routes];

    // Filter by activity type
    if (filters.activityTypes.length > 0) {
      filtered = filtered.filter((route) =>
        filters.activityTypes.includes(route.activity_type)
      );
    }

    // Filter by difficulty
    if (filters.difficulty.length > 0) {
      filtered = filtered.filter((route) =>
        filters.difficulty.includes(route.difficulty)
      );
    }

    // Filter by distance
    filtered = filtered.filter((route) => route.distance_km <= filters.maxDistance);

    // Filter by elevation
    filtered = filtered.filter(
      (route) =>
        route.elevation_gain_m >= filters.minElevation &&
        route.elevation_gain_m <= filters.maxElevation
    );

    setFilteredRoutes(filtered);
  };

  const handleRouteClick = (route: Route) => {
    setSelectedDetails({ type: 'route', data: route });
  };

  const handleMountainClick = (mountain: Mountain) => {
    setSelectedDetails({ type: 'mountain', data: mountain });
  };

  const handleCampsiteClick = (campsite: Campsite) => {
    setSelectedDetails({ type: 'campsite', data: campsite });
  };

  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-slate-950">
      {/* Ambient background orbs */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <div className="orb-float absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="orb-float-slow absolute -bottom-40 -right-20 h-80 w-80 rounded-full bg-emerald-600/15 blur-3xl" />
        <div className="orb-float-alt absolute bottom-1/3 left-1/3 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl" />
      </div>
      {/* Header */}
      <header className="relative z-20 flex h-14 flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-slate-950/95 backdrop-blur px-5">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="glow-pulse flex h-8 w-8 items-center justify-center rounded-xl overflow-hidden shadow-lg shadow-blue-900/40">
            <img src="/icon.svg" alt="Fit Ready IQ" className="h-8 w-8" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="brand-shimmer text-[15px] font-bold tracking-tight">Fit Ready IQ</span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-blue-400 ring-1 ring-blue-500/30">
              Beta
            </span>
          </div>
        </div>

        {/* Nav actions */}
        <div className="flex items-center gap-2">
          <button
            aria-label="Toggle sidebar"
            onClick={() => setSidebarOpen(s => !s)}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsDeviceModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <Watch className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Connect Devices</span>
          </button>
          <Link
            href="/admin/settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
            title="Admin settings"
          >
            <Shield className="h-4 w-4" />
          </Link>

          {isFirebaseAuthConfigured() ? (
            authUser ? (
              <button
                onClick={() => setIsProfileModalOpen(true)}
                disabled={authBusy}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
                title="View profile"
              >
                {authUser.photoURL ? (
                  <Image
                    src={authUser.photoURL}
                    alt="Profile"
                    width={20}
                    height={20}
                    className="h-5 w-5 rounded-full border border-white/20"
                    unoptimized
                  />
                ) : (
                  <UserIcon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{authUser.displayName ?? "Signed in"}</span>
              </button>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                disabled={authBusy}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <UserIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign in with Google</span>
              </button>
            )
          ) : (
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
              title="Firebase Auth not configured"
            >
              <UserIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Connect Devices Modal */}
      <ConnectDevicesModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        onActivitiesLoaded={(acts) => {
          const merged = mergeActivities(activities, acts);
          saveActivities(merged);
          setActivities(merged);
        }}
      />

      {/* Profile Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={authUser}
        activities={activities}
        onSignOut={() => {
          setIsProfileModalOpen(false);
          handleGoogleSignOut();
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Sidebar */}
        <aside className={`sidebar-scroll flex flex-col overflow-y-auto border-r border-white/[0.06] bg-slate-900/98 backdrop-blur-xl p-3 gap-2.5 transition-transform duration-300 ease-out fixed inset-y-0 left-0 z-30 w-[min(320px,85vw)] md:relative md:inset-auto md:z-auto md:w-80 md:flex-shrink-0 ${sidebarOpen ? 'translate-x-0 shadow-2xl shadow-black/60' : '-translate-x-full md:translate-x-0'}`}>
          {/* Current Location */}
          {userLocation && (
            <button
              type="button"
              onClick={() => focusUserLocationRef.current?.()}
              className="flex w-full items-center gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2.5 text-left transition-all hover:border-blue-500/40 hover:bg-blue-500/20"
              title="Focus map on your location"
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 shadow-md shadow-blue-900/50">
                <MapPin className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-blue-100">
                  {userLocation.address || 'Getting location…'}
                </p>
                <p className="font-tabular text-[10px] text-blue-400/70">
                  {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                </p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search routes, peaks, camps…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-[13px] text-slate-200 placeholder-slate-500 outline-none transition-all focus:border-blue-500/50 focus:bg-white/8 focus:ring-2 focus:ring-blue-500/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-2.5 my-auto flex items-center text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex rounded-xl border border-white/[0.08] bg-white/5 p-1 gap-0.5 flex-wrap">
            {([
              { id: 'routes',     label: 'Routes',    Icon: Route,     activeClass: 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' },
              { id: 'mountains',  label: 'Peaks',     Icon: Mountain,  activeClass: 'bg-slate-600 text-white shadow-lg shadow-slate-900/50' },
              { id: 'campsites',  label: 'Camps',     Icon: Tent,      activeClass: 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' },
              { id: 'history',    label: 'History',   Icon: Clock,     activeClass: 'bg-violet-600 text-white shadow-lg shadow-violet-900/50' },
              ...(authUser ? [{ id: 'saved' as const, label: 'Saved', Icon: Bookmark, activeClass: 'bg-amber-600 text-white shadow-lg shadow-amber-900/50' }] : []),
            ] as const).map(tab => {
              const count = tab.id === 'routes'
                ? filteredRoutes.filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())).length
                : tab.id === 'mountains'
                ? mountains.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())).length
                : tab.id === 'campsites'
                ? campsites.filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())).length
                : tab.id === 'saved'
                ? savedPlaces.filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())).length
                : activities.filter(a => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase())).length;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition-all ${
                    activeTab === tab.id
                      ? tab.activeClass
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <tab.Icon className="h-3 w-3" />
                  {tab.label}
                  {count > 0 && (
                    <span className={`rounded-full px-1.5 text-[9px] font-bold ${
                      activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-400'
                    }`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filters — only for routes tab */}
          {activeTab === 'routes' && <RouteFilter onFilterChange={handleFilterChange} />}

          {/* Lists */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/5 p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="skeleton h-14 w-14 flex-shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-3.5 w-3/4 rounded-md" />
                      <div className="skeleton h-2.5 w-1/2 rounded-md" />
                      <div className="skeleton h-2.5 w-2/3 rounded-md" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <p className="text-xs font-medium text-red-400">{error}</p>
            </div>
          ) : (
            <div className="space-y-1.5">

              {/* ── Routes Tab ── */}
              {activeTab === 'routes' && (() => {
                const list = filteredRoutes.filter(r =>
                  !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (list.length === 0) return (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
                    <Search className="h-6 w-6 text-slate-600" />
                    <p className="text-xs font-medium text-slate-500">No routes found</p>
                    <p className="text-[10px] text-slate-600">Try adjusting your filters</p>
                  </div>
                );
                const difficultyStyle: Record<string, { pill: string; dot: string; bar: string }> = {
                  easy:     { pill: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20', dot: 'bg-emerald-400', bar: 'bg-emerald-500' },
                  moderate: { pill: 'bg-amber-500/15 text-amber-400 ring-amber-500/20',       dot: 'bg-amber-400',   bar: 'bg-amber-500' },
                  hard:     { pill: 'bg-red-500/15 text-red-400 ring-red-500/20',             dot: 'bg-red-400',     bar: 'bg-red-500' },
                };
                const activityIcons: Record<string, React.ReactNode> = {
                  bike: <Route className="h-3.5 w-3.5" />,
                  hike: <Mountain className="h-3.5 w-3.5" />,
                  tour: <Route className="h-3.5 w-3.5" />,
                  run:  <TrendingUp className="h-3.5 w-3.5" />,
                };
                return list.map((route, idx) => {
                  const ds = difficultyStyle[route.difficulty] ?? { pill: 'bg-white/10 text-slate-400 ring-white/10', dot: 'bg-slate-400', bar: 'bg-slate-500' };
                  const thumb = route.photos?.[0];
                  return (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => handleRouteClick(route)}
                      className="card-enter group w-full rounded-xl border border-white/[0.07] bg-white/5 text-left transition-all hover:border-blue-500/30 hover:bg-blue-500/10 active:scale-[0.99]"
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <div className="flex items-stretch gap-0">
                        {/* Thumbnail */}
                        <div className="relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-l-xl">
                          {thumb ? (
                            <Image src={thumb} alt={route.name} fill className="object-cover transition-transform group-hover:scale-105" sizes="72px" unoptimized />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-900/60 to-slate-800">
                              {activityIcons[route.activity_type] ?? <Mountain className="h-5 w-5 text-blue-400/60" />}
                            </div>
                          )}
                          <div className={`absolute bottom-0 left-0 h-1 w-full ${ds.bar} opacity-80`} />
                        </div>
                        {/* Content */}
                        <div className="min-w-0 flex-1 px-3 py-2.5">
                          <div className="flex items-start justify-between gap-1">
                            <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-white">{route.name}</p>
                            {authUser && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleSave({ id: route.id, type: 'route', name: route.name, coordinates: route.coordinates, difficulty: route.difficulty, activity_type: route.activity_type, distance_km: route.distance_km, elevation_gain_m: route.elevation_gain_m, photos: route.photos, place_id: route.place_id }); }}
                                className="flex-shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:text-amber-400"
                                aria-label={isSaved(route.id) ? 'Unsave route' : 'Save route'}
                              >
                                <Bookmark className={`h-3.5 w-3.5 ${isSaved(route.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                              </button>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${ds.pill}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${ds.dot}`} />
                              {route.difficulty}
                            </span>
                            <span className="text-[9px] uppercase tracking-wider text-slate-500">{route.activity_type}</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2.5 text-[11px]">
                            <span className="font-tabular font-semibold text-slate-300">{route.distance_km.toFixed(1)} km</span>
                            <span className="text-white/15">|</span>
                            <span className="flex items-center gap-0.5 text-slate-400">
                              <ArrowUpDown className="h-2.5 w-2.5" />
                              <span className="font-tabular">{route.elevation_gain_m} m</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                });
              })()}

              {/* ── Mountains Tab ── */}
              {activeTab === 'mountains' && (() => {
                const list = mountains.filter(m =>
                  !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (list.length === 0) return (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
                    <Mountain className="h-6 w-6 text-slate-600" />
                    <p className="text-xs font-medium text-slate-500">No mountains found</p>
                  </div>
                );
                return list.map((mountain, idx) => (
                  <button
                    key={mountain.id}
                    type="button"
                    onClick={() => handleMountainClick(mountain)}
                    className="card-enter group w-full rounded-xl border border-white/[0.07] bg-white/5 px-3.5 py-3 text-left transition-all hover:border-slate-500/40 hover:bg-white/[0.08] active:scale-[0.99]"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-white">{mountain.name}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {authUser && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleSave({ id: mountain.id, type: 'mountain', name: mountain.name, coordinates: mountain.coordinates, elevation_m: mountain.elevation_m, prominence_m: mountain.prominence_m, mountain_type: mountain.mountain_type, photos: mountain.photos, place_id: mountain.place_id }); }}
                            className="rounded p-0.5 text-slate-500 transition-colors hover:text-amber-400"
                            aria-label={isSaved(mountain.id) ? 'Unsave peak' : 'Save peak'}
                          >
                            <Bookmark className={`h-3.5 w-3.5 ${isSaved(mountain.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>
                        )}
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10">
                          <Mountain className="h-3.5 w-3.5 text-slate-400" />
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300 ring-1 ring-white/10">
                        {mountain.mountain_type}
                      </span>
                      {mountain.trail_class && (
                        <span className="inline-flex items-center rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/30">
                          {mountain.trail_class}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px]">
                      <span className="font-tabular font-semibold text-slate-200">{mountain.elevation_m} m</span>
                      {mountain.prominence_m ? (
                        <><span className="text-white/20">·</span>
                        <span className="font-tabular text-slate-400">{mountain.prominence_m} m prom</span></>
                      ) : null}
                    </div>
                  </button>
                ));
              })()}

              {/* ── Campsites Tab ── */}
              {activeTab === 'campsites' && (() => {
                const list = campsites.filter(c =>
                  !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (list.length === 0) return (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
                    <Tent className="h-6 w-6 text-slate-600" />
                    <p className="text-xs font-medium text-slate-500">No campsites found</p>
                  </div>
                );
                return list.map((campsite, idx) => (
                  <button
                    key={campsite.id}
                    type="button"
                    onClick={() => handleCampsiteClick(campsite)}
                    className="card-enter group w-full rounded-xl border border-white/[0.07] bg-white/5 px-3.5 py-3 text-left transition-all hover:border-emerald-500/30 hover:bg-emerald-500/[0.07] active:scale-[0.99]"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-emerald-300">{campsite.name}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {authUser && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleSave({ id: campsite.id, type: 'campsite', name: campsite.name, coordinates: campsite.coordinates, rating: campsite.rating, photos: campsite.photos, place_id: campsite.place_id }); }}
                            className="rounded p-0.5 text-slate-500 transition-colors hover:text-amber-400"
                            aria-label={isSaved(campsite.id) ? 'Unsave campsite' : 'Save campsite'}
                          >
                            <Bookmark className={`h-3.5 w-3.5 ${isSaved(campsite.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>
                        )}
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/15">
                          <Tent className="h-3.5 w-3.5 text-emerald-400" />
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-emerald-900/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/20">
                        {campsite.type}
                      </span>
                      {campsite.rating && (
                        <span className="font-tabular text-[10px] text-amber-400">
                          * {campsite.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </button>
                ));
              })()}

              {/* ── History Tab ── */}
              {activeTab === 'history' && (() => {
                const list = activities.filter(a =>
                  !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (list.length === 0) return (
                  <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
                    <Clock className="mx-auto h-5 w-5 text-slate-500" />
                    <p className="mt-2 text-xs text-slate-400">No activities yet</p>
                    <p className="mt-1 text-[10px] text-slate-500">Connect Strava or import GPX files</p>
                    <button
                      onClick={() => setIsDeviceModalOpen(true)}
                      className="mt-3 rounded-md bg-violet-600 px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700"
                    >
                      Connect Devices
                    </button>
                  </div>
                );
                return list.map(activity => {
                  const sourceBadge: Record<string, string> = {
                    strava: 'bg-orange-100 text-orange-700',
                    coros: 'bg-blue-100 text-blue-700',
                    garmin: 'bg-sky-100 text-sky-700',
                    komoot: 'bg-green-100 text-green-700',
                  };
                  const sourceLabel: Record<string, string> = {
                    strava: 'Strava', coros: 'COROS', garmin: 'Garmin', komoot: 'Komoot',
                  };
                  const h = Math.floor(activity.moving_time_s / 3600);
                  const m = Math.floor((activity.moving_time_s % 3600) / 60);
                  const duration = h > 0 ? `${h}h ${m}m` : `${m}m`;
                  return (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => setSelectedDetails({ type: 'activity', data: activity })}
                      className="group w-full rounded-lg border border-white/[0.07] bg-white/5 px-3.5 py-3 text-left transition-colors hover:border-violet-500/40 hover:bg-violet-900/10"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-[13px] font-semibold text-slate-200 group-hover:text-violet-300">{activity.name}</p>
                        <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${sourceBadge[activity.source] ?? 'bg-slate-700 text-slate-300'}`}>
                          {sourceLabel[activity.source] ?? activity.source}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] capitalize text-slate-500">{activity.sport_type} · {new Date(activity.start_date).toLocaleDateString()}</p>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                        <span>{activity.distance_km.toFixed(1)} km</span>
                        <span>↑ {activity.elevation_gain_m} m</span>
                        <span>{duration}</span>
                      </div>
                    </button>
                  );
                });
              })()}

              {/* ── Saved Tab ── */}
              {activeTab === 'saved' && (() => {
                const list = savedPlaces.filter(p =>
                  !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (!authUser) return null;
                if (list.length === 0) return (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
                    <Bookmark className="h-6 w-6 text-slate-600" />
                    <p className="text-xs font-medium text-slate-500">No saved places yet</p>
                    <p className="text-[10px] text-slate-600">Tap the bookmark icon on any route, peak, or campsite</p>
                  </div>
                );
                const typeIcon: Record<string, React.ReactNode> = {
                  route:    <Route className="h-3.5 w-3.5 text-blue-400" />,
                  mountain: <Mountain className="h-3.5 w-3.5 text-slate-300" />,
                  campsite: <Tent className="h-3.5 w-3.5 text-emerald-400" />,
                };
                const typeColor: Record<string, string> = {
                  route:    'border-blue-500/30 hover:bg-blue-500/10',
                  mountain: 'border-slate-500/30 hover:bg-white/[0.08]',
                  campsite: 'border-emerald-500/30 hover:bg-emerald-500/[0.07]',
                };
                return list.map((place, idx) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => {
                      if (place.type === 'route') {
                        const r = routes.find(x => x.id === place.id);
                        if (r) handleRouteClick(r);
                      } else if (place.type === 'mountain') {
                        const m = mountains.find(x => x.id === place.id);
                        if (m) handleMountainClick(m);
                      } else {
                        const c = campsites.find(x => x.id === place.id);
                        if (c) handleCampsiteClick(c);
                      }
                    }}
                    className={`card-enter group w-full rounded-xl border border-white/[0.07] bg-white/5 px-3.5 py-3 text-left transition-all active:scale-[0.99] ${typeColor[place.type] ?? ''}`}
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-white">{place.name}</p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleSave(place); }}
                          className="rounded p-0.5 text-amber-400 transition-colors hover:text-slate-400"
                          aria-label="Unsave"
                        >
                          <Bookmark className="h-3.5 w-3.5 fill-amber-400" />
                        </button>
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10">
                          {typeIcon[place.type]}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="capitalize">{place.type}</span>
                      {place.elevation_m ? <><span className="text-white/20">·</span><span className="font-tabular">{place.elevation_m} m</span></> : null}
                      {place.distance_km ? <><span className="text-white/20">·</span><span className="font-tabular">{place.distance_km.toFixed(1)} km</span></> : null}
                      {place.difficulty  ? <><span className="text-white/20">·</span><span className="capitalize">{place.difficulty}</span></> : null}
                    </div>
                  </button>
                ));
              })()}

            </div>
          )}
        </aside>

        {/* Map View */}
        <div className="flex-1">
          <MapView 
            routes={filteredRoutes} 
            mountains={mountains}
            campsites={campsites}
            savedPlaces={savedPlaces}
            userLocation={userLocation ? [userLocation.lng, userLocation.lat] : undefined}
            isLoaded={isLoaded}
            loadError={loadError}
            onRouteClick={handleRouteClick}
            onMountainClick={handleMountainClick}
            onCampsiteClick={handleCampsiteClick}
            onFocusUserLocation={(fn) => { focusUserLocationRef.current = fn; }}
            activityPolylines={activities
              .filter(a => a.polyline && a.polyline.length > 0)
              .map(a => ({ id: a.id, coords: a.polyline!, source: a.source, name: a.name }))}
          />
        </div>
      </div>

      <DetailsModal
        isOpen={selectedDetails !== null}
        onClose={() => setSelectedDetails(null)}
        data={
          selectedDetails?.type === 'route'
            ? {
                type: 'route' as const,
                id: selectedDetails.data.id,
                name: selectedDetails.data.name,
                coordinates: selectedDetails.data.coordinates,
                distance_km: selectedDetails.data.distance_km,
                elevation_gain_m: selectedDetails.data.elevation_gain_m,
                difficulty: selectedDetails.data.difficulty,
                activity_type: selectedDetails.data.activity_type,
                photos: selectedDetails.data.photos,
                place_id: selectedDetails.data.place_id,
                jumpoff_elevation: selectedDetails.data.jumpoff_elevation,
                summit_elevation: selectedDetails.data.summit_elevation,
                strava_segment: selectedDetails.data.strava_segment,
              }
            : selectedDetails?.type === 'mountain'
            ? {
                type: 'mountain' as const,
                id: selectedDetails.data.id,
                name: selectedDetails.data.name,
                coordinates: selectedDetails.data.coordinates,
                elevation_m: selectedDetails.data.elevation_m,
                prominence_m: selectedDetails.data.prominence_m || 0,
                mountain_type: selectedDetails.data.mountain_type || 'peak',
                jumpoff_elevation: selectedDetails.data.jumpoff_elevation,
                summit_elevation: selectedDetails.data.summit_elevation,
                photos: selectedDetails.data.photos,
                place_id: selectedDetails.data.place_id,
                strava_segment: selectedDetails.data.strava_segment,
              }
            : selectedDetails?.type === 'campsite'
            ? {
                type: 'campsite' as const,
                id: selectedDetails.data.id,
                name: selectedDetails.data.name,
                coordinates: selectedDetails.data.coordinates,
                campsite_type: selectedDetails.data.type || 'campsite',
                rating: selectedDetails.data.rating,
                amenities: selectedDetails.data.amenities || [],
                photos: selectedDetails.data.photos,
                place_id: selectedDetails.data.place_id,
              }
            : selectedDetails?.type === 'activity'
            ? {
                type: 'activity' as const,
                id: selectedDetails.data.id,
                name: selectedDetails.data.name,
                source: selectedDetails.data.source,
                sport_type: selectedDetails.data.sport_type,
                start_date: selectedDetails.data.start_date,
                distance_km: selectedDetails.data.distance_km,
                elevation_gain_m: selectedDetails.data.elevation_gain_m,
                moving_time_s: selectedDetails.data.moving_time_s,
                avg_heartrate: selectedDetails.data.avg_heartrate,
                max_heartrate: selectedDetails.data.max_heartrate,
                external_id: selectedDetails.data.external_id,
                coordinates: selectedDetails.data.start_latlng,
              }
            : null
        }
      />
      <ChatBot />
    </main>
  );
}




