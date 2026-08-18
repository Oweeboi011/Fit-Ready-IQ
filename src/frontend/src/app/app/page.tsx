'use client';

// Fit Ready IQ - Main Page
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import PlacesSidebar from '@/components/PlacesSidebar';
import MapArea from '@/components/MapArea';
import { DEFAULT_FILTERS, type FilterState } from '@/components/RouteFilter';
import { haversineDistanceKm } from '@/lib/gpxParser';
import { saveActivities, mergeActivities } from '@/lib/activityTypes';
import { computeReadiness } from '@/lib/readiness';
import { recordWeatherAlerts } from '@/lib/weatherAlertCache';
import type { DockAlert, DockWeather } from '@/components/NavDock';
import type { DirectionsTarget } from '@/components/MapDirections';
import type { PlannerWaypoint } from '@/lib/gpxBuilder';
import { usePlannerRoute, type PlannerTravelMode } from '@/lib/usePlannerRoute';
import type { Advisory } from '@/lib/advisories';
import {
  layerForActivityType,
  readHiddenLayers,
  writeHiddenLayers,
  type MapLayer,
} from '@/lib/mapLayers';
import { useSavedPlaces, type SavedPlace } from '@/lib/useSavedPlaces';
import { useAdminGate } from '@/lib/useAdminGate';
import { isPlanId, rememberSelectedPlan } from '@/lib/plans';
import { decodePlaceRef, encodePlaceRef, type PlaceRef } from '@/lib/placeUrl';
import { locationProblemMessage, useUserLocation } from '@/lib/useUserLocation';
import type { Route as RouteData, Mountain as MountainData, Campsite } from '@/lib/placesTypes';
import { toDetailsModalData, type SelectedDetails } from '@/lib/detailsModalMapper';
import { useFirebaseAuth } from '@/lib/useFirebaseAuth';
import { useStravaSync } from '@/lib/useStravaSync';
import { usePlacesData, COLLECTION_LABELS } from '@/lib/usePlacesData';

/**
 * The modals are code-split and rendered only while open.
 *
 * Statically imported, all six shipped in the initial `/app` bundle for every
 * visitor — including the admin console, to people who can never open it, and
 * `DetailsModal`, the largest file in the repo, before anyone had clicked a
 * place. Each already guards its own effects on `isOpen` and renders `null`
 * when closed, so gating the render is behaviour-preserving; it is also what
 * makes the split real, since a mounted component loads its chunk regardless.
 */
const ConnectDevicesModal = dynamic(() => import('@/components/ConnectDevicesModal'), {
  ssr: false,
});
const DetailsModal = dynamic(() => import('@/components/DetailsModal'), { ssr: false });
const ProfileModal = dynamic(() => import('@/components/ProfileModal'), { ssr: false });
const AdminModal = dynamic(() => import('@/components/admin/AdminModal'), { ssr: false });
const RoadmapModal = dynamic(() => import('@/components/RoadmapModal'), { ssr: false });
/** Not gated on open state — it renders its own launcher button. */
const ChatBot = dynamic(() => import('@/components/ChatBot'), { ssr: false });

