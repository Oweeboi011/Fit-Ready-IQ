'use client';

// Fit Ready IQ - Main Page
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useJsApiLoader } from '@react-google-maps/api';
import { type User as FirebaseUser } from 'firebase/auth';
import {
  Mountain,
  Tent,
  Route,
  Search,
  X,
  Watch,
  User as UserIcon,
  ChevronRight,
  MapPin,
  TrendingUp,
  ArrowUpDown,
  Clock,
  Menu,
  Bookmark,
  Shield,
  MapPinOff,
} from 'lucide-react';
import Link from 'next/link';
import RouteFilter, { DEFAULT_FILTERS, type FilterState } from '@/components/RouteFilter';
import ConnectDevicesModal from '@/components/ConnectDevicesModal';
import DetailsModal from '@/components/DetailsModal';
import ProfileModal from '@/components/ProfileModal';
import { getValidStravaToken } from '@/lib/stravaAuth';
import { haversineDistanceKm } from '@/lib/gpxParser';
import {
  type Activity,
  type ActivityPolyline,
  loadActivities,
  saveActivities,
  mergeActivities,
  SOURCE_BG,
  SOURCE_LABELS,
  formatDuration,
  formatActivityType,
} from '@/lib/activityTypes';
import { decodePolyline } from '@/lib/polylineDecoder';
import {
  isFirebaseAuthConfigured,
  onFirebaseAuthStateChanged,
  signInWithGoogle,
  signInWithApple,
  signOutFirebaseUser,
} from '@/lib/firebaseClient';
import ChatBot from '@/components/ChatBot';
import { ReadinessBadge } from '@/components/ReadinessPanel';
import { computeReadiness } from '@/lib/readiness';
import { WeatherAlertBadgeNear } from '@/components/WeatherAlertBadge';
import { recordWeatherAlerts } from '@/lib/weatherAlertCache';
import { fetchElevationBatch } from '@/lib/elevation';
import { NavDock, type DockAlert, type DockWeather } from '@/components/NavDock';
import { MapDirections, type DirectionsTarget } from '@/components/MapDirections';
import { RoutePlanner } from '@/components/RoutePlanner';
import AdminModal from '@/components/admin/AdminModal';
import RoadmapModal from '@/components/RoadmapModal';
import type { PlannerWaypoint } from '@/lib/gpxBuilder';
import { usePlannerRoute } from '@/lib/usePlannerRoute';
import type { Advisory } from '@/app/api/advisories/route';
import {
  layerForActivityType,
  readHiddenLayers,
  writeHiddenLayers,
  type MapLayer,
} from '@/lib/mapLayers';
import MapLoadingOverlay from '@/components/MapLoadingOverlay';
import { useSavedPlaces, type SavedPlace } from '@/lib/useSavedPlaces';
import { useAdminGate } from '@/lib/useAdminGate';
import { isPlanId, rememberSelectedPlan } from '@/lib/plans';
import { decodePlaceRef, encodePlaceRef, type PlaceRef } from '@/lib/placeUrl';
import {
  DIFFICULTY_LABELS,
  classifyDifficulty,
  normaliseDifficulty,
  type Difficulty,
} from '@/lib/routeDifficulty';
import { locationProblemMessage, useUserLocation } from '@/lib/useUserLocation';
import { buttonGhost, buttonPrimary, buttonSecondary, buttonSize } from '@/lib/ui';

const libraries: ('places' | 'geometry')[] = ['places', 'geometry'];

// Dynamically import MapView to avoid SSR issues with the Google Maps SDK
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

interface Route {
  id: string;
  name: string;
  coordinates: [number, number];
  distance_km: number;
  /** `null` when the Elevation API could not tell us. Never invent a value. */
  elevation_gain_m: number | null;
  difficulty: Difficulty;
  activity_type: string;
  polyline?: [number, number][];
  photos?: string[];
  place_id?: string;
  distance_from_user_km?: number;
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

// Yosemite Decimal System trail class derived from summit elevation. Without a
// known elevation there is no class to give — say so rather than guess Class 1.
function trailClassFromElevation(elevationM: number | null): string | undefined {
  if (elevationM == null) return undefined;
  if (elevationM >= 3000) return 'Class 4-5';
  if (elevationM >= 2000) return 'Class 3-4';
  if (elevationM >= 1000) return 'Class 2-3';
  if (elevationM >= 500) return 'Class 2';
  return 'Class 1';
}

interface Mountain {
  id: string;
  name: string;
  coordinates: [number, number];
  /** `null` when the Elevation API could not tell us. Never invent a value. */
  elevation_m: number | null;
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

/**
 * Firebase error codes → something a hiker can act on.
 *
 * The misconfiguration codes (`unauthorized-domain`, `operation-not-allowed`)
 * describe a mistake we made, not one the user can fix, so they get an apology
 * rather than instructions for a console they cannot open. The real cause still
 * reaches us through `console.error`.
 */
function signInErrorMessage(code: string, provider: 'Google' | 'Apple'): string {
  switch (code) {
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/network-request-failed':
      return 'Network trouble during sign-in. Check your connection and try again.';
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
      return `${provider} sign-in isn't available right now. We're on it — try another sign-in option.`;
    case 'auth/account-exists-with-different-credential':
      return 'That email is already registered with a different sign-in method.';
    default:
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return "You're offline. Reconnect and try again.";
      }
      return `${provider} sign-in didn't complete. Try again.`;
  }
}

/**
 * How far from the user we are willing to call a place "nearby".
 *
 * Google's `textSearch` treats `location` + `radius` as a *bias*, not a filter,
 * so a query for hiking trails run from Manila reliably returns campgrounds in
 * California. Those results then landed in the sidebar and, worse, in the map's
 * `fitBounds`, which is why the map opened zoomed out to the whole planet.
 * Nothing upstream enforces this, so we enforce it here.
 */
const SEARCH_RADIUS_KM = 80;

/** Drop anything the Places API returned that is not actually near the user. */
function withinSearchRadius<T extends { coordinates: [number, number] }>(
  items: T[],
  from: { lat: number; lng: number } | null
): T[] {
  if (!from) return items;
  return items.filter((item) => {
    const [lng, lat] = item.coordinates;
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    return haversineDistanceKm(from.lat, from.lng, lat, lng) <= SEARCH_RADIUS_KM;
  });
}

type TabId = 'routes' | 'mountains' | 'campsites' | 'history' | 'saved';

const TAB_IDS: readonly TabId[] = ['routes', 'mountains', 'campsites', 'history', 'saved'];

/** Long enough to notice and act on, short enough not to linger. */
const SAVE_TOAST_MS = 5000;

/**
 * Schema version for cached place payloads.
 *
 * Both cache tiers store whole `Route`/`Mountain`/`Campsite` objects, so a
 * change to what a field *means* silently keeps serving the old meaning until
 * the entry expires — and the Firestore tier is shared, so one stale entry
 * feeds every visitor to that region for 24 hours. That is how a hardcoded
 * "50 m" elevation floor kept appearing long after the code that produced it
 * was deleted.
 *
 * Bump this whenever the shape or the semantics of a cached field change.
 *
 * v2 — elevation may be null, difficulty derived from terrain not star rating.
 */
const PLACES_CACHE_VERSION = 2;

const FIRST_RUN_HINT_KEY = 'fri_seen_intro';
const FILTERS_KEY = 'fri_filters';
const ACTIVE_TAB_KEY = 'fri_active_tab';

type CollectionName = 'routes' | 'mountains' | 'campsites';

const COLLECTION_LABELS: Record<CollectionName, string> = {
  routes: 'routes',
  mountains: 'peaks',
  campsites: 'campsites',
};

export default function Home() {
  // The shield only renders for allowlisted accounts; the API verifies again.
  const adminGate = useAdminGate();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  // Guards the save effect so it does not immediately overwrite stored
  // preferences with the defaults before the restore has run.
  const [preferencesRestored, setPreferencesRestored] = useState(false);
  const [mountains, setMountains] = useState<Mountain[]>([]);
  const [campsites, setCampsites] = useState<Campsite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedCollections, setFailedCollections] = useState<CollectionName[]>([]);
  const [placesAttempt, setPlacesAttempt] = useState(0);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('routes');
  const focusUserLocationRef = useRef<() => void>(() => {});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<
    | { type: 'route'; data: Route }
    | { type: 'mountain'; data: Mountain }
    | { type: 'campsite'; data: Campsite }
    | { type: 'activity'; data: Activity }
    | null
  >(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [stravaSyncState, setStravaSyncState] = useState<'idle' | 'syncing' | 'failed'>('idle');
  // True when the Elevation API refused a request, so the UI can say elevations
  // are missing instead of quietly showing whatever the fallbacks produced.
  const [elevationUnavailable, setElevationUnavailable] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const { savedPlaces, isSaved, toggleSave, saveError, dismissSaveError } = useSavedPlaces(
    authUser?.uid ?? null
  );

  // One geolocation call for the whole app. `source` tells us whether these
  // coordinates are a real fix or a guess, which decides whether the map is
  // allowed to draw a "Your Location" marker on them.
  const {
    location: userLocation,
    source: locationSource,
    status: locationStatus,
    problem: locationProblem,
    isPrecise: hasPreciseLocation,
    setLocation: saveAndSetUserLocation,
    retry: retryLocation,
  } = useUserLocation();
  const isLocating = locationStatus === 'locating';
  const [locationNoticeDismissed, setLocationNoticeDismissed] = useState(false);
  const [showFirstRunHint, setShowFirstRunHint] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showNativeControls, setShowNativeControls] = useState(true);
  const [showNativePoi, setShowNativePoi] = useState(true);
  const [showWeatherRadar, setShowWeatherRadar] = useState(false);
  // Directions render on our own map; "Get Directions" no longer hands the
  // user to another product mid-task.
  const [directionsTarget, setDirectionsTarget] = useState<DirectionsTarget | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

  // Route planner. Waypoints live here so the map can draw them and the panel
  // can list them without either owning the other.
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const [plannerWaypoints, setPlannerWaypoints] = useState<PlannerWaypoint[]>([]);

