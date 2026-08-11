'use client';

// Fit Ready IQ - Main Page
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useJsApiLoader } from '@react-google-maps/api';
import {
  Mountain,
  Tent,
  Route,
  Search,
  X,
  ChevronRight,
  MapPin,
  TrendingUp,
  ArrowUpDown,
  Clock,
  Bookmark,
  MapPinOff,
} from 'lucide-react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import RouteFilter, { DEFAULT_FILTERS, type FilterState } from '@/components/RouteFilter';
import ConnectDevicesModal from '@/components/ConnectDevicesModal';
import DetailsModal from '@/components/DetailsModal';
import ProfileModal from '@/components/ProfileModal';
import { haversineDistanceKm } from '@/lib/gpxParser';
import { saveActivities, mergeActivities, formatActivityType } from '@/lib/activityTypes';
import ChatBot from '@/components/ChatBot';
import { ReadinessBadge } from '@/components/ReadinessPanel';
import { computeReadiness } from '@/lib/readiness';
import { WeatherAlertBadgeNear } from '@/components/WeatherAlertBadge';
import { recordWeatherAlerts } from '@/lib/weatherAlertCache';
import { NavDock, type DockAlert, type DockWeather } from '@/components/NavDock';
import { MapDirections, type DirectionsTarget } from '@/components/MapDirections';
import { RoutePlanner } from '@/components/RoutePlanner';
import AdminModal from '@/components/admin/AdminModal';
import RoadmapModal from '@/components/RoadmapModal';
import type { PlannerWaypoint } from '@/lib/gpxBuilder';
import { usePlannerRoute } from '@/lib/usePlannerRoute';
import type { Advisory } from '@/lib/advisories';
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
import { DIFFICULTY_LABELS } from '@/lib/routeDifficulty';
import { locationProblemMessage, useUserLocation } from '@/lib/useUserLocation';
import { buttonGhost, buttonPrimary, buttonSecondary, buttonSize } from '@/lib/ui';
import type { Route as RouteData, Mountain as MountainData, Campsite } from '@/lib/placesTypes';
import { toDetailsModalData, type SelectedDetails } from '@/lib/detailsModalMapper';
import { useFirebaseAuth } from '@/lib/useFirebaseAuth';
import { useStravaSync } from '@/lib/useStravaSync';
import { usePlacesData, COLLECTION_LABELS } from '@/lib/usePlacesData';

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

type TabId = 'routes' | 'mountains' | 'campsites' | 'history' | 'saved';

const TAB_IDS: readonly TabId[] = ['routes', 'mountains', 'campsites', 'history', 'saved'];

/** Long enough to notice and act on, short enough not to linger. */
const SAVE_TOAST_MS = 5000;

const FIRST_RUN_HINT_KEY = 'fri_seen_intro';
const FILTERS_KEY = 'fri_filters';
const ACTIVE_TAB_KEY = 'fri_active_tab';

export default function Home() {
  // The shield only renders for allowlisted accounts; the API verifies again.
  const adminGate = useAdminGate();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  // Guards the save effect so it does not immediately overwrite stored
  // preferences with the defaults before the restore has run.
  const [preferencesRestored, setPreferencesRestored] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('routes');
  const focusUserLocationRef = useRef<() => void>(() => {});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<SelectedDetails>(null);
  const { authUser, authBusy, authError, setAuthError, signInGoogle, signInApple, signOut } =
    useFirebaseAuth();
  const { activities, setActivities, stravaSyncState } = useStravaSync(authUser?.uid);
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

  const googleMapsLoaderOptions = useMemo(
    () => ({
      googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      libraries,
    }),
    []
  );

  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);

  const {
    routes,
    mountains,
    campsites,
    isLoading,
    error,
    setError,
    failedCollections,
    elevationUnavailable,
    retryPlacesFetch,
  } = usePlacesData({
    isLoaded,
    userLocation,
    locationStatus,
    locationSource,
    saveAndSetUserLocation,
  });

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
    if (typeof window === 'undefined' || !window.google?.maps) return;
    const service = new google.maps.ElevationService();
    service.getElevationForLocations(
      { locations: [{ lat: coordinates[1], lng: coordinates[0] }] },
      (results, status) => {
        if (status !== google.maps.ElevationStatus.OK || !results?.[0]) return;
        const elevation = Math.round(results[0].elevation);
        setPlannerWaypoints((prev) => prev.map((w) => (w.id === id ? { ...w, elevation } : w)));
      }
    );
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
    list: RouteData[],
    from: { lat: number; lng: number } | null
  ): RouteData[] => {
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
    const highest = withElevation.reduce<MountainData | null>(
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

  const handleRouteClick = (route: RouteData) => {
    setSelectedDetails({ type: 'route', data: route });
  };

  const handleMountainClick = (mountain: MountainData) => {
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
      <AppHeader
        isAdmin={adminGate === 'allowed'}
        authUser={authUser}
        authBusy={authBusy}
        onSignInGoogle={signInGoogle}
        onSignInApple={signInApple}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenConnectDevices={() => setIsDeviceModalOpen(true)}
        onToggleSidebar={() => setSidebarOpen((s) => !s)}
      />

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
          signOut();
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
        data={toDetailsModalData(selectedDetails)}
      />
      <ChatBot />
    </main>
  );
}