const libraries: ('places' | 'geometry')[] = ['places', 'geometry'];

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

  const googleMapsApiKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();

  const googleMapsLoaderOptions = useMemo(
    () => ({ googleMapsApiKey, libraries }),
    [googleMapsApiKey]
  );

  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);

  /**
   * A blank key is a configuration failure, and it has to be detected here
   * rather than left to the SDK.
   *
   * `useJsApiLoader` only reports `loadError` when the *script* fails to fetch.
   * With an empty key the script loads perfectly well, and Google then paints
   * its own grey "This page can't load Google Maps correctly" watermark over
   * our UI. `gm_authFailure` does not rescue us either: that fires for auth
   * rejections such as `RefererNotAllowedMapError`, not for `NoApiKeys`, and it
   * is registered in an effect that runs after the SDK has already given up.
   *
   * So the absence is checked directly, and the map surface renders its own
   * error state — which already carries a retry and, on localhost, the exact
   * setup checklist. Degrading honestly is the rule this codebase holds to; a
   * third party's error overlay is not us degrading honestly.
   */
  const mapConfigError = useMemo(
    () => (googleMapsApiKey ? undefined : new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set')),
    [googleMapsApiKey]
  );

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

  /**
   * Move the map to a searched place.
   *
   * Zooms in only when the view is wider than the place is useful at — panning a
   * regional view to a summit leaves it an invisible dot, while yanking the zoom
   * on someone already looking at a valley is the camera fighting the user, which
   * this app has form for.
   */
  const goToPlace = useCallback(
    (coordinates: [number, number]) => {
      const map = mapInstance;
      if (!map) return;
      map.panTo({ lat: coordinates[1], lng: coordinates[0] });
      if ((map.getZoom() ?? 0) < 12) map.setZoom(13);
    },
    [mapInstance]
  );

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

  /**
   * Add a searched place to the plan, opening the planner if it is closed.
   *
   * Opening it is the point: the search box exists so a plan can start from a
   * place you found, and making the user open the planner first would be asking
   * them to say the same thing twice.
   */
  const addSearchedPlace = useCallback(
    (coordinates: [number, number], name: string) => {
      setPlannerOpen(true);
      addWaypoint(coordinates, name);
    },
    [addWaypoint]
  );

  // Held here rather than inside RoutePlanner: the hook that does the routing
  // lives at this level, and the panel stays presentational like RouteFilter.
  const [plannerTravelMode, setPlannerTravelMode] = useState<PlannerTravelMode>('walk');
  const plannerRoute = usePlannerRoute(plannerWaypoints, plannerOpen, plannerTravelMode);

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
  }, [pendingPlaceRef, routes, mountains, campsites, activities, isLoading, setError]);

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
      {isDeviceModalOpen && (
        <ConnectDevicesModal
          isOpen={isDeviceModalOpen}
          onClose={() => setIsDeviceModalOpen(false)}
          onActivitiesLoaded={(acts) => {
            const merged = mergeActivities(activities, acts);
            saveActivities(merged);
            setActivities(merged);
          }}
        />
      )}

      {/* Profile Modal */}
      {isProfileModalOpen && (
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
      )}

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
        <PlacesSidebar
          sidebarOpen={sidebarOpen}
          locationProblem={locationProblem}
          locationNoticeDismissed={locationNoticeDismissed}
          onDismissLocationNotice={() => setLocationNoticeDismissed(true)}
          locationSource={locationSource}
          onRetryLocation={retryLocation}
          searchInputRef={searchInputRef}
          userLocation={userLocation}
          hasPreciseLocation={hasPreciseLocation}
          isLocating={isLocating}
          onFocusUserLocation={() => focusUserLocationRef.current?.()}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onTabKeyDown={handleTabKeyDown}
          authUser={authUser}
          filteredRoutes={filteredRoutes}
          mountains={mountains}
          campsites={campsites}
          routes={routes}
          savedPlaces={savedPlaces}
          activities={activities}
          filters={filters}
          onFiltersChange={setFilters}
          isLoading={isLoading}
          error={error}
          onRetryPlaces={retryPlacesFetch}
          elevationUnavailable={elevationUnavailable}
          failedCollections={failedCollections}
          collectionLabels={COLLECTION_LABELS}
          isSaved={isSaved}
          onToggleSave={handleToggleSave}
          onRouteClick={handleRouteClick}
          onMountainClick={handleMountainClick}
          onCampsiteClick={handleCampsiteClick}
          onActivityClick={(activity) => setSelectedDetails({ type: 'activity', data: activity })}
          readinessByRoute={readinessByRoute}
          stravaSyncState={stravaSyncState}
          onConnectDevices={() => setIsDeviceModalOpen(true)}
        />

        {/* Map View */}
        <MapArea
          isLoading={isLoading}
          isLocating={isLocating}
          userLocation={userLocation}
          showFirstRunHint={showFirstRunHint}
          onDismissFirstRunHint={dismissFirstRunHint}
          saveError={saveError}
          authError={authError}
          onDismissSaveError={dismissSaveError}
          onDismissAuthError={() => setAuthError(null)}
          saveToast={saveToast}
          savedCount={savedPlaces.length}
          isSignedIn={Boolean(authUser)}
          isAdmin={adminGate === 'allowed'}
          dockAlerts={dockAlerts}
          terrainPulse={terrainPulse}
          dockWeather={dockWeather}
          onRequestWeather={loadDockWeather}
          onOpenPlanner={() => {
            setPlannerOpen((v) => !v);
            setSidebarOpen(false);
          }}
          onOpenFitness={() => setIsProfileModalOpen(true)}
          onOpenConnectDevices={() => setIsDeviceModalOpen(true)}
          onOpenAdmin={() => setAdminModalOpen(true)}
          onOpenRoadmap={() => setRoadmapOpen(true)}
          showLegend={showLegend}
          onToggleLegend={() => setShowLegend((v) => !v)}
          showNativeControls={showNativeControls}
          onToggleNativeControls={() => setShowNativeControls((v) => !v)}
          showNativePoi={showNativePoi}
          onToggleNativePoi={() => setShowNativePoi((v) => !v)}
          activeTab={activeTab}
          tabCounts={{
            routes: filteredRoutes.length,
            mountains: mountains.length,
            campsites: campsites.length,
            saved: savedPlaces.length,
          }}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setSidebarOpen(true);
          }}
          onSelectTabAuthRequired={() => setAuthError('Sign in to keep a shortlist of places.')}
          hiddenLayers={hiddenLayers}
          advisories={advisories}
          advisorySource={advisorySource}
          layerCounts={layerCounts}
          onToggleLayer={toggleLayer}
          showWeatherRadar={showWeatherRadar}
          onToggleWeatherRadar={() => setShowWeatherRadar((v) => !v)}
          onLocate={() => focusUserLocationRef.current?.()}
          mapInstance={mapInstance}
          onMapReady={setMapInstance}
          directionsTarget={directionsTarget}
          onClearDirections={() => setDirectionsTarget(null)}
          plannerOpen={plannerOpen}
          plannerWaypoints={plannerWaypoints}
          onClosePlanner={() => setPlannerOpen(false)}
          onRemoveWaypoint={(id) => setPlannerWaypoints((prev) => prev.filter((w) => w.id !== id))}
          onMoveWaypoint={moveWaypoint}
          plannerRoute={plannerRoute}
          plannerTravelMode={plannerTravelMode}
          onPlannerTravelModeChange={setPlannerTravelMode}
          onClearPlanner={() => setPlannerWaypoints([])}
          onLoadPlan={setPlannerWaypoints}
          onMapClick={plannerOpen ? addWaypoint : undefined}
          onGoToPlace={goToPlace}
          onAddSearchedPlace={addSearchedPlace}
          hasPreciseLocation={hasPreciseLocation}
          isLoaded={isLoaded}
          // A missing key is reported as a load failure, because to the person
          // looking at the screen that is exactly what it is.
          loadError={loadError ?? mapConfigError}
          filteredRoutes={filteredRoutes}
          mountains={mountains}
          campsites={campsites}
          savedPlaces={savedPlaces}
          onRouteClick={handleRouteClick}
          onMountainClick={handleMountainClick}
          onCampsiteClick={handleCampsiteClick}
          onFocusUserLocation={(fn) => {
            focusUserLocationRef.current = fn;
          }}
          activityPolylines={activityPolylines}
          onAdvisoryUrlOpen={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
        />
      </div>

      {adminModalOpen && (
        <AdminModal isOpen={adminModalOpen} onClose={() => setAdminModalOpen(false)} />
      )}

      {roadmapOpen && <RoadmapModal isOpen={roadmapOpen} onClose={() => setRoadmapOpen(false)} />}

      {selectedDetails !== null && (
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
      )}
      <ChatBot />
    </main>
  );
}