  const addWaypoint = useCallback((coordinates: [number, number], name?: string) => {
    const id = `wp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPlannerWaypoints((prev) => [
      ...prev,
      { id, coordinates, name: name ?? `Waypoint ${prev.length + 1}`, elevation: null },
    ]);

    // Fill in the real height behind the drop, so the plan reports ascent and
    // the exported GPX carries <ele>. Without this the field was never set and
    // every export was flat.
    fetchElevationBatch([{ lat: coordinates[1], lng: coordinates[0] }]).then(({ values }) => {
      const elevation = values[0];
      if (elevation == null) return;
      setPlannerWaypoints((prev) => prev.map((w) => (w.id === id ? { ...w, elevation } : w)));
    });
  }, []);

  const plannerRoute = usePlannerRoute(plannerWaypoints, plannerOpen);

  const moveWaypoint = useCallback((id: string, direction: -1 | 1) => {
    setPlannerWaypoints((prev) => {
      const index = prev.findIndex((w) => w.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);
  // Owned here so the dock's toggles and the map cannot disagree about what is
  // drawn. Restored in an effect, never during render.
  const [hiddenLayers, setHiddenLayers] = useState<MapLayer[]>([]);

  useEffect(() => {
    const stored = readHiddenLayers();
    if (stored.length > 0) setHiddenLayers(stored);
  }, []);

  const toggleLayer = useCallback((layer: MapLayer) => {
    setHiddenLayers((prev) => {
      const next = prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer];
      writeHiddenLayers(next);
      return next;
    });
  }, []);
  /** A place named by `?place=` that we cannot open until its data has loaded. */
  const [pendingPlaceRef, setPendingPlaceRef] = useState<PlaceRef | null>(null);
  const [saveToast, setSaveToast] = useState<{ message: string; undo: () => void } | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(FIRST_RUN_HINT_KEY)) setShowFirstRunHint(true);
    } catch {
      /* can't remember it was seen, so don't show it at all */
    }
  }, []);

  const dismissFirstRunHint = () => {
    setShowFirstRunHint(false);
    try {
      localStorage.setItem(FIRST_RUN_HINT_KEY, '1');
    } catch {
      /* it will show once more; not worth failing over */
    }
  };

  // Annotate each route with its distance from `from`, then sort nearest-first.
  // Route.coordinates is [lng, lat] (GeoJSON order); `from` is {lat, lng}.
  const sortRoutesByDistance = (
    list: Route[],
    from: { lat: number; lng: number } | null
  ): Route[] => {
    if (!from) return list;
    return list
      .map((route) => ({
        ...route,
        distance_from_user_km: haversineDistanceKm(
          from.lat,
          from.lng,
          route.coordinates[1],
          route.coordinates[0]
        ),
      }))
      .sort((a, b) => a.distance_from_user_km - b.distance_from_user_km);
  };

  // Filters and the chosen tab used to reset on every reload, so a user who
  // narrowed down to hard hikes under 20 km had to do it again each visit.
  // Restored in an effect, never in a useState initializer — reading storage
  // during render makes the server and client disagree on first paint.
  useEffect(() => {
    try {
      const rawFilters = localStorage.getItem(FILTERS_KEY);
      if (rawFilters) setFilters({ ...DEFAULT_FILTERS, ...JSON.parse(rawFilters) });
      const rawTab = localStorage.getItem(ACTIVE_TAB_KEY);
      if (rawTab && TAB_IDS.includes(rawTab as TabId)) setActiveTab(rawTab as TabId);
    } catch {
      /* unreadable or malformed — defaults are fine */
    }
    setPreferencesRestored(true);
  }, []);

  // "Saved" only exists for signed-in users; a restored preference (or a sign-
  // out) must not leave the sidebar pointing at a tab with no tab button.
  useEffect(() => {
    if (activeTab === 'saved' && !authUser) setActiveTab('routes');
  }, [activeTab, authUser]);

  useEffect(() => {
    if (!preferencesRestored) return;
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
      localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch {
      /* private mode — preferences just won't persist */
    }
  }, [filters, activeTab, preferencesRestored]);

  // The Strava callback sends failed connections back here with ?connect=strava
  // so the user resumes where they left off instead of hunting for the modal.
  // Read from `window` rather than useSearchParams: this is a client component
  // and useSearchParams would force the whole page under a Suspense boundary.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let consumed = false;

    // A shared link names a place; hold it until the data it refers to arrives.
    const shared = decodePlaceRef(params.get('place'));
    if (shared) setPendingPlaceRef(shared);

    const sharedTab = params.get('tab');
    if (sharedTab && TAB_IDS.includes(sharedTab as TabId)) {
      setActiveTab(sharedTab as TabId);
      params.delete('tab');
      consumed = true;
    }

    if (params.get('connect')) {
      setIsDeviceModalOpen(true);
      params.delete('connect');
      consumed = true;
    }

    // The tier the visitor picked on the pricing table. There is no billing
    // yet, but the choice is theirs and should not evaporate on navigation.
    const plan = params.get('plan');
    if (isPlanId(plan)) {
      rememberSelectedPlan(plan);
      params.delete('plan');
      consumed = true;
    }

    if (consumed) {
      const query = params.toString();
      window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
    }
  }, []);

  /**
   * The visible route list.
   *
   * This used to be separate state written from three different places, one of
   * which was the filter panel's own callback. Deriving it means the list and
   * the filter controls cannot disagree — which they previously did every time
   * the user switched tabs and unmounted the panel.
   */
  const filteredRoutes = useMemo(() => {
    const matches = routes.filter(
      (route) =>
        (filters.activityTypes.length === 0 ||
          filters.activityTypes.includes(route.activity_type)) &&
        (filters.difficulty.length === 0 || filters.difficulty.includes(route.difficulty)) &&
        route.distance_km <= filters.maxDistance &&
        // An unknown elevation is not a reason to hide a route; it only opts
        // out of the elevation filter.
        (route.elevation_gain_m == null ||
          (route.elevation_gain_m >= filters.minElevation &&
            route.elevation_gain_m <= filters.maxElevation))
    );
    return sortRoutesByDistance(matches, userLocation);
  }, [routes, filters, userLocation]);

  /**
   * Save/unsave with a confirmation the user can reverse.
   *
   * The bookmark is an icon with no label; without this, tapping it produced no
   * feedback at all beyond a fill state that is easy to miss, and an accidental
   * unsave was silent and unrecoverable.
   */
  const handleToggleSave = useCallback(
    async (place: Parameters<typeof toggleSave>[0]) => {
      const wasSaved = isSaved(place.id);
      await toggleSave(place);
      // A fresh object identity restarts the dismissal timer in the effect
      // below, so rapid saves each get their full window.
      setSaveToast({
        message: wasSaved ? 'Removed from saved' : 'Saved',
        undo: () => {
          setSaveToast(null);
          void toggleSave(place);
        },
      });
    },
    [isSaved, toggleSave]
  );

  useEffect(() => {
    if (!saveToast) return;
    const timer = setTimeout(() => setSaveToast(null), SAVE_TOAST_MS);
    return () => clearTimeout(timer);
  }, [saveToast]);

  /**
   * Everything currently worth telling the user, gathered in one place.
   *
   * These conditions each already render their own inline notice next to the
   * thing they affect; the dock badge exists so a user who dismissed one, or
   * who is looking at the map rather than the sidebar, can still find them.
   */
  const dockAlerts = useMemo<DockAlert[]>(() => {
    const list: DockAlert[] = [];
    if (locationProblem) {
      list.push({
        id: 'location',
        tone: 'warning',
        message: locationProblemMessage(locationProblem, locationSource),
      });
    }
    if (elevationUnavailable) {
      list.push({
        id: 'elevation',
        tone: 'warning',
        message: 'Elevation data is unavailable, so climbs and gains are shown as unknown.',
      });
    }
    if (failedCollections.length > 0) {
      list.push({
        id: 'collections',
        tone: 'warning',
        message: `We couldn't load ${failedCollections.map((c) => COLLECTION_LABELS[c]).join(' or ')}.`,
      });
    }
    if (stravaSyncState === 'failed') {
      list.push({
        id: 'strava',
        tone: 'warning',
        message: "Strava didn't finish syncing. Some activities may be missing.",
      });
    }
    if (error) list.push({ id: 'places', tone: 'warning', message: error });
    if (saveError) list.push({ id: 'save', tone: 'warning', message: saveError });
    return list;
  }, [
    locationProblem,
    locationSource,
    elevationUnavailable,
    failedCollections,
    stravaSyncState,
    error,
    saveError,
  ]);

  /** A read on the terrain around the user, from data already loaded. */
  const terrainPulse = useMemo(() => {
    const withElevation = mountains.filter((m) => m.elevation_m != null);
    const highest = withElevation.reduce<Mountain | null>(
      (best, m) => (best == null || m.elevation_m! > best.elevation_m! ? m : best),
      null
    );
    const nearest = filteredRoutes.find((r) => r.distance_from_user_km !== undefined) ?? null;

    return {
      peaks: mountains.length,
      routes: filteredRoutes.length,
      campsites: campsites.length,
      highestName: highest?.name ?? null,
      highestElevation: highest?.elevation_m ?? null,
      nearestName: nearest?.name ?? null,
      nearestKm: nearest?.distance_from_user_km ?? null,
    };
  }, [mountains, filteredRoutes, campsites]);

  // Closures, hazards and rescue notices. Empty until a regional feed is
  // configured — see /api/advisories for why there is no sample data.
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [advisorySource, setAdvisorySource] = useState<{
    configured: boolean;
    status: 'idle' | 'loading' | 'error';
  }>({ configured: false, status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/advisories')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setAdvisories(Array.isArray(data.advisories) ? data.advisories : []);
        setAdvisorySource({
          configured: Boolean(data.configured),
          status: data.error ? 'error' : 'idle',
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Advisories failed:', err);
        setAdvisorySource({ configured: true, status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Derived once so the map and the layer toggle report the same number. */
  const activityPolylines = useMemo(
    () =>
      activities
        .filter((a) => a.polyline && a.polyline.length > 0)
        .map((a) => ({ id: a.id, coords: a.polyline!, source: a.source, name: a.name })),
    [activities]
  );

  const layerCounts = useMemo(
    () => ({
      hiking: filteredRoutes.filter((r) => layerForActivityType(r.activity_type) === 'hiking')
        .length,
      cycling: filteredRoutes.filter((r) => layerForActivityType(r.activity_type) === 'cycling')
        .length,
      mountains: mountains.length,
      campsites: campsites.length,
      saved: savedPlaces.length,
      activities: activityPolylines.length,
      advisories: advisories.length,
    }),
    [filteredRoutes, mountains, campsites, savedPlaces, activityPolylines, advisories]
  );

  const [dockWeather, setDockWeather] = useState<DockWeather>({ status: 'idle' });

  /** Forecast for wherever the map is centred. Fetched only when asked for. */
  const loadDockWeather = useCallback(async () => {
    if (!userLocation) {
      setDockWeather({ status: 'unavailable' });
      return;
    }
    setDockWeather({ status: 'loading' });
    try {
      const res = await fetch(`/api/weather?lat=${userLocation.lat}&lng=${userLocation.lng}`);
      const data = await res.json();
      if (!res.ok || !data?.summary) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const alerts = Array.isArray(data.alerts) ? data.alerts : [];
      setDockWeather({
        status: 'ready',
        temp: data.summary.temp,
        best: data.summary.best,
        avoid: data.summary.avoid,
        risk: data.summary.risk,
        alerts,
      });
      recordWeatherAlerts(userLocation.lat, userLocation.lng, alerts);
    } catch (err) {
      console.error('Dock weather failed:', err);
      setDockWeather({ status: 'unavailable' });
    }
  }, [userLocation]);

  /**
   * Readiness for every visible route, computed once per render rather than
   * per card, so scrolling a 100-route list does not re-score on every frame.
   */
  const readinessByRoute = useMemo(() => {
    const byId: Record<string, ReturnType<typeof computeReadiness>> = {};
    for (const route of filteredRoutes) {
      byId[route.id] = computeReadiness(
        { distanceKm: route.distance_km, ascentM: route.elevation_gain_m },
        activities
      );
    }
    return byId;
  }, [filteredRoutes, activities]);

  // Roving-focus arrow keys, which is how a tablist is expected to behave:
  // one tab stop for the whole strip, arrows to move between tabs.
  const handleTabKeyDown = (event: React.KeyboardEvent, tabId: TabId) => {
    const order: TabId[] = authUser
      ? ['routes', 'mountains', 'campsites', 'history', 'saved']
      : ['routes', 'mountains', 'campsites', 'history'];
    const index = order.indexOf(tabId);
    if (index === -1) return;

    let next: TabId | null = null;
    if (event.key === 'ArrowRight') next = order[(index + 1) % order.length];
    else if (event.key === 'ArrowLeft') next = order[(index - 1 + order.length) % order.length];
    else if (event.key === 'Home') next = order[0];
    else if (event.key === 'End') next = order[order.length - 1];
    if (!next) return;

    event.preventDefault();
    setActiveTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  // Drop both caches and re-run the pipeline. Without clearing sessionStorage
  // the retry would replay the same failed-and-cached result.
  const retryPlacesFetch = () => {
    try {
      sessionStorage.removeItem('fri_places_cache');
    } catch {
      /* nothing cached to clear */
    }
    fetchedLocationKeyRef.current = null;
    setError(null);
    setFailedCollections([]);
    setPlacesAttempt((n) => n + 1);
  };

  // Once the collections arrive, open whatever `?place=` asked for. Runs until
  // it finds a match, so a link that arrives before the fetch still resolves.
  useEffect(() => {
    if (!pendingPlaceRef) return;

    const { kind, id } = pendingPlaceRef;
    const found =
      kind === 'route'
        ? routes.find((r) => r.id === id)
        : kind === 'mountain'
          ? mountains.find((m) => m.id === id)
          : kind === 'campsite'
            ? campsites.find((c) => c.id === id)
            : activities.find((a) => a.id === id);

    if (!found) {
      // Still loading — keep waiting. Once loading is done and it is still
      // missing, the link is stale and the user should not be left hanging.
      if (!isLoading) {
        setPendingPlaceRef(null);
        setError(
          "That link points to a place we can't find near you. Showing what's here instead."
        );
      }
      return;
    }

    setSelectedDetails({ type: kind, data: found } as typeof selectedDetails);
    setPendingPlaceRef(null);
  }, [pendingPlaceRef, routes, mountains, campsites, activities, isLoading]);

  // Keep the query string in step with what is on screen, so the page is
  // shareable and a reload lands where the user left off.
  useEffect(() => {
    if (!preferencesRestored) return;
    const params = new URLSearchParams(window.location.search);

    if (activeTab === 'routes') params.delete('tab');
    else params.set('tab', activeTab);

    if (selectedDetails) {
      params.set('place', encodePlaceRef(selectedDetails.type, selectedDetails.data.id));
    } else {
      params.delete('place');
    }

    const query = params.toString();
    const next = query ? `?${query}` : window.location.pathname;
    if (next !== window.location.search || (!query && window.location.search)) {
      window.history.replaceState(null, '', next);
    }
  }, [activeTab, selectedDetails, preferencesRestored]);

  // Coarse key for the Places pipeline below. Rounding to 0.1° means a GPS fix
  // that merely refines a restored location does not re-run 40+ paid queries.
  const locationKey = userLocation
    ? `${(Math.round(userLocation.lat * 10) / 10).toFixed(1)},${(Math.round(userLocation.lng * 10) / 10).toFixed(1)}`
    : null;
  const fetchedLocationKeyRef = useRef<string | null>(null);

  const googleMapsLoaderOptions = useMemo(
    () => ({
      googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
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
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      // User closed the popup or clicked away — not an error worth surfacing
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Google sign-in failed:', err);
      setAuthError(signInErrorMessage(code, 'Google'));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAppleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithApple();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Apple sign-in failed:', err);
      setAuthError(signInErrorMessage(code, 'Apple'));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutFirebaseUser();
    } catch (err) {
      console.error('Sign-out failed:', err);
      setAuthError("We couldn't sign you out. Try again.");
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
        const placesService = new google.maps.places.PlacesService(document.createElement('div'));

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
              .map((photo) => photo.getUrl({ maxWidth: 800, maxHeight: 600 }));

            resolve({ photos: photoUrls });
          }
        );
      });
    } catch (error) {
      console.error('Error in fetchPlaceDetails:', error);
      return { photos: [] };
    }
  };

  // Deterministic hash from a string — avoids Math.random() in render
  const hashStr = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };

  // `generateStravaSegment` used to live here. It fabricated segment ids, KOM/QOM
  // times and effort counts from a hash of the place name and rendered them under
  // Strava branding — invented athletic records attributed to real athletes. The
  // `strava_segment` field remains on the types so genuine Strava segment data can
  // populate it later; nothing writes it today.

  // Batch-fetch real elevations via /api/elevation (Google, falling back to
  // Open-Elevation — see src/lib/elevation.ts for why).
  const fetchElevations = fetchElevationBatch;

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
                        el.status === 'OK' ? (el.distance?.value ?? null) : null
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

    (async () => {
      const token = await getValidStravaToken();
      if (!token) return;

      // Throttle Strava refresh — skip if fetched within last 5 minutes
      const STRAVA_REFRESH_KEY = 'fri_strava_last_fetch';
      const STRAVA_TTL_MS = 5 * 60 * 1000;
      const lastFetch = parseInt(localStorage.getItem(STRAVA_REFRESH_KEY) ?? '0', 10);
      if (Date.now() - lastFetch < STRAVA_TTL_MS) return;

      type StravaItem = {
        id: number;
        name: string;
        sport_type: string;
        start_date: string;
        distance: number;
        total_elevation_gain: number;
        moving_time: number;
        average_heartrate?: number;
        max_heartrate?: number;
        map?: { summary_polyline?: string };
        start_latlng?: [number, number];
      };

      // Strava paginates 30 per page — walk pages until Strava returns a
      // short page (fully caught up), same cap as the server-side sync.
      const STRAVA_MAX_PAGES = 10;
      const allItems: StravaItem[] = [];
      // Previously this ran with no indicator and swallowed every failure, so
      // activities either appeared out of nowhere or never appeared at all.
      setStravaSyncState('syncing');
      let syncFailed = false;
      try {
        for (let page = 1; page <= STRAVA_MAX_PAGES; page++) {
          const res = await fetch(
            `/api/strava/activities?token=${encodeURIComponent(token.access_token)}&page=${page}`
          );
          if (!res.ok) {
            // A non-OK page used to `break` silently, truncating the history
            // and reporting it as a complete sync.
            console.error('Strava activities request failed:', res.status);
            syncFailed = true;
            break;
          }
          const items: StravaItem[] = await res.json();
          if (!items || items.length === 0) break;
          allItems.push(...items);
          if (items.length < 30) break;
        }
      } catch (err) {
        console.error('Strava sync failed:', err);
        syncFailed = true;
      }
      setStravaSyncState(syncFailed ? 'failed' : 'idle');

      if (allItems.length > 0) {
        const incoming: Activity[] = allItems.map((item) => ({
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
          // Strava returns [lat, lng]; Activity convention is [lng, lat] (GeoJSON)
          start_latlng: item.start_latlng
            ? [item.start_latlng[1], item.start_latlng[0]]
            : undefined,
          polyline: item.map?.summary_polyline
            ? decodePolyline(item.map.summary_polyline)
            : undefined,
        }));
        const merged = mergeActivities(stored, incoming);
        saveActivities(merged);
        setActivities(merged);
        localStorage.setItem(STRAVA_REFRESH_KEY, String(Date.now()));
      }

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
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((result: { synced: number }) => {
              localStorage.setItem(SYNC_KEY, String(Date.now()));
              console.info(`Strava → Firestore sync complete: ${result.synced} activities`);
            })
            .catch(() => {
              /* non-critical, will retry next hour */
            });
        }
      }
    })();
    // Re-run when uid changes so users who sign in post-mount get their Strava sync fired.
  }, [authUser?.uid]);

  // Fetch real data from Google Maps Places API
  useEffect(() => {
    if (!isLoaded) return;
    if (typeof window === 'undefined' || !window.google) return;
    // Wait for useUserLocation to settle so we search where the user actually
    // is, and only re-search when they have meaningfully moved.
    if (locationStatus !== 'ready' || !userLocation || !locationKey) return;
    if (fetchedLocationKeyRef.current === locationKey) return;
    fetchedLocationKeyRef.current = locationKey;

    // --- 3-tier cache strategy ---
    // L1: sessionStorage (30-min TTL, instant, per-tab)
    // L2: Firestore via /api/places/cache (24-h TTL, shared across users in same region)
    // L3: Live Google Maps API calls (expensive, only on full miss)
    const SESSION_CACHE_KEY = 'fri_places_cache';
    const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

    const applyCache = (data: {
      routes: Route[];
      mountains: Mountain[];
      campsites: Campsite[];
      location?: { lat: number; lng: number; address?: string };
    }) => {
      // Cached payloads predate the radius filter, so they get it too.
      const near = data.location ?? userLocation;
      setRoutes(
        withinSearchRadius(data.routes, near).map((r) => ({
          ...r,
          difficulty: normaliseDifficulty(r.difficulty),
        }))
      );
      setMountains(withinSearchRadius(data.mountains, near));
      setCampsites(withinSearchRadius(data.campsites, near));
      if (data.location) saveAndSetUserLocation(data.location);
      setIsLoading(false);
    };

    // L1: sessionStorage check
    try {
      const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (cached) {
        const {
          ts,
          v,
          routes: r,
          mountains: m,
          campsites: c,
          location,
        } = JSON.parse(cached) as {
          ts: number;
          v?: number;
          routes: Route[];
          mountains: Mountain[];
          campsites: Campsite[];
          location?: { lat: number; lng: number; address?: string };
        };
        if (v === PLACES_CACHE_VERSION && Date.now() - ts < SESSION_TTL_MS && r && m && c) {
          applyCache({ routes: r, mountains: m, campsites: c, location });
          return;
        }
      }
    } catch {
      /* ignore corrupt cache */
    }

    const fetchRoutes = async () => {
      // Each of the three collections is fetched independently and each can
      // fail on its own; collect the casualties rather than silently
      // substituting an empty list.
      const failed: CollectionName[] = [];
      try {
        setIsLoading(true);
        setError(null);
        setFailedCollections([]);
        setElevationUnavailable(false);

        // Location is already resolved by useUserLocation — this pipeline no
        // longer prompts for it a second time.
        const userCoords: [number, number] = [userLocation.lng, userLocation.lat];

        // Get reverse geocoding for address (cached 24 h in sessionStorage).
        // Start from whatever label the location already carries so a failed
        // geocode degrades to "the area we searched", not "Unknown Location".
        let addressResult = userLocation.address ?? 'this area';
        try {
          const geoKey = `fri_geocode_${Math.round(userCoords[1] * 10) / 10}_${Math.round(userCoords[0] * 10) / 10}`;
          const GEO_TTL_MS = 24 * 60 * 60 * 1000;
          let geoHit = false;
          try {
            const raw = sessionStorage.getItem(geoKey);
            if (raw) {
              const { ts, address } = JSON.parse(raw) as { ts: number; address: string };
              if (Date.now() - ts < GEO_TTL_MS) {
                addressResult = address;
                geoHit = true;
              }
            }
          } catch {
            /* corrupt cache */
          }

          if (!geoHit) {
            const geocoder = new google.maps.Geocoder();
            const geocoded = await new Promise<string | null>((resolve) => {
              geocoder.geocode(
                { location: { lat: userCoords[1], lng: userCoords[0] } },
                (results, status) => {
                  if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
                    resolve(results[0].formatted_address);
                  } else {
                    resolve(null);
                  }
                }
              );
            });
            // Only overwrite the label if we actually learned a better one.
            if (geocoded) {
              addressResult = geocoded;
              try {
                sessionStorage.setItem(
                  geoKey,
                  JSON.stringify({ ts: Date.now(), address: addressResult })
                );
              } catch {
                /* quota */
              }
            }
          }
        } catch (err) {
          console.warn('Reverse geocoding unavailable.', err);
        }

        const resolvedLocation: { lat: number; lng: number; address?: string } = {
          lat: userCoords[1],
          lng: userCoords[0],
          address: addressResult,
        };

        // Keep the provenance we already established — attaching an address
        // must not promote a fallback guess into a claimed device fix.
        saveAndSetUserLocation(resolvedLocation, locationSource ?? 'restored');

        // L2: Firestore shared cache check
        try {
          const cacheRes = await fetch(
            `/api/places/cache?lat=${userCoords[1]}&lng=${userCoords[0]}`
          );
          if (cacheRes.ok) {
            const cacheData = (await cacheRes.json()) as {
              hit: boolean;
              v?: number;
              routes?: Route[];
              mountains?: Mountain[];
              campsites?: Campsite[];
            };
            if (
              cacheData.hit &&
              cacheData.v === PLACES_CACHE_VERSION &&
              cacheData.routes &&
              cacheData.mountains &&
              cacheData.campsites
            ) {
              // Write to sessionStorage so next visit in this tab is instant
              try {
                sessionStorage.setItem(
                  SESSION_CACHE_KEY,
                  JSON.stringify({
                    ts: Date.now(),
                    v: PLACES_CACHE_VERSION,
                    routes: cacheData.routes,
                    mountains: cacheData.mountains,
                    campsites: cacheData.campsites,
                    location: resolvedLocation,
                  })
                );
              } catch {
                /* storage quota */
              }
              applyCache({
                routes: cacheData.routes,
                mountains: cacheData.mountains,
                campsites: cacheData.campsites,
                location: resolvedLocation,
              });
              return;
            }
          }
        } catch {
          /* Firestore cache unavailable, continue to live fetch */
        }

        // TODO: Replace with actual backend API calls
        // Fetch routes from backend
        // const routesResponse = await fetch(
        //   `${process.env.NEXT_PUBLIC_API_URL}/api/routes/nearby?lat=${userCoords[1]}&lon=${userCoords[0]}&radius_km=50`
        // );
        // const routesData = await routesResponse.json();

        // Fetch mountains using Google Maps Places API
        let mountains: Mountain[] = [];
        try {
          const placesService = new google.maps.places.PlacesService(document.createElement('div'));

          mountains = await new Promise(async (resolve) => {
            const allMountainPlaces: google.maps.places.PlaceResult[] = [];
            const dedupe = (r: google.maps.places.PlaceResult) =>
              !allMountainPlaces.find((p) => p.place_id === r.place_id);

            // textSearch — no radius hard cap, surfaces mountains like
            // Mt. Talamitam, Mt. Lantik, Mt. Apayang that nearbySearch misses
            const textQueries = [
              'mountain',
              'mount',
              'Mt. mountain',
              'peak mountain',
              'summit mountain',
              'volcano mountain',
              'bundok', // Filipino word for mountain
              'tuloy', // Filipino for hill/peak
            ];
            await Promise.all(
              textQueries.map(
                (query) =>
                  new Promise<void>((res) => {
                    placesService.textSearch(
                      {
                        query,
                        location: { lat: userCoords[1], lng: userCoords[0] },
                        radius: 50000,
                      },
                      (results, status) => {
                        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                          results.filter(dedupe).forEach((r) => allMountainPlaces.push(r));
                        }
                        res();
                      }
                    );
                  })
              )
            );

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
                    results.filter(dedupe).forEach((r) => allMountainPlaces.push(r));
                  }
                  res();
                }
              );
            });

            const PEAK_KEYWORDS = [
              'mount',
              'mt.',
              'mt ',
              'mountain',
              'peak',
              'summit',
              'hill',
              'ridge',
              'butte',
              'knob',
              'crest',
              'highland',
              'volcano',
              'volcan',
              'bulkan',
              'bundok',
            ];
            const EXCLUDE_TYPES = new Set([
              'restaurant',
              'food',
              'bar',
              'cafe',
              'bakery',
              'meal_takeaway',
              'meal_delivery',
              'lodging',
              'store',
              'shopping_mall',
              'hospital',
              'school',
              'church',
              'place_of_worship',
              'gas_station',
              'bank',
            ]);
            const filteredMountainPlaces = allMountainPlaces
              .filter(
                (place) =>
                  place.name &&
                  place.geometry?.location &&
                  PEAK_KEYWORDS.some((kw) => place.name!.toLowerCase().includes(kw)) &&
                  !(place.types || []).some((t) => EXCLUDE_TYPES.has(t))
              )
              .slice(0, 60);

            // Batch-fetch real summit elevations from Google ElevationService
            const mountainLocations = filteredMountainPlaces.map((p) => ({
              lat: p.geometry!.location!.lat(),
              lng: p.geometry!.location!.lng(),
            }));
            const { values: mountainElevations, failed: mountainElevationFailed } =
              await fetchElevations(mountainLocations);
            if (mountainElevationFailed) setElevationUnavailable(true);

            const mountainData = filteredMountainPlaces
              .map((place, index) => {
                const elevation = mountainElevations[index] ?? null;
                const prominence = elevation == null ? undefined : Math.round(elevation * 0.28);
                const jumpoff = elevation == null ? undefined : Math.round(elevation * 0.55);
                const distance =
                  elevation == null ? 2 : Math.max(2, Math.round((elevation / 450) * 10) / 10);
                return {
                  id: `m${index + 1}`,
                  name: place.name || 'Unknown Mountain',
                  coordinates: [
                    place.geometry!.location!.lng(),
                    place.geometry!.location!.lat(),
                  ] as [number, number],
                  elevation_m: elevation,
                  prominence_m: prominence,
                  trail_class: elevation == null ? undefined : trailClassFromElevation(elevation),
                  mountain_type: 'peak',
                  place_id: place.place_id,
                  photos: [],
                  jumpoff_elevation: jumpoff,
                  summit_elevation: elevation ?? undefined,
                };
              })
              // Drop molehills, but only where we actually know the elevation.
              // Filtering on an unknown used to delete every peak whenever the
              // Elevation API was over quota — an empty tab with no explanation.
              .filter((m) => m.elevation_m == null || m.elevation_m >= 100);
            resolve(mountainData);
          });
        } catch (err) {
          console.error('Mountain fetch error:', err);
          mountains = [];
          failed.push('mountains');
        }

        // Fetch routes — use textSearch (not nearbySearch) so the 50 km hard cap
        // doesn't apply and all Google Maps hiking-tagged areas are surfaced.
        let routes: Route[] = [];
        try {
          const placesService = new google.maps.places.PlacesService(document.createElement('div'));

          routes = await new Promise(async (resolve) => {
            const allRoutePlaces: google.maps.places.PlaceResult[] = [];
            const dedupe = (r: google.maps.places.PlaceResult) =>
              !allRoutePlaces.find((p) => p.place_id === r.place_id);

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
              'likha trail', // Filipino
              'dayhike area', // Filipino community term
              'jumpoff site', // Filipino mountaineering term
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
                    results.filter(dedupe).forEach((r) => allRoutePlaces.push(r));
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
            await Promise.all(
              nearbyTypes.map(
                (type) =>
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
                          results.filter(dedupe).forEach((r) => allRoutePlaces.push(r));
                        }
                        res();
                      }
                    );
                  })
              )
            );

            const EXCLUDE_ROUTE_TYPES = new Set([
              'restaurant',
              'food',
              'bar',
              'cafe',
              'bakery',
              'meal_takeaway',
              'meal_delivery',
              'lodging',
              'store',
              'shopping_mall',
              'hospital',
              'school',
              'church',
              'place_of_worship',
              'gas_station',
              'bank',
            ]);
            const EXCLUDE_ROUTE_KEYWORDS = [
              'farm',
              'resort',
              'hotel',
              'casino',
              'supermarket',
              'mall',
            ];

            const filteredRoutePlaces = allRoutePlaces
              .filter(
                (place) =>
                  place.name &&
                  place.geometry?.location &&
                  !(place.types || []).some((t) => EXCLUDE_ROUTE_TYPES.has(t)) &&
                  !EXCLUDE_ROUTE_KEYWORDS.some((kw) => place.name!.toLowerCase().includes(kw))
              )
              .slice(0, 100);

            // Batch-fetch real base (jumpoff) elevations from Google ElevationService
            const routeLocations = filteredRoutePlaces.map((p) => ({
              lat: p.geometry!.location!.lat(),
              lng: p.geometry!.location!.lng(),
            }));
            const { values: routeBaseElevations, failed: routeBaseFailed } =
              await fetchElevations(routeLocations);

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
            const { values: terrainProbeElevations, failed: probeFailed } =
              await fetchElevations(terrainProbeLocations);
            if (routeBaseFailed || probeFailed) setElevationUnavailable(true);

            const routeData = filteredRoutePlaces.map((place, index) => {
              const name = place.name!.toLowerCase();
              let activityType = 'hike';
              if (name.includes('bike') || name.includes('cycling') || name.includes('bikepacking'))
                activityType = 'bike';
              else if (
                name.includes('climb') ||
                name.includes('crag') ||
                name.includes('boulder') ||
                name.includes('rock wall') ||
                name.includes('rappel')
              )
                activityType = 'rock_climb';
              else if (
                name.includes('tour') ||
                name.includes('road') ||
                name.includes('scenic drive') ||
                name.includes('heritage road') ||
                name.includes('route')
              )
                activityType = 'tour';

              const fallbackKm = Math.max(
                1,
                Math.round(
                  haversineKm(userCoords, [
                    place.geometry!.location!.lng(),
                    place.geometry!.location!.lat(),
                  ]) *
                    1.15 *
                    10
                ) / 10
              );
              const distance = travelDistancesM[index]
                ? Math.max(0.5, Math.round((travelDistancesM[index]! / 1000) * 10) / 10)
                : fallbackKm;

              // Relief sampled from five points ~900 m around the trailhead. This
              // is terrain relief near the start, NOT gain along a trail — there
              // is no trail geometry here to walk. It stays null when the probes
              // came back empty; the old `Math.max(50, ...)` floor turned every
              // such failure into a confident-looking "50 m" on every route.
              const probeStart = index * 5;
              const probeSamples = terrainProbeElevations
                .slice(probeStart, probeStart + 5)
                .filter((v): v is number => v !== null);
              const jumpoff = routeBaseElevations[index] ?? probeSamples[0] ?? null;
              const localRelief =
                probeSamples.length > 0 && jumpoff != null
                  ? Math.max(0, Math.round(Math.max(...probeSamples) - jumpoff))
                  : null;

              return {
                id: `r${index + 1}`,
                name: place.name || 'Trail',
                coordinates: [place.geometry!.location!.lng(), place.geometry!.location!.lat()] as [
                  number,
                  number,
                ],
                distance_km: distance,
                elevation_gain_m: localRelief,
                // Was read off the Google star rating, which measures how much
                // people liked a place, not how hard it is to walk.
                difficulty: classifyDifficulty(distance, localRelief),
                activity_type: activityType,
                place_id: place.place_id,
                photos: [],
                jumpoff_elevation: jumpoff ?? undefined,
                summit_elevation:
                  jumpoff != null && localRelief != null ? jumpoff + localRelief : undefined,
              };
            });
            resolve(routeData);
          });
        } catch (err) {
          console.error('Routes fetch error:', err);
          routes = [];
          failed.push('routes');
        }

        // Fetch campsites
        let campsites: Campsite[] = [];
        try {
          const placesService = new google.maps.places.PlacesService(document.createElement('div'));

          campsites = await new Promise(async (resolve) => {
            const allCampsitePlaces: google.maps.places.PlaceResult[] = [];
            const dedupe = (r: google.maps.places.PlaceResult) =>
              !allCampsitePlaces.find((p) => p.place_id === r.place_id);

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
            await Promise.all(
              textQueries.map(
                (query) =>
                  new Promise<void>((res) => {
                    placesService.textSearch(
                      {
                        query,
                        location: { lat: userCoords[1], lng: userCoords[0] },
                        radius: 50000,
                      },
                      (results, status) => {
                        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                          results.filter(dedupe).forEach((r) => allCampsitePlaces.push(r));
                        }
                        res();
                      }
                    );
                  })
              )
            );

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
                    results.filter(dedupe).forEach((r) => allCampsitePlaces.push(r));
                  }
                  res();
                }
              );
            });

            const EXCLUDE_CAMP_TYPES = new Set([
              'restaurant',
              'food',
              'bar',
              'cafe',
              'bakery',
              'meal_takeaway',
              'meal_delivery',
              'store',
              'shopping_mall',
              'hospital',
              'school',
              'church',
              'place_of_worship',
              'gas_station',
              'bank',
              'farm',
            ]);
            const EXCLUDE_CAMP_KEYWORDS = [
              'farm',
              'resort',
              'hotel',
              'motel',
              'inn',
              'pension',
              'hostel',
            ];

            const campsiteData = allCampsitePlaces
              .filter(
                (place) =>
                  place.name &&
                  place.geometry?.location &&
                  !(place.types || []).some((t) => EXCLUDE_CAMP_TYPES.has(t)) &&
                  !EXCLUDE_CAMP_KEYWORDS.some((kw) => place.name!.toLowerCase().includes(kw))
              )
              .slice(0, 60)
              .map((place, index) => ({
                id: `c${index + 1}`,
                name: place.name || 'Campsite',
                coordinates: [place.geometry!.location!.lng(), place.geometry!.location!.lat()] as [
                  number,
                  number,
                ],
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
          failed.push('campsites');
        }

        // An empty tab after a failed fetch is indistinguishable from "nothing
        // here" unless we say which collections did not come back.
        setFailedCollections(failed);

        // Drop results Google returned from the other side of the world before
        // they reach the UI *or* the caches — otherwise every later visitor to
        // this grid cell inherits them.
        routes = withinSearchRadius(routes, resolvedLocation);
        mountains = withinSearchRadius(mountains, resolvedLocation);
        campsites = withinSearchRadius(campsites, resolvedLocation);

        setRoutes(routes);
        setMountains(mountains);
        setCampsites(campsites);
        setIsLoading(false);

        // Write live results to both caches so future visitors skip the API calls
        const cachePayload = {
          v: PLACES_CACHE_VERSION,
          routes,
          mountains,
          campsites,
          location: resolvedLocation,
          ts: Date.now(),
        };
        try {
          sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cachePayload));
        } catch {
          /* storage quota */
        }
        fetch('/api/places/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            v: PLACES_CACHE_VERSION,
            lat: userCoords[1],
            lng: userCoords[0],
            routes,
            mountains,
            campsites,
            location: resolvedLocation,
          }),
        }).catch(() => {
          /* non-critical */
        });
      } catch (err) {
        console.error('Places pipeline failed:', err);
        setError("We couldn't load places near you.");
        setIsLoading(false);
      }
    };

    fetchRoutes();
  }, [isLoaded, locationStatus, locationKey, placesAttempt]);

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
    <main id="main" className="relative flex h-[100dvh] flex-col overflow-hidden bg-slate-950">
      {/* One quiet light source behind the map chrome. A three-colour orb field
          reads as decoration for its own sake and dates the product instantly. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
      </div>
      {/* Header */}
      <header className="relative z-20 flex h-14 flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-slate-950/95 px-5 backdrop-blur">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" aria-hidden="true" className="h-8 w-8" />
          <span className="text-[15px] font-bold tracking-tight text-white">Fit Ready IQ</span>
        </Link>

        {/* Nav actions */}
        <div className="flex items-center gap-2">
          <button
            aria-label="Toggle sidebar"
            onClick={() => setSidebarOpen((s) => !s)}
            className={`${buttonGhost} h-8 w-8 !px-0 md:hidden`}
          >
            <Menu aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsDeviceModalOpen(true)}
            className={`${buttonGhost} ${buttonSize.sm}`}
          >
            <Watch aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Connect Devices</span>
          </button>
          {adminGate === 'allowed' && (
            <Link
              href="/admin/settings"
              className={`${buttonGhost} h-8 w-8 !px-0`}
              aria-label="Admin settings"
              title="Admin settings"
            >
              <Shield aria-hidden="true" className="h-4 w-4" />
            </Link>
          )}

          {isFirebaseAuthConfigured() ? (
            authUser ? (
              <button
                onClick={() => setIsProfileModalOpen(true)}
                disabled={authBusy}
                className={`${buttonGhost} ${buttonSize.sm}`}
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
                  <UserIcon aria-hidden="true" className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{authUser.displayName ?? 'Signed in'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {/* The only primary button on this screen. Named for the outcome
                    the user wants, not for the identity provider behind it. */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={authBusy}
                  className={`${buttonPrimary} ${buttonSize.sm}`}
                  title="Continue with Google"
                >
                  <UserIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{authBusy ? 'Opening…' : 'Start free'}</span>
                </button>
                <button
                  onClick={handleAppleSignIn}
                  disabled={authBusy}
                  className={`${buttonGhost} h-8 w-8 !px-0`}
                  title="Continue with Apple"
                  aria-label="Continue with Apple"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                </button>
              </div>
            )
          ) : (
            /* Not a button — there is nothing to click. A focusable control that
               does nothing is a dead end for keyboard users, so this is a status
               indicator that still announces why sign-in is missing. */
            <span
              className="flex h-8 w-8 items-center justify-center text-slate-600"
              title="Sign-in unavailable — Firebase Auth is not configured"
            >
              <UserIcon aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">Sign-in unavailable — Firebase Auth is not configured</span>
            </span>
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
            role="button"
            tabIndex={0}
            aria-label="Close menu"
            className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSidebarOpen(false);
              }
            }}
          />
        )}
        {/* Sidebar */}
        <aside
          className={`sidebar-scroll bg-slate-900/98 fixed inset-y-0 left-0 z-30 flex w-[min(320px,85vw)] flex-col gap-2.5 overflow-y-auto border-r border-white/[0.06] p-3 backdrop-blur-xl transition-transform duration-300 ease-out md:relative md:inset-auto md:z-auto md:w-80 md:flex-shrink-0 ${sidebarOpen ? 'translate-x-0 shadow-2xl shadow-black/60' : '-translate-x-full md:translate-x-0'}`}
        >
          {/* Location failed — say so, rather than silently searching elsewhere */}
          {locationProblem && !locationNoticeDismissed && (
            <div
              role="status"
              className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <MapPinOff
                  aria-hidden="true"
                  className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400"
                />
                <p className="flex-1 text-[11px] leading-relaxed text-amber-100">
                  {locationProblemMessage(locationProblem, locationSource)}
                </p>
                <button
                  type="button"
                  onClick={() => setLocationNoticeDismissed(true)}
                  aria-label="Dismiss location notice"
                  className="-m-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-amber-400/70 hover:text-amber-200"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={retryLocation}
                  className={`${buttonSecondary} ${buttonSize.sm}`}
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => searchInputRef.current?.focus()}
                  className={`${buttonGhost} ${buttonSize.sm}`}
                >
                  Search a place
                </button>
              </div>
            </div>
          )}

          {/* Current Location — blue "you are here" treatment only for real fixes */}
          {userLocation && (
            <button
              type="button"
              onClick={() => focusUserLocationRef.current?.()}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
                hasPreciseLocation
                  ? 'border-blue-500/20 bg-blue-500/10 hover:border-blue-500/40 hover:bg-blue-500/20'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]'
              }`}
              title={hasPreciseLocation ? 'Focus map on your location' : 'Focus map on this area'}
            >
              <div
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg shadow-md ${
                  hasPreciseLocation ? 'bg-blue-600 shadow-blue-900/50' : 'bg-slate-700'
                }`}
              >
                <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-xs font-medium ${hasPreciseLocation ? 'text-blue-100' : 'text-slate-200'}`}
                >
                  {userLocation.address || (isLocating ? 'Getting location…' : 'Selected area')}
                </p>
                <p
                  className={`font-tabular text-[10px] ${hasPreciseLocation ? 'text-blue-400/70' : 'text-slate-500'}`}
                >
                  {hasPreciseLocation
                    ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`
                    : 'Approximate area'}
                </p>
              </div>
              <ChevronRight
                aria-hidden="true"
                className={`h-3.5 w-3.5 flex-shrink-0 ${hasPreciseLocation ? 'text-blue-400' : 'text-slate-500'}`}
              />
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 my-auto h-3.5 w-3.5 text-slate-500"
            />
            <input
              ref={searchInputRef}
              type="text"
              aria-label="Search routes, peaks and campsites"
              placeholder="Search routes, peaks, camps…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="focus:bg-white/8 w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-[13px] text-slate-200 placeholder-slate-500 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-2.5 my-auto flex items-center text-slate-500 hover:text-slate-300"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tabs — these were bare buttons conveying selection by colour
              alone, with no role, no aria-selected and a 26px hit area.

              An equal-width grid then crushed each tab to ~69px in a 291px
              sidebar, which is not enough for an icon, a label and a count, so
              the counts clipped. Each tab now takes the width it needs and the
              strip scrolls. `flex-shrink-0` matters: the sidebar is a flex
              column and would otherwise compress this row to a sliver. */}
          <div
            role="tablist"
            aria-label="Browse places and activities"
            className="sidebar-tabs flex flex-shrink-0 gap-0.5 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/5 p-1"
          >
            {(
              [
                {
                  id: 'routes',
                  label: 'Routes',
                  Icon: Route,
                  activeClass: 'bg-blue-600 text-white shadow-lg shadow-blue-900/50',
                },
                {
                  id: 'mountains',
                  label: 'Peaks',
                  Icon: Mountain,
                  activeClass: 'bg-slate-600 text-white shadow-lg shadow-slate-900/50',
                },
                {
                  id: 'campsites',
                  label: 'Camps',
                  Icon: Tent,
                  activeClass: 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50',
                },
                {
                  id: 'history',
                  label: 'History',
                  Icon: Clock,
                  activeClass: 'bg-violet-600 text-white shadow-lg shadow-violet-900/50',
                },
                ...(authUser
                  ? [
                      {
                        id: 'saved' as const,
                        label: 'Saved',
                        Icon: Bookmark,
                        activeClass: 'bg-amber-600 text-white shadow-lg shadow-amber-900/50',
                      },
                    ]
                  : []),
              ] as const
            ).map((tab) => {
              const count =
                tab.id === 'routes'
                  ? filteredRoutes.filter(
                      (r) =>
                        !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())
                    ).length
                  : tab.id === 'mountains'
                    ? mountains.filter(
                        (m) =>
                          !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())
                      ).length
                    : tab.id === 'campsites'
                      ? campsites.filter(
                          (c) =>
                            !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
                        ).length
                      : tab.id === 'saved'
                        ? savedPlaces.filter(
                            (p) =>
                              !searchQuery ||
                              p.name.toLowerCase().includes(searchQuery.toLowerCase())
                          ).length
                        : activities.filter(
                            (a) =>
                              !searchQuery ||
                              a.name.toLowerCase().includes(searchQuery.toLowerCase())
                          ).length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  aria-controls="tab-panel"
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
                  className={`flex min-h-11 flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    activeTab === tab.id
                      ? tab.activeClass
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <tab.Icon aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={`font-tabular rounded-full px-1.5 py-px text-[9px] font-bold leading-none ${
                        activeTab === tab.id
                          ? 'bg-white/25 text-white'
                          : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            id="tab-panel"
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            className="contents"
          >
            {/* Filters — only for routes tab */}
            {activeTab === 'routes' && (
              <RouteFilter filters={filters} onFilterChange={setFilters} />
            )}

            {/* Lists */}
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
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
                <p className="text-xs font-medium text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={retryPlacesFetch}
                  className={`${buttonSecondary} ${buttonSize.sm} mt-2.5`}
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {elevationUnavailable && (
                  <div
                    role="status"
                    className="mb-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5"
                  >
                    <p className="text-[11px] leading-relaxed text-amber-100">
                      Elevation data is unavailable right now, so climbs and gains are shown as
                      &ldquo;—&rdquo; rather than guessed.
                    </p>
                  </div>
                )}

                {/* Partial failure: some collections came back, some did not.
                  Without this the empty tab reads as "nothing here". */}
                {failedCollections.length > 0 && (
                  <div
                    role="status"
                    className="mb-1.5 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5"
                  >
                    <p className="flex-1 text-[11px] text-amber-100">
                      We couldn&apos;t load{' '}
                      {failedCollections.map((c) => COLLECTION_LABELS[c]).join(' or ')}.
                    </p>
                    <button
                      type="button"
                      onClick={retryPlacesFetch}
                      className={`${buttonGhost} ${buttonSize.sm}`}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {/* ── Routes Tab ── */}
                {activeTab === 'routes' &&
                  (() => {
                    const list = filteredRoutes.filter(
                      (r) =>
                        !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                    // "Try adjusting your filters" used to show even when no
                    // filters were set and the search simply found nothing near
                    // the user. Name the actual cause and offer the way out.
                    if (list.length === 0) {
                      const filtersActive =
                        JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
                      return (
                        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
                          <Search aria-hidden="true" className="h-6 w-6 text-slate-600" />
                          {searchQuery ? (
                            <>
                              <p className="text-xs font-medium text-slate-400">
                                No routes match “{searchQuery}”
                              </p>
                              <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className={`${buttonSecondary} ${buttonSize.sm} mt-1`}
                              >
                                Clear search
                              </button>
                            </>
                          ) : filtersActive ? (
                            <>
                              <p className="text-xs font-medium text-slate-400">
                                No routes match your filters
                              </p>
                              <button
                                type="button"
                                onClick={() => setFilters(DEFAULT_FILTERS)}
                                className={`${buttonSecondary} ${buttonSize.sm} mt-1`}
                              >
                                Clear filters
                              </button>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-medium text-slate-400">
                                No routes found near here
                              </p>
                              <p className="text-[10px] text-slate-600">
                                Try searching for a different area.
                              </p>
                            </>
                          )}
                        </div>
                      );
                    }
                    const difficultyStyle: Record<
                      string,
                      { pill: string; dot: string; bar: string }
                    > = {
                      easy: {
                        pill: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
                        dot: 'bg-emerald-400',
                        bar: 'bg-emerald-500',
                      },
                      moderate: {
                        pill: 'bg-amber-500/15 text-amber-400 ring-amber-500/20',
                        dot: 'bg-amber-400',
                        bar: 'bg-amber-500',
                      },
                      hard: {
                        pill: 'bg-red-500/15 text-red-400 ring-red-500/20',
                        dot: 'bg-red-400',
                        bar: 'bg-red-500',
                      },
                    };
                    const activityIcons: Record<string, React.ReactNode> = {
                      bike: <Route aria-hidden="true" className="h-3.5 w-3.5" />,
                      hike: <Mountain aria-hidden="true" className="h-3.5 w-3.5" />,
                      tour: <Route aria-hidden="true" className="h-3.5 w-3.5" />,
                      run: <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />,
                    };
                    return list.map((route, idx) => {
                      const ds = difficultyStyle[route.difficulty] ?? {
                        pill: 'bg-white/10 text-slate-400 ring-white/10',
                        dot: 'bg-slate-400',
                        bar: 'bg-slate-500',
                      };
                      return (
                        <button
                          key={route.id}
                          type="button"
                          onClick={() => handleRouteClick(route)}
                          className="card-enter group w-full rounded-xl border border-white/[0.07] bg-white/5 text-left transition-all hover:border-blue-500/30 hover:bg-blue-500/10 active:scale-[0.99]"
                          style={{ animationDelay: `${idx * 30}ms` }}
                        >
                          <div className="flex items-stretch gap-0">
                            {/* A 72px thumbnail that was empty on every card,
                              because list results never carry photos — only the
                              detail view fetches them. Replaced by a slim
                              difficulty spine, which is the one thing that strip
                              was actually communicating. */}
                            <div
                              aria-hidden="true"
                              className={`w-1 flex-shrink-0 rounded-l-xl ${ds.bar} opacity-70`}
                            />
                            <div className="min-w-0 flex-1 px-3 py-2.5">
                              <div className="flex items-start justify-between gap-1">
                                <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-white">
                                  {route.name}
                                </p>
                                {authUser && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleSave({
                                        id: route.id,
                                        type: 'route',
                                        name: route.name,
                                        coordinates: route.coordinates,
                                        difficulty: route.difficulty,
                                        activity_type: route.activity_type,
                                        distance_km: route.distance_km,
                                        elevation_gain_m: route.elevation_gain_m ?? undefined,
                                        photos: route.photos,
                                        place_id: route.place_id,
                                      });
                                    }}
                                    className="-m-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                    aria-label={isSaved(route.id) ? 'Unsave route' : 'Save route'}
                                  >
                                    <Bookmark
                                      aria-hidden="true"
                                      className={`h-3.5 w-3.5 ${isSaved(route.id) ? 'fill-amber-400 text-amber-400' : ''}`}
                                    />
                                  </button>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${ds.pill}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${ds.dot}`} />
                                  {DIFFICULTY_LABELS[route.difficulty]}
                                </span>
                                <span className="text-[9px] uppercase tracking-wider text-slate-500">
                                  {formatActivityType(route.activity_type)}
                                </span>
                                {/* Silent when there is no training data to score
                                  against, rather than showing a zero. */}
                                <ReadinessBadge readiness={readinessByRoute[route.id]} />
                                <WeatherAlertBadgeNear
                                  lat={route.coordinates[1]}
                                  lng={route.coordinates[0]}
                                />
                              </div>

                              {/* A labelled list rather than a pipe-separated
                                run-on: at 320px the old row wrapped mid-metric,
                                so a value could land on its own line with no
                                clue what it measured. */}
                              <dl className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]">
                                <div className="flex items-baseline gap-1">
                                  <dt className="text-slate-500">Distance</dt>
                                  <dd className="font-tabular font-semibold text-slate-200">
                                    {route.distance_km.toFixed(1)} km
                                  </dd>
                                </div>
                                {/* Terrain relief sampled near the trailhead, not
                                  ascent along the trail, so it must not be
                                  labelled "gain". */}
                                <div className="flex items-baseline gap-1">
                                  <dt className="text-slate-500">Relief</dt>
                                  <dd className="font-tabular font-semibold text-slate-200">
                                    {route.elevation_gain_m == null
                                      ? 'unknown'
                                      : `${route.elevation_gain_m} m`}
                                  </dd>
                                </div>
                                {/* "away" is only true relative to a place the
                                  user is actually at — never a fallback. */}
                                {route.distance_from_user_km !== undefined &&
                                  locationSource !== 'fallback' && (
                                    <div className="flex items-baseline gap-1">
                                      <dt className="text-slate-500">Away</dt>
                                      <dd className="font-tabular font-semibold text-blue-400">
                                        {route.distance_from_user_km.toFixed(1)} km
                                      </dd>
                                    </div>
                                  )}
                              </dl>
                            </div>
                          </div>
                        </button>
                      );
                    });
                  })()}

                {/* ── Mountains Tab ── */}
                {activeTab === 'mountains' &&
                  (() => {
                    const list = mountains.filter(
                      (m) =>
                        !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                    if (list.length === 0)
                      return (
                        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
                          <Mountain aria-hidden="true" className="h-6 w-6 text-slate-600" />
                          <p className="text-xs font-medium text-slate-400">
                            {searchQuery
                              ? `No mountains match “${searchQuery}”`
                              : 'No mountains found near here'}
                          </p>
                          {searchQuery && (
                            <button
                              type="button"
                              onClick={() => setSearchQuery('')}
                              className={`${buttonSecondary} ${buttonSize.sm} mt-1`}
                            >
                              Clear search
                            </button>
                          )}
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
                          <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-white">
                            {mountain.name}
                          </p>
                          <div className="flex flex-shrink-0 items-center gap-1">
                            {authUser && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSave({
                                    id: mountain.id,
                                    type: 'mountain',
                                    name: mountain.name,
                                    coordinates: mountain.coordinates,
                                    elevation_m: mountain.elevation_m ?? undefined,
                                    prominence_m: mountain.prominence_m,
                                    mountain_type: mountain.mountain_type,
                                    photos: mountain.photos,
                                    place_id: mountain.place_id,
                                  });
                                }}
                                className="-m-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                aria-label={isSaved(mountain.id) ? 'Unsave peak' : 'Save peak'}
                              >
                                <Bookmark
                                  aria-hidden="true"
                                  className={`h-3.5 w-3.5 ${isSaved(mountain.id) ? 'fill-amber-400 text-amber-400' : ''}`}
                                />
                              </button>
                            )}
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10">
                              <Mountain aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300 ring-1 ring-white/10">
                            {mountain.mountain_type}
                          </span>
                          {mountain.trail_class && (
                            <span className="inline-flex items-center rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/30">
                              {mountain.trail_class}
                            </span>
                          )}
                          <WeatherAlertBadgeNear
                            lat={mountain.coordinates[1]}
                            lng={mountain.coordinates[0]}
                          />
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[11px]">
                          <span className="font-tabular font-semibold text-slate-200">
                            {mountain.elevation_m == null
                              ? 'Elevation unknown'
                              : `${mountain.elevation_m} m`}
                          </span>
                          {mountain.prominence_m ? (
                            <>
                              <span className="text-white/20">·</span>
                              <span className="font-tabular text-slate-400">
                                {mountain.prominence_m} m prom
                              </span>
                            </>
                          ) : null}
                        </div>
                      </button>
                    ));
                  })()}

                {/* ── Campsites Tab ── */}
                {activeTab === 'campsites' &&
                  (() => {
                    const list = campsites.filter(
                      (c) =>
                        !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                    if (list.length === 0)
                      return (
                        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
                          <Tent aria-hidden="true" className="h-6 w-6 text-slate-600" />
                          <p className="text-xs font-medium text-slate-400">
                            {searchQuery
                              ? `No campsites match “${searchQuery}”`
                              : 'No campsites found near here'}
                          </p>
                          {searchQuery && (
                            <button
                              type="button"
                              onClick={() => setSearchQuery('')}
                              className={`${buttonSecondary} ${buttonSize.sm} mt-1`}
                            >
                              Clear search
                            </button>
                          )}
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
                          <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-emerald-300">
                            {campsite.name}
                          </p>
                          <div className="flex flex-shrink-0 items-center gap-1">
                            {authUser && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSave({
                                    id: campsite.id,
                                    type: 'campsite',
                                    name: campsite.name,
                                    coordinates: campsite.coordinates,
                                    rating: campsite.rating,
                                    photos: campsite.photos,
                                    place_id: campsite.place_id,
                                  });
                                }}
                                className="-m-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                aria-label={
                                  isSaved(campsite.id) ? 'Unsave campsite' : 'Save campsite'
                                }
                              >
                                <Bookmark
                                  aria-hidden="true"
                                  className={`h-3.5 w-3.5 ${isSaved(campsite.id) ? 'fill-amber-400 text-amber-400' : ''}`}
                                />
                              </button>
                            )}
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/15">
                              <Tent aria-hidden="true" className="h-3.5 w-3.5 text-emerald-400" />
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
                          <WeatherAlertBadgeNear
                            lat={campsite.coordinates[1]}
                            lng={campsite.coordinates[0]}
                          />
                        </div>
                      </button>
                    ));
                  })()}

                {/* ── History Tab ── */}
                {activeTab === 'history' && stravaSyncState !== 'idle' && (
                  <div
                    role="status"
                    className={`mb-1.5 flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                      stravaSyncState === 'syncing'
                        ? 'border-white/10 bg-white/5'
                        : 'border-amber-500/20 bg-amber-500/10'
                    }`}
                  >
                    {stravaSyncState === 'syncing' ? (
                      <>
                        <span className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500" />
                        <p className="text-[11px] text-slate-300">
                          Syncing your Strava activities…
                        </p>
                      </>
                    ) : (
                      <p className="flex-1 text-[11px] text-amber-100">
                        We couldn&apos;t finish syncing Strava. Some activities may be missing.
                      </p>
                    )}
                  </div>
                )}

                {activeTab === 'history' &&
                  (() => {
                    const list = activities.filter(
                      (a) =>
                        !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                    if (list.length === 0)
                      return (
                        <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
                          <Clock aria-hidden="true" className="mx-auto h-5 w-5 text-slate-500" />
                          <p className="mt-2 text-xs text-slate-400">No activities yet</p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            Connect Strava or import GPX files
                          </p>
                          <button
                            onClick={() => setIsDeviceModalOpen(true)}
                            className={`${buttonSecondary} ${buttonSize.sm} mt-3`}
                          >
                            Connect Devices
                          </button>
                        </div>
                      );
                    return list.map((activity) => {
                      const sourceBadge: Record<string, string> = {
                        strava: 'bg-orange-500/15 text-orange-300',
                        coros: 'bg-blue-500/15 text-blue-300',
                        garmin: 'bg-sky-500/15 text-sky-300',
                        komoot: 'bg-green-500/15 text-green-300',
                      };
                      const sourceLabel: Record<string, string> = {
                        strava: 'Strava',
                        coros: 'COROS',
                        garmin: 'Garmin',
                        komoot: 'Komoot',
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
                            <p className="line-clamp-1 text-[13px] font-semibold text-slate-200 group-hover:text-violet-300">
                              {activity.name}
                            </p>
                            <span
                              className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${sourceBadge[activity.source] ?? 'bg-slate-700 text-slate-300'}`}
                            >
                              {sourceLabel[activity.source] ?? activity.source}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] capitalize text-slate-500">
                            {activity.sport_type} ·{' '}
                            {new Date(activity.start_date).toLocaleDateString()}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                            <span>{activity.distance_km.toFixed(1)} km</span>
                            <span className="flex items-center gap-0.5">
                              <TrendingUp aria-hidden="true" className="h-3 w-3" />{' '}
                              {activity.elevation_gain_m} m
                            </span>
                            <span>{duration}</span>
                          </div>
                        </button>
                      );
                    });
                  })()}

                {/* ── Saved Tab ── */}
                {activeTab === 'saved' &&
                  (() => {
                    const list = savedPlaces.filter(
                      (p) =>
                        !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                    if (!authUser) return null;
                    if (list.length === 0)
                      return (
                        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
                          <Bookmark aria-hidden="true" className="h-6 w-6 text-slate-600" />
                          <p className="text-xs font-medium text-slate-500">No saved places yet</p>
                          <p className="text-[10px] text-slate-600">
                            Tap the bookmark icon on any route, peak, or campsite
                          </p>
                        </div>
                      );
                    const typeIcon: Record<string, React.ReactNode> = {
                      route: <Route aria-hidden="true" className="h-3.5 w-3.5 text-blue-400" />,
                      mountain: (
                        <Mountain aria-hidden="true" className="h-3.5 w-3.5 text-slate-300" />
                      ),
                      campsite: (
                        <Tent aria-hidden="true" className="h-3.5 w-3.5 text-emerald-400" />
                      ),
                    };
                    const typeColor: Record<string, string> = {
                      route: 'border-blue-500/30 hover:bg-blue-500/10',
                      mountain: 'border-slate-500/30 hover:bg-white/[0.08]',
                      campsite: 'border-emerald-500/30 hover:bg-emerald-500/[0.07]',
                    };
                    return list.map((place, idx) => (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => {
                          if (place.type === 'route') {
                            const r = routes.find((x) => x.id === place.id);
                            if (r) handleRouteClick(r);
                          } else if (place.type === 'mountain') {
                            const m = mountains.find((x) => x.id === place.id);
                            if (m) handleMountainClick(m);
                          } else {
                            const c = campsites.find((x) => x.id === place.id);
                            if (c) handleCampsiteClick(c);
                          }
                        }}
                        className={`card-enter group w-full rounded-xl border border-white/[0.07] bg-white/5 px-3.5 py-3 text-left transition-all active:scale-[0.99] ${typeColor[place.type] ?? ''}`}
                        style={{ animationDelay: `${idx * 30}ms` }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-white">
                            {place.name}
                          </p>
                          <div className="flex flex-shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSave(place);
                              }}
                              className="rounded p-0.5 text-amber-400 transition-colors hover:text-slate-400"
                              aria-label="Unsave"
                            >
                              <Bookmark aria-hidden="true" className="h-3.5 w-3.5 fill-amber-400" />
                            </button>
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10">
                              {typeIcon[place.type]}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                          <span className="capitalize">{place.type}</span>
                          {place.elevation_m ? (
                            <>
                              <span className="text-white/20">·</span>
                              <span className="font-tabular">{place.elevation_m} m</span>
                            </>
                          ) : null}
                          {place.distance_km ? (
                            <>
                              <span className="text-white/20">·</span>
                              <span className="font-tabular">
                                {place.distance_km.toFixed(1)} km
                              </span>
                            </>
                          ) : null}
                          {place.difficulty ? (
                            <>
                              <span className="text-white/20">·</span>
                              <span className="capitalize">{place.difficulty}</span>
                            </>
                          ) : null}
                        </div>
                      </button>
                    ));
                  })()}
              </div>
            )}
          </div>
        </aside>

        {/* Map View */}
        <div className="relative flex-1">
          <MapLoadingOverlay
            isLoading={isLoading || isLocating}
            message={isLocating ? 'Locating you' : 'Finding routes near you'}
            detail={!isLocating ? userLocation?.address : undefined}
          />

          {/* There is no onboarding anywhere in the product: a first-time
              visitor on a phone sees a spinning map, a hamburger and nothing
              else. One dismissible line, shown once, is the smallest thing that
              fixes that without becoming a tour. */}
          {showFirstRunHint && !isLoading && !saveError && !authError && (
            <div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center px-4">
              <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-slate-900/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur">
                <p className="text-xs text-slate-300">
                  <span className="font-semibold text-white md:hidden">Tap the menu</span>
                  <span className="hidden font-semibold text-white md:inline">
                    Pick a route from the list
                  </span>{' '}
                  to see readiness, weather and gear for any trail.
                </p>
                <button
                  type="button"
                  onClick={dismissFirstRunHint}
                  aria-label="Dismiss tip"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Saving and signing in can both be triggered from the sidebar, the
              map or a modal, so their failure notices live somewhere all three
              can be seen. One slot, so they never stack up and compete. */}
          {(saveError || authError) && (
            <div
              role="alert"
              className="absolute inset-x-0 top-6 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-full border border-amber-500/30 bg-slate-900/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur"
            >
              <span className="text-xs text-amber-100">{saveError ?? authError}</span>
              <button
                type="button"
                onClick={() => {
                  dismissSaveError();
                  setAuthError(null);
                }}
                aria-label="Dismiss"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Save confirmation with a way back. Yields to the error toast,
              which is the more urgent thing to say. */}
          {saveToast && !saveError && !authError && (
            <div
              role="status"
              className="absolute inset-x-0 top-6 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-full border border-white/10 bg-slate-900/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur"
            >
              <span className="text-xs text-slate-200">{saveToast.message}</span>
              <button
                type="button"
                onClick={saveToast.undo}
                className={`${buttonGhost} ${buttonSize.sm} text-blue-400 hover:text-blue-300`}
              >
                Undo
              </button>
            </div>
          )}
          <NavDock
            areaLabel={userLocation?.address ?? null}
            savedCount={savedPlaces.length}
            isSignedIn={Boolean(authUser)}
            isAdmin={adminGate === 'allowed'}
            alerts={dockAlerts}
            pulse={terrainPulse}
            weather={dockWeather}
            onRequestWeather={loadDockWeather}
            onOpenPlanner={() => {
              setPlannerOpen((v) => !v);
              setSidebarOpen(false);
            }}
            onOpenFitness={() => setIsProfileModalOpen(true)}
            onOpenConnectDevices={() => setIsDeviceModalOpen(true)}
            onOpenAdmin={() => setAdminModalOpen(true)}
            onOpenRoadmap={() => setRoadmapOpen(true)}
            legendVisible={showLegend}
            onToggleLegend={() => setShowLegend((v) => !v)}
            nativeControlsVisible={showNativeControls}
            onToggleNativeControls={() => setShowNativeControls((v) => !v)}
            nativePoiVisible={showNativePoi}
            onToggleNativePoi={() => setShowNativePoi((v) => !v)}
            activeTab={activeTab}
            tabCounts={{
              routes: filteredRoutes.length,
              mountains: mountains.length,
              campsites: campsites.length,
              saved: savedPlaces.length,
            }}
            onSelectTab={(tab) => {
              if (tab === 'saved' && !authUser) {
                setAuthError('Sign in to keep a shortlist of places.');
                return;
              }
              setActiveTab(tab);
              setSidebarOpen(true);
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
            onToggleLayer={toggleLayer}
            weatherRadarVisible={showWeatherRadar}
            onToggleWeatherRadar={() => setShowWeatherRadar((v) => !v)}
            onLocate={() => focusUserLocationRef.current?.()}
          />

          <MapDirections
            map={mapInstance}
            origin={userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null}
            target={directionsTarget}
            onClear={() => setDirectionsTarget(null)}
          />

          <RoutePlanner
            isOpen={plannerOpen}
            waypoints={plannerWaypoints}
            onClose={() => setPlannerOpen(false)}
            onRemove={(id) => setPlannerWaypoints((prev) => prev.filter((w) => w.id !== id))}
            onMove={moveWaypoint}
            route={plannerRoute}
            onClear={() => setPlannerWaypoints([])}
            onLoadPlan={(waypoints) => {
              setPlannerWaypoints(waypoints);
              // Frame the loaded plan so it is not off-screen.
              if (mapInstance && waypoints.length > 0) {
                const bounds = new google.maps.LatLngBounds();
                waypoints.forEach((w) =>
                  bounds.extend({ lat: w.coordinates[1], lng: w.coordinates[0] })
                );
                mapInstance.fitBounds(bounds, 80);
              }
            }}
          />

          <MapView
            onMapReady={setMapInstance}
            plannerWaypoints={plannerWaypoints}
            plannerPath={plannerRoute.path}
            onMapClick={plannerOpen ? addWaypoint : undefined}
            showLegend={showLegend}
            showNativeControls={showNativeControls}
            showNativePoi={showNativePoi}
            showWeatherRadar={showWeatherRadar}
            advisories={advisories}
            onAdvisoryClick={(id) => {
              const advisory = advisories.find((a) => a.id === id);
              if (advisory?.url) window.open(advisory.url, '_blank', 'noopener,noreferrer');
            }}
            hiddenLayers={hiddenLayers}
            routes={filteredRoutes}
            mountains={mountains}
            campsites={campsites}
            savedPlaces={savedPlaces}
            userLocation={userLocation ? [userLocation.lng, userLocation.lat] : undefined}
            hasPreciseLocation={hasPreciseLocation}
            isLoaded={isLoaded}
            loadError={loadError}
            onRouteClick={handleRouteClick}
            onMountainClick={handleMountainClick}
            onCampsiteClick={handleCampsiteClick}
            onFocusUserLocation={(fn) => {
              focusUserLocationRef.current = fn;
            }}
            activityPolylines={activityPolylines}
          />
        </div>
      </div>

      <AdminModal isOpen={adminModalOpen} onClose={() => setAdminModalOpen(false)} />

      <RoadmapModal isOpen={roadmapOpen} onClose={() => setRoadmapOpen(false)} />

      <DetailsModal
        isOpen={selectedDetails !== null}
        onClose={() => setSelectedDetails(null)}
        onGetDirections={(target) => {
          setDirectionsTarget(target);
          setSidebarOpen(false);
        }}
        activities={activities}
        onConnectDevices={() => {
          setSelectedDetails(null);
          setIsDeviceModalOpen(true);
        }}
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
