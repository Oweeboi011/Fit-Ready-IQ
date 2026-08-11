'use client';

// Place details: photos, real route metrics, live weather and Strava segments.
import {
  X,
  TrendingUp,
  TrendingDown,
  Mountain,
  Navigation,
  Tent,
  Star,
  Award,
  MapPin,
  Route,
  Backpack,
  Bike,
  CalendarDays,
  CircleCheck,
  Footprints,
  HeartPulse,
  Thermometer,
  Timer,
  CircleParking,
  ClipboardList,
  Clock,
  CloudSun,
  Crosshair,
  Flag,
  Gauge,
  Info,
  ListOrdered,
} from 'lucide-react';

// Module-level caches — survive modal open/close cycles within the same page session
const weatherCache = new Map<string, WeatherResult>();
const photosCache = new Map<string, string[]>();
const WEATHER_TTL_MS = 30 * 60 * 1000; // 30 min, matches server Cache-Control
const weatherCacheTs = new Map<string, number>();
import { useState, useEffect } from 'react';
import Image from 'next/image';

import { formatActivityType } from '@/lib/activityTypes';
import Modal from '@/components/Modal';
import { ReadinessPanel } from '@/components/ReadinessPanel';
import { computeReadiness } from '@/lib/readiness';
import type { Activity } from '@/lib/activityTypes';
import type { RouteDetails, DetailsData } from '@/lib/detailsData';
import { PhotoGallery } from '@/components/PhotoGallery';
import { ShareButton } from '@/components/ShareButton';
import { buttonPrimary, buttonSecondary, buttonSize } from '@/lib/ui';
import { recordWeatherAlerts } from '@/lib/weatherAlertCache';
import type { WeatherAlert } from '@/lib/weatherAlerts';
import { WeatherAlertChips } from '@/components/WeatherAlertBadge';

interface WeatherResult {
  best: string;
  avoid: string;
  temp: string;
  risk: string;
  live: boolean;
  alerts: WeatherAlert[];
}

/**
 * What we show when `/api/weather` gives us nothing.
 *
 * This replaces two blocks of invented seasonal prose ("Nov – Feb (dry
 * season)", "18–26°C at summit") that rendered instantly and were silently
 * swapped for live data when the fetch resolved. The only thing distinguishing
 * the invention from the real forecast was the absence of a small "Live" badge,
 * which nobody reads as "everything here is made up".
 */
/** Metres, or an explicit dash when the Elevation API had nothing to give. */
function metres(value: number | null | undefined): string {
  return value == null ? 'Not available' : `${value} m`;
}

const WEATHER_UNAVAILABLE: WeatherResult = {
  best: 'Forecast unavailable',
  avoid: 'Forecast unavailable',
  temp: '—',
  risk: 'Check a mountain forecast before you set out.',
  live: false,
  alerts: [],
};

interface DetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: DetailsData | null;
  /** Draws the route on our own map instead of handing the user to Google. */
  onGetDirections?: (target: { name: string; coordinates: [number, number] }) => void;
  /** Training history, for the readiness score. */
  activities?: Activity[];
  onConnectDevices?: () => void;
}

export default function DetailsModal({
  isOpen,
  onClose,
  data,
  onGetDirections,
  activities = [],
  onConnectDevices,
}: DetailsModalProps) {
  const [runtimePhotos, setRuntimePhotos] = useState<string[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photosFailed, setPhotosFailed] = useState(false);
  const [liveWeather, setLiveWeather] = useState<WeatherResult | null>(null);

  // Fetch live weather whenever the modal opens for a mountain or route
  useEffect(() => {
    if (!isOpen || !data || data.type === 'activity' || data.type === 'campsite') {
      setLiveWeather(null);
      return;
    }
    const [lng, lat] = data.coordinates;
    const elevation =
      data.type === 'mountain'
        ? (data.summit_elevation ?? data.elevation_m)
        : (data.summit_elevation ?? null);
    const cacheKey = `${lat.toFixed(3)}_${lng.toFixed(3)}_${elevation ?? 0}`;

    // Return cached result if still fresh (30-min TTL)
    const cached = weatherCache.get(cacheKey);
    const cachedTs = weatherCacheTs.get(cacheKey) ?? 0;
    if (cached && Date.now() - cachedTs < WEATHER_TTL_MS) {
      setLiveWeather(cached);
      return;
    }

    const url = `/api/weather?lat=${lat}&lng=${lng}${elevation != null ? `&elevation=${elevation}` : ''}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json && json.summary && !json.error) {
          const result: WeatherResult = {
            best: json.summary.best,
            avoid: json.summary.avoid,
            temp: json.summary.temp,
            risk: json.summary.risk,
            live: true,
            alerts: Array.isArray(json.alerts) ? json.alerts : [],
          };
          weatherCache.set(cacheKey, result);
          weatherCacheTs.set(cacheKey, Date.now());
          setLiveWeather(result);
          recordWeatherAlerts(lat, lng, result.alerts);
        }
      })
      .catch(() => {
        /* silently fall back to static notes */
      });
  }, [isOpen, data]);

  // Lazily fetch photos from Google Places when the modal opens
  useEffect(() => {
    if (!isOpen || !data) {
      setRuntimePhotos([]);
      return;
    }

    if (data.type === 'activity') {
      return;
    }

    const placeId = data.place_id;
    const existingPhotos = data.photos;
    if (!placeId || (existingPhotos && existingPhotos.length > 0)) return;
    if (typeof window === 'undefined' || !window.google?.maps?.places) return;

    // Return cached photos without hitting Places API again
    if (photosCache.has(placeId)) {
      setRuntimePhotos(photosCache.get(placeId)!);
      return;
    }

    setLoadingPhotos(true);
    setPhotosFailed(false);
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails({ placeId, fields: ['photos'] }, (place, status) => {
      setLoadingPhotos(false);
      const { OK, ZERO_RESULTS } = google.maps.places.PlacesServiceStatus;

      if (status === OK && place?.photos) {
        const urls = place.photos
          .slice(0, 6)
          .map((p) => p.getUrl({ maxWidth: 800, maxHeight: 600 }));
        photosCache.set(placeId, urls);
        setRuntimePhotos(urls);
        return;
      }

      // A place genuinely without photos and a failed request used to look
      // identical — both fell through to "No photos available".
      if (status !== OK && status !== ZERO_RESULTS) {
        console.error('Place photos request failed:', status);
        setPhotosFailed(true);
      }
    });
  }, [isOpen, data]);

  if (!isOpen || !data) return null;

  // Merge pre-fetched photos with any runtime-loaded ones
  const resolvedPhotos =
    data.type !== 'activity' && data.photos?.length ? data.photos : runtimePhotos;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'text-green-400 bg-green-500/10';
      case 'moderate':
        return 'text-orange-400 bg-orange-500/10';
      case 'challenging':
        return 'text-red-400 bg-red-500/10';
      default:
        return 'text-slate-600 bg-white/[0.06]';
    }
  };

  /**
   * Figures that follow from the route data we actually hold.
   *
   * An `elevationLoss` of `gain * 0.3` and a `maxGrade` of `averageGrade * 2.5`
   * used to be returned from here and rendered as measurements. They were
   * guesses with no input beyond the difficulty label, so they are gone; only
   * numbers derived from real fields remain.
   */
  const calculateElevationMetrics = (route: RouteDetails) => {
    const elevationGain = route.elevation_gain_m;
    const distance = route.distance_km;
    const averageGrade =
      elevationGain == null
        ? null
        : parseFloat(((elevationGain / (distance * 1000)) * 100).toFixed(1));

    const startElevation = route.jumpoff_elevation ?? null;
    const summitElevation =
      route.summit_elevation ??
      (startElevation == null || elevationGain == null ? null : startElevation + elevationGain);

    return {
      elevationGain,
      averageGrade,
      startElevation,
      summitElevation,
    };
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      label={data.name}
      title={
        <>
          <div
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
              data.type === 'mountain'
                ? 'bg-white/[0.06]'
                : data.type === 'campsite'
                  ? 'bg-emerald-500/10'
                  : 'bg-blue-500/10'
            }`}
          >
            {data.type === 'route' ? (
              <Route aria-hidden="true" className="h-4 w-4 text-blue-400" />
            ) : data.type === 'mountain' ? (
              <Mountain aria-hidden="true" className="h-4 w-4 text-slate-600" />
            ) : (
              <Tent aria-hidden="true" className="h-4 w-4 text-emerald-400" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold leading-tight text-white">{data.name}</h2>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {data.type === 'mountain'
                ? 'Mountain / Peak'
                : data.type === 'campsite'
                  ? 'Campsite'
                  : data.type === 'route'
                    ? `${formatActivityType(data.activity_type)} · ${data.difficulty}`
                    : ''}
            </p>
          </div>
        </>
      }
    >
      {/* Content */}
      <div className="p-6">
        {data.type === 'route' ? (
          (() => {
            const metrics = calculateElevationMetrics(data);

            // Determine profile type
            const isCycling = data.activity_type === 'bike';
            const isHiking = !isCycling;
            // These read 'BIKE Cycling Profile' / 'MTN Mountaineering Profile'
            // — leftover icon placeholders that shipped as visible text.
            const profileTitle = isCycling ? 'Cycling route' : 'Mountaineering route';
            const profileDescription = isCycling
              ? 'Complete cycling route analysis with terrain, grade, and performance metrics'
              : 'Detailed mountaineering route with elevation, grade, and terrain information';

            return (
              <div className="space-y-6">
                {/* Profile type label */}
                <div
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                    isCycling
                      ? 'border-blue-500/30 bg-blue-500/10'
                      : 'border-emerald-500/30 bg-emerald-500/10'
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-md ${
                      isCycling ? 'bg-blue-500/20' : 'bg-emerald-500/20'
                    }`}
                  >
                    {isCycling ? (
                      <Route aria-hidden="true" className="h-4 w-4 text-blue-400" />
                    ) : (
                      <Mountain aria-hidden="true" className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        isCycling ? 'text-blue-300' : 'text-emerald-300'
                      }`}
                    >
                      {isCycling ? 'Cycling Profile' : 'Mountaineering Profile'}
                    </p>
                    <p className="text-xs text-slate-400">{profileDescription}</p>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <Route aria-hidden="true" className="h-3 w-3" />
                      Distance
                    </p>
                    <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                      {data.distance_km.toFixed(1)} km
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <TrendingUp aria-hidden="true" className="h-3 w-3" />
                      Relief
                    </p>
                    <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                      {data.elevation_gain_m == null ? '—' : `${data.elevation_gain_m} m`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <Gauge aria-hidden="true" className="h-3 w-3" />
                      Difficulty
                    </p>
                    <p className="mt-1.5 text-xl font-bold capitalize text-white">
                      {data.difficulty}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <Footprints aria-hidden="true" className="h-3 w-3" />
                      Activity
                    </p>
                    <p className="mt-1.5 text-xl font-bold capitalize text-white">
                      {formatActivityType(data.activity_type)}
                    </p>
                  </div>
                </div>

                {/* The question the whole product exists to answer, put
                      above the photos because it is why they opened this. */}
                <ReadinessPanel
                  readiness={computeReadiness(
                    { distanceKm: data.distance_km, ascentM: data.elevation_gain_m },
                    activities
                  )}
                  onConnectDevices={onConnectDevices}
                />

                <PhotoGallery
                  photos={resolvedPhotos}
                  loading={loadingPhotos}
                  failed={photosFailed}
                  placeName={data.name}
                />

                {/* Strava Segment Records */}
                {data.strava_segment && (
                  <div>
                    <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <Award aria-hidden="true" className="h-3.5 w-3.5" />
                      Strava Segment
                    </h3>
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">
                          {data.strava_segment.name}
                        </p>
                        <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {data.strava_segment.total_efforts || 0} efforts
                        </span>
                      </div>
                      <div className="mb-3 grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-white/[0.06] px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">
                            Distance
                          </p>
                          <p className="font-tabular text-base font-bold text-white">
                            {data.strava_segment.distance.toFixed(1)} km
                          </p>
                        </div>
                        <div className="rounded-lg bg-white/[0.06] px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">
                            Avg Grade
                          </p>
                          <p className="font-tabular text-base font-bold text-white">
                            {data.strava_segment.avg_grade.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      {(data.strava_segment.kom_time || data.strava_segment.qom_time) && (
                        <div className="grid grid-cols-2 gap-2">
                          {data.strava_segment.kom_time && (
                            <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                                KOM
                              </p>
                              <p className="font-tabular text-base font-bold text-blue-200">
                                {data.strava_segment.kom_time}
                              </p>
                            </div>
                          )}
                          {data.strava_segment.qom_time && (
                            <div className="rounded-lg border border-pink-500/25 bg-pink-500/10 px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-pink-400">
                                QOM
                              </p>
                              <p className="font-tabular text-base font-bold text-pink-200">
                                {data.strava_segment.qom_time}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* The elevation profile that stood here was synthesized, not
                      measured: generateElevationProfile() interpolated 20 points
                      and added Math.sin(progress * PI * 4) as "natural variation",
                      while the stats row under it reported an elevation loss of
                      gain * 0.3 and a max grade of average * 2.5. It is removed
                      until a real elevation series is available for the track. */}

                {/* Route Summary — hike only */}
                {!isCycling && (
                  <div>
                    <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <ListOrdered aria-hidden="true" className="h-3.5 w-3.5" />
                      Route Summary
                    </h3>
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-5">
                      <div className="space-y-4">
                        <div className="flex items-start">
                          <div className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-500/15">
                            <span className="font-bold text-green-400">1</span>
                          </div>
                          <div className="flex-1">
                            <h4 className="mb-1 font-semibold text-white">
                              Starting Point (Jumpoff)
                            </h4>
                            <p className="text-sm text-slate-300">
                              {metrics.startElevation == null
                                ? 'Check weather and register at the trailhead before starting.'
                                : `Begin your hike at ${metrics.startElevation} m. Check weather and register at the trailhead before starting.`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <div className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                            <span className="font-bold text-blue-400">2</span>
                          </div>
                          <div className="flex-1">
                            <h4 className="mb-1 font-semibold text-white">The Ascent</h4>
                            <p className="text-sm text-slate-300">
                              Gain {metrics.elevationGain}m of elevation through varied terrain.
                              Pace yourself and stay hydrated.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <div className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-500/15">
                            <span className="font-bold text-red-400">3</span>
                          </div>
                          <div className="flex-1">
                            <h4 className="mb-1 font-semibold text-white">
                              Summit / Endpoint ({metrics.summitElevation}m)
                            </h4>
                            <p className="text-sm text-slate-300">
                              Reach the highest point and enjoy the views. Rest before descending.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Elevation Details — hike only */}
                {!isCycling && (
                  <div>
                    <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                      Elevation Details
                    </h3>
                    <div className="space-y-3 rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                        <div className="flex items-center">
                          <div className="mr-3 h-2.5 w-2.5 rounded-full bg-emerald-500"></div>
                          <div>
                            <p className="text-sm font-medium text-white">Jumpoff Point</p>
                            <p className="text-xs text-slate-400">Starting elevation</p>
                          </div>
                        </div>
                        <p className="font-tabular text-base font-bold text-white">
                          {metrics.startElevation}m
                        </p>
                      </div>
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                        <div className="flex items-center">
                          <div className="mr-3 h-2.5 w-2.5 rounded-full bg-red-500"></div>
                          <div>
                            <p className="text-sm font-medium text-white">Summit / Endpoint</p>
                            <p className="text-xs text-slate-400">Peak elevation</p>
                          </div>
                        </div>
                        <p className="font-tabular text-base font-bold text-white">
                          {metrics.summitElevation}m
                        </p>
                      </div>
                      <div className="pt-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-300">Total Elevation Gain</p>
                          <p className="font-tabular text-base font-bold text-blue-400">
                            +{metrics.elevationGain}m
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Location — cycling only */}
                {isCycling && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                      Location
                    </h3>
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/40 p-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-400">Latitude</p>
                          <p className="font-mono text-sm font-medium text-white">
                            {data.coordinates[1].toFixed(6)}°
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Longitude</p>
                          <p className="font-mono text-sm font-medium text-white">
                            {data.coordinates[0].toFixed(6)}°
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Estimated Time — cycling only */}
                {isCycling && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                      Estimated Time
                    </h3>
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/40 p-4">
                      <p className="text-xs text-slate-400">Based on distance and elevation gain</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {(() => {
                          if (data.elevation_gain_m == null) return 'Not available';
                          const totalMinutes = Math.round(
                            data.distance_km * 3.5 + data.elevation_gain_m * 0.3
                          );
                          return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
                        })()}
                      </p>
                    </div>
                  </div>
                )}

                {/* Activity-Specific Profile Details */}
                {isCycling ? (
                  <div>
                    <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <Bike aria-hidden="true" className="h-3.5 w-3.5" />
                      Cycling Details
                    </h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Avg Speed Zone
                        </p>
                        <p className="mt-1.5 text-base font-bold text-white">
                          {metrics.averageGrade == null
                            ? '—'
                            : metrics.averageGrade < 3
                              ? '25–30 km/h'
                              : metrics.averageGrade < 6
                                ? '18–25 km/h'
                                : '12–18 km/h'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {metrics.averageGrade == null
                            ? 'Needs elevation data'
                            : metrics.averageGrade < 3
                              ? 'Fast rolling terrain'
                              : metrics.averageGrade < 6
                                ? 'Moderate climbing'
                                : 'Steep climbs'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Bike Type
                        </p>
                        <p className="mt-1.5 text-base font-bold text-white">
                          {data.difficulty === 'easy'
                            ? 'Road / Hybrid'
                            : data.difficulty === 'moderate'
                              ? 'Gravel / MTB'
                              : 'Mountain Bike'}
                        </p>
                        <p className="text-xs text-slate-400">Recommended category</p>
                      </div>
                      <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Power Output
                        </p>
                        <p className="mt-1.5 text-base font-bold text-white">
                          {metrics.averageGrade == null
                            ? '—'
                            : metrics.averageGrade < 4
                              ? '180–220W'
                              : metrics.averageGrade < 8
                                ? '220–280W'
                                : '280–350W'}
                        </p>
                        <p className="text-xs text-slate-400">Estimated avg watts</p>
                      </div>
                      <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Technical Level
                        </p>
                        <p className="mt-1.5 text-base font-bold text-white">
                          {data.difficulty === 'easy'
                            ? 'Basic'
                            : data.difficulty === 'moderate'
                              ? 'Intermediate'
                              : 'Advanced'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {data.difficulty === 'easy'
                            ? 'Smooth surfaces'
                            : data.difficulty === 'moderate'
                              ? 'Mixed terrain'
                              : 'Technical sections'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  // ── Hike / Backpack / Tour — full pre-climb briefing ──
                  (() => {
                    const summitElev = data.summit_elevation ?? metrics.summitElevation;
                    const jumpoffElev = data.jumpoff_elevation ?? metrics.startElevation;
                    const elevGain =
                      summitElev == null || jumpoffElev == null ? null : summitElev - jumpoffElev;
                    const ascentHours = elevGain == null ? null : elevGain / 300;
                    const lo = ascentHours == null ? null : Math.max(1, Math.floor(ascentHours));
                    const hi = ascentHours == null ? null : Math.ceil(ascentHours * 1.3);
                    const isHighAlt = (summitElev ?? 0) > 2500;
                    const isTechnical = (summitElev ?? 0) > 2000;

                    const weatherNotes = liveWeather ?? WEATHER_UNAVAILABLE;

                    const gearList = [
                      ...(isHighAlt
                        ? [
                            'Trekking poles (mandatory)',
                            'Crampon-compatible boots',
                            'Fleece + waterproof outer layer',
                          ]
                        : ['Ankle-support trail shoes or boots', 'Lightweight rain jacket']),
                      '3–4L water capacity (hydration bladder + bottle)',
                      'Headlamp + spare batteries',
                      'First aid kit with blister care',
                      'Emergency bivy / space blanket',
                      isTechnical
                        ? 'Fixed rope gloves + harness (technical sections)'
                        : 'Gaiters for muddy sections',
                      'High-energy snacks (nuts, energy bars, dried fruit)',
                      'Sunscreen SPF 50+, buff/neck gaiter',
                      'Whistle, map or offline GPS',
                      'LNT waste bag — pack out all trash',
                    ];

                    return (
                      <>
                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3 text-center">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              <Clock aria-hidden="true" className="h-3 w-3" />
                              Climb Time
                            </p>
                            <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                              {lo}–{hi}h
                            </p>
                            <p className="text-[11px] text-slate-400">Naismith&apos;s rule</p>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3 text-center">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              <HeartPulse aria-hidden="true" className="h-3 w-3" />
                              Fitness
                            </p>
                            <p className="mt-1.5 text-sm font-bold text-white">
                              {data.difficulty === 'challenging'
                                ? 'Advanced'
                                : data.difficulty === 'moderate'
                                  ? 'Intermediate'
                                  : 'Beginner'}
                            </p>
                            <p className="text-[11px] text-slate-400">required level</p>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3 text-center">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              <CalendarDays aria-hidden="true" className="h-3 w-3" />
                              Best Season
                            </p>
                            <p className="mt-1.5 text-sm font-bold leading-tight text-white">
                              {weatherNotes.best}
                            </p>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3 text-center">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              <Thermometer aria-hidden="true" className="h-3 w-3" />
                              Summit Temp
                            </p>
                            <p className="mt-1.5 text-sm font-bold text-white">
                              {weatherNotes.temp}
                            </p>
                            <p className="text-[11px] text-slate-400">at peak</p>
                          </div>
                        </div>

                        {/* Pre-Climb Briefing */}
                        <div className="space-y-3">
                          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-white/[0.06]">
                              <ClipboardList
                                aria-hidden="true"
                                className="h-3 w-3 text-slate-600"
                              />
                            </span>
                            Pre-Climb Briefing
                          </h3>

                          <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                            <div className="flex items-start gap-3">
                              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                                <CircleParking
                                  aria-hidden="true"
                                  className="h-4 w-4 text-blue-400"
                                />
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-white">Where to Park</p>
                                {/* The old copy asserted a specific barangay hall, slot
                                      scarcity and a 5 AM cutoff for every route in the world.
                                      The Maps link is the part that was actually true. */}
                                <a
                                  href={`https://www.google.com/maps/search/parking+near+${data.coordinates[1]},${data.coordinates[0]}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"
                                >
                                  Find parking on Maps →
                                </a>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                            <div className="flex items-start gap-3">
                              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                                <Flag aria-hidden="true" className="h-4 w-4 text-emerald-400" />
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-white">Jumpoff Point</p>
                                <p className="mt-1 font-mono text-xs text-slate-400">
                                  {data.coordinates[1].toFixed(5)}°,{' '}
                                  {data.coordinates[0].toFixed(5)}°
                                </p>
                                <p className="mt-1.5 text-xs text-slate-400">
                                  Permit and registration rules vary by trail — check with the local
                                  authority before you go.
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                            <div className="flex items-start gap-3">
                              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-sky-500/10">
                                <CloudSun aria-hidden="true" className="h-4 w-4 text-sky-400" />
                              </span>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-white">
                                    Weather Conditions
                                  </p>
                                  {weatherNotes.live && (
                                    <span className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-400">
                                      Live
                                    </span>
                                  )}
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <div className="rounded-md bg-emerald-500/10 px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                                      Best time
                                    </p>
                                    <p className="text-sm font-bold text-emerald-300">
                                      {weatherNotes.best}
                                    </p>
                                  </div>
                                  <div className="rounded-md bg-red-500/10 px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">
                                      Avoid
                                    </p>
                                    <p className="text-sm font-bold text-red-300">
                                      {weatherNotes.avoid}
                                    </p>
                                  </div>
                                </div>
                                <p className="mt-2 rounded-md bg-white/5 px-3 py-2 text-xs text-slate-300">
                                  RISK: {weatherNotes.risk}
                                </p>
                                <WeatherAlertChips alerts={weatherNotes.alerts} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Gear */}
                        <div>
                          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-white/[0.06]">
                              <Backpack aria-hidden="true" className="h-3 w-3 text-slate-600" />
                            </span>
                            Recommended Gear
                          </h3>
                          <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                              {gearList.map((item, i) => (
                                <div
                                  key={i}
                                  className="flex items-start gap-2 text-sm text-slate-200"
                                >
                                  <span className="mt-0.5 flex-shrink-0 text-emerald-500">-</span>
                                  {item}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Coordinates */}
                        <div>
                          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                            <Crosshair aria-hidden="true" className="h-3.5 w-3.5" />
                            Coordinates
                          </h3>
                          <div className="grid grid-cols-2 gap-4 rounded-lg border border-white/[0.06] bg-slate-800/40 px-4 py-3">
                            <div>
                              <p className="text-xs text-slate-400">Latitude</p>
                              <p className="font-mono text-sm font-medium text-white">
                                {data.coordinates[1].toFixed(6)}°
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400">Longitude</p>
                              <p className="font-mono text-sm font-medium text-white">
                                {data.coordinates[0].toFixed(6)}°
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()
                )}

                {/* Actions — "Add to Training Plan" led this row in the
                      loudest treatment on the screen and had no handler. */}
                <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
                  <button
                    type="button"
                    onClick={() => {
                      onGetDirections?.({ name: data.name, coordinates: data.coordinates });
                      onClose();
                    }}
                    className={`${buttonPrimary} ${buttonSize.md} flex-1`}
                  >
                    Get Directions
                  </button>
                  <ShareButton
                    kind="route"
                    id={data.id}
                    name={data.name}
                    summary={
                      data.elevation_gain_m == null
                        ? `${data.distance_km.toFixed(1)} km`
                        : `${data.distance_km.toFixed(1)} km · ${data.elevation_gain_m} m gain`
                    }
                  />
                </div>
              </div>
            );
          })()
        ) : data.type === 'mountain' ? (
          <div className="space-y-6">
            {/* Mountaineer Profile type label */}
            <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-slate-800/40 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-700">
                <Mountain aria-hidden="true" className="h-4 w-4 text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Mountaineer Profile</p>
                <p className="text-xs text-slate-400">
                  Complete mountain climbing analysis with elevation, grade, and route planning
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Mountain aria-hidden="true" className="h-3 w-3" />
                  Elevation
                </p>
                <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                  {data.elevation_m == null ? '—' : `${data.elevation_m} m`}
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <TrendingUp aria-hidden="true" className="h-3 w-3" />
                  Prominence
                </p>
                <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                  {data.prominence_m} m
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Tent aria-hidden="true" className="h-3 w-3" />
                  Type
                </p>
                <p className="mt-1.5 text-xl font-bold capitalize text-white">
                  {data.mountain_type}
                </p>
              </div>
            </div>

            <PhotoGallery
              photos={resolvedPhotos}
              loading={loadingPhotos}
              failed={photosFailed}
              placeName={data.name}
            />

            {/* Strava Segment Records */}
            {data.strava_segment && (
              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                  <Award aria-hidden="true" className="h-3.5 w-3.5" />
                  Strava Segment
                </h3>
                <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{data.strava_segment.name}</p>
                    <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {data.strava_segment.total_efforts || 0} efforts
                    </span>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white/[0.06] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Distance</p>
                      <p className="font-tabular text-base font-bold text-white">
                        {data.strava_segment.distance.toFixed(1)} km
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.06] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">
                        Avg Grade
                      </p>
                      <p className="font-tabular text-base font-bold text-white">
                        {data.strava_segment.avg_grade.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  {(data.strava_segment.kom_time || data.strava_segment.qom_time) && (
                    <div className="grid grid-cols-2 gap-2">
                      {data.strava_segment.kom_time && (
                        <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                            KOM
                          </p>
                          <p className="font-tabular text-base font-bold text-blue-200">
                            {data.strava_segment.kom_time}
                          </p>
                        </div>
                      )}
                      {data.strava_segment.qom_time && (
                        <div className="rounded-lg border border-pink-500/25 bg-pink-500/10 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-pink-400">
                            QOM
                          </p>
                          <p className="font-tabular text-base font-bold text-pink-200">
                            {data.strava_segment.qom_time}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* The elevation profile that stood here was synthesized, not
                    measured: generateElevationProfile() interpolated 20 points
                    and added Math.sin(progress * PI * 4) as "natural variation",
                    while the stats row under it reported an elevation loss of
                    gain * 0.3 and a max grade of average * 2.5. It is removed
                    until a real elevation series is available for the track. */}

            {/* Route Summary - For Mountains */}
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                <ListOrdered aria-hidden="true" className="h-3.5 w-3.5" />
                Route Summary
              </h3>
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-5">
                <div className="space-y-4">
                  <div className="flex items-start">
                    <div className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-500/15">
                      <span className="font-bold text-green-400">1</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="mb-1 font-semibold text-white">Starting Point (Jumpoff)</h4>
                      <p className="text-sm text-slate-300">
                        Begin your climb at {data.jumpoff_elevation || 'the base elevation'}m.
                        Prepare proper gear and check weather conditions before starting.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                      <span className="font-bold text-blue-400">2</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="mb-1 font-semibold text-white">The Ascent</h4>
                      <p className="text-sm text-slate-300">
                        {(data.summit_elevation ?? data.elevation_m)
                          ? `Gain ${(data.summit_elevation ?? data.elevation_m!) - (data.jumpoff_elevation ?? 0)} m of elevation through varied terrain.`
                          : 'Elevation for this peak is unavailable.'}{' '}
                        Pace yourself and stay hydrated.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-500/15">
                      <span className="font-bold text-red-400">3</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="mb-1 font-semibold text-white">
                        Summit ({data.summit_elevation || data.elevation_m}m)
                      </h4>
                      <p className="text-sm text-slate-300">
                        Reach the peak and enjoy panoramic views. Take time to rest and capture the
                        moment before descending.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Jumpoff to Summit - For Mountains */}
            {(data.jumpoff_elevation || data.summit_elevation) && (
              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                  <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                  Elevation Details
                </h3>
                <div className="space-y-3 rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                  {data.jumpoff_elevation && (
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                      <div className="flex items-center">
                        <div className="mr-3 h-2.5 w-2.5 rounded-full bg-emerald-500"></div>
                        <div>
                          <p className="text-sm font-medium text-white">Jumpoff Point</p>
                          <p className="text-xs text-slate-400">Starting elevation</p>
                        </div>
                      </div>
                      <p className="font-tabular text-base font-bold text-white">
                        {data.jumpoff_elevation}m
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                    <div className="flex items-center">
                      <div className="mr-3 h-2.5 w-2.5 rounded-full bg-red-500"></div>
                      <div>
                        <p className="text-sm font-medium text-white">Summit</p>
                        <p className="text-xs text-slate-400">Peak elevation</p>
                      </div>
                    </div>
                    <p className="font-tabular text-base font-bold text-white">
                      {data.summit_elevation || data.elevation_m}m
                    </p>
                  </div>
                  {data.jumpoff_elevation != null &&
                    (data.summit_elevation ?? data.elevation_m) != null && (
                      <div className="pt-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-300">Total Elevation Gain</p>
                          <p className="font-tabular text-base font-bold text-blue-400">
                            +{(data.summit_elevation ?? data.elevation_m!) - data.jumpoff_elevation}
                            m
                          </p>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* ── Pre-Climb Briefing ── */}
            {(() => {
              const summit = data.summit_elevation ?? data.elevation_m;
              const elevGain = summit == null ? null : summit - (data.jumpoff_elevation ?? 0);
              const ascentHours = elevGain == null ? null : elevGain / 300;
              const lo = ascentHours == null ? null : Math.max(1, Math.floor(ascentHours));
              const hi = ascentHours == null ? null : Math.ceil(ascentHours * 1.3);
              const isHighAlt = (data.elevation_m ?? 0) > 2500;
              const isTechnical = (data.elevation_m ?? 0) > 2000;

              const weatherNotes = liveWeather ?? WEATHER_UNAVAILABLE;

              const gearList = [
                ...(isHighAlt
                  ? [
                      'Trekking poles (mandatory)',
                      'Crampon-compatible boots',
                      'Fleece + waterproof outer layer',
                    ]
                  : ['Ankle-support trail shoes or boots', 'Lightweight rain jacket']),
                '3–4L water capacity (hydration bladder + bottle)',
                'Headlamp + spare batteries',
                'First aid kit with blister care',
                'Emergency bivy / space blanket',
                isTechnical
                  ? 'Fixed rope gloves + harness (technical sections)'
                  : 'Gaiters for muddy sections',
                'High-energy snacks (nuts, energy bars, dried fruit)',
                'Sunscreen SPF 50+, buff/neck gaiter',
                'Whistle, map or offline GPS',
                'LNT waste bag — pack out all trash',
              ];

              return (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3 text-center">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        <Clock aria-hidden="true" className="h-3 w-3" />
                        Climb Time
                      </p>
                      <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                        {lo}–{hi}h
                      </p>
                      <p className="text-[11px] text-slate-400">ascent (Naismith)</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3 text-center">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        <HeartPulse aria-hidden="true" className="h-3 w-3" />
                        Fitness
                      </p>
                      <p className="mt-1.5 text-sm font-bold text-white">
                        {data.elevation_m == null
                          ? 'Not available'
                          : data.elevation_m > 3000
                            ? 'Elite'
                            : data.elevation_m > 2000
                              ? 'Advanced'
                              : data.elevation_m > 1000
                                ? 'Intermediate'
                                : 'Beginner'}
                      </p>
                      <p className="text-[11px] text-slate-400">required level</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3 text-center">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        <CalendarDays aria-hidden="true" className="h-3 w-3" />
                        Best Season
                      </p>
                      <p className="mt-1.5 text-sm font-bold leading-tight text-white">
                        {weatherNotes.best}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3 text-center">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        <Thermometer aria-hidden="true" className="h-3 w-3" />
                        Summit Temp
                      </p>
                      <p className="mt-1.5 text-sm font-bold text-white">{weatherNotes.temp}</p>
                      <p className="text-[11px] text-slate-400">at peak</p>
                    </div>
                  </div>

                  {/* Logistics cards */}
                  <div className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-white/[0.06]">
                        <ClipboardList aria-hidden="true" className="h-3 w-3 text-slate-600" />
                      </span>
                      Pre-Climb Briefing
                    </h3>

                    {/* Parking */}
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                          <CircleParking aria-hidden="true" className="h-4 w-4 text-blue-400" />
                        </span>
                        <div>
                          <p className="text-sm font-bold text-white">Where to Park</p>
                          <a
                            href={`https://www.google.com/maps/search/parking+near+${data.coordinates[1]},${data.coordinates[0]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"
                          >
                            Find parking on Maps →
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Jumpoff */}
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                          <Flag aria-hidden="true" className="h-4 w-4 text-emerald-400" />
                        </span>
                        <div>
                          <p className="text-sm font-bold text-white">Jumpoff Point</p>
                          <p className="mt-1 font-mono text-xs text-slate-400">
                            {data.coordinates[1].toFixed(5)}°, {data.coordinates[0].toFixed(5)}°
                          </p>
                          <p className="mt-1.5 text-xs text-slate-400">
                            Permit and registration rules vary by mountain — check with the local
                            authority before you go.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* The "Water Sources" card that stood here listed springs at
                          elevations derived arithmetically from the summit height —
                          invented locations for something people plan hydration
                          around. There is no data source for it, so it is gone. */}

                    {/* Weather */}
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-sky-500/10">
                          <CloudSun aria-hidden="true" className="h-4 w-4 text-sky-400" />
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white">Weather Conditions</p>
                            {weatherNotes.live && (
                              <span className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-400">
                                Live
                              </span>
                            )}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div className="rounded-md bg-emerald-500/10 px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                                Best time
                              </p>
                              <p className="text-sm font-bold text-emerald-300">
                                {weatherNotes.best}
                              </p>
                            </div>
                            <div className="rounded-lg bg-red-500/10 px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-400">
                                Avoid
                              </p>
                              <p className="text-sm font-bold text-red-300">{weatherNotes.avoid}</p>
                            </div>
                          </div>
                          <p className="mt-2 rounded-lg bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
                            RISK: {weatherNotes.risk}
                          </p>
                          <WeatherAlertChips alerts={weatherNotes.alerts} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recommended Gear */}
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-white/[0.06]">
                        <Backpack aria-hidden="true" className="h-3 w-3 text-slate-600" />
                      </span>
                      Recommended Gear
                    </h3>
                    <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                        {gearList.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-slate-200">
                            <span className="mt-0.5 flex-shrink-0 text-emerald-500">-</span>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Location coords */}
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <Crosshair aria-hidden="true" className="h-3.5 w-3.5" />
                      Coordinates
                    </h3>
                    <div className="grid grid-cols-2 gap-4 rounded-lg border border-white/[0.06] bg-slate-800/40 px-4 py-3">
                      <div>
                        <p className="text-xs text-slate-400">Latitude</p>
                        <p className="font-mono text-sm font-medium text-white">
                          {data.coordinates[1].toFixed(6)}°
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Longitude</p>
                        <p className="font-mono text-sm font-medium text-white">
                          {data.coordinates[0].toFixed(6)}°
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Actions — "Find Routes to Summit" had no handler, and this row
                  used light-theme buttons inside a dark modal. */}
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
              <button
                type="button"
                onClick={() => {
                  onGetDirections?.({ name: data.name, coordinates: data.coordinates });
                  onClose();
                }}
                className={`${buttonPrimary} ${buttonSize.md} flex-1`}
              >
                Get Directions
              </button>
              <ShareButton
                kind="mountain"
                id={data.id}
                name={data.name}
                summary={`${data.elevation_m} m`}
              />
            </div>
          </div>
        ) : data.type === 'campsite' ? (
          <div className="space-y-6">
            {/* Camper Profile type label */}
            <div className="bg-emerald-500/10/50 flex items-center gap-3 rounded-lg border border-emerald-500/25 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/15">
                <Tent aria-hidden="true" className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-200">Campsite Profile</p>
                <p className="text-xs text-slate-400">
                  Complete campsite details with amenities, ratings, and location information
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Tent aria-hidden="true" className="h-3 w-3" />
                  Type
                </p>
                <p className="mt-1.5 text-xl font-bold capitalize text-white">
                  {data.campsite_type}
                </p>
              </div>
              {data.rating && (
                <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <Star aria-hidden="true" className="h-3 w-3" />
                    Rating
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Star aria-hidden="true" className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <p className="font-tabular text-xl font-bold text-white">
                      {data.rating.toFixed(1)}
                    </p>
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Coordinates
                </p>
                <p className="font-tabular mt-1.5 text-xs font-medium text-slate-300">
                  {data.coordinates[1].toFixed(4)}, {data.coordinates[0].toFixed(4)}
                </p>
              </div>
            </div>

            <PhotoGallery
              photos={resolvedPhotos}
              loading={loadingPhotos}
              failed={photosFailed}
              placeName={data.name}
            />

            {/* Amenities */}
            {data.amenities && data.amenities.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                  <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  Amenities
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {data.amenities.map((amenity, index) => (
                    <span
                      key={index}
                      className="rounded-md border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-200"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Camper Profile Details */}
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                <Tent aria-hidden="true" className="h-3.5 w-3.5" />
                Camping Details
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Site Type
                  </p>
                  <p className="mt-1.5 text-base font-bold capitalize text-white">
                    {data.campsite_type}
                  </p>
                  <p className="text-xs text-slate-400">
                    {data.campsite_type === 'developed'
                      ? 'Full facilities'
                      : data.campsite_type === 'primitive'
                        ? 'Basic setup'
                        : 'Backcountry camping'}
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Accessibility
                  </p>
                  <p className="mt-1.5 text-base font-bold text-white">
                    {data.campsite_type === 'developed'
                      ? 'Drive-In'
                      : data.campsite_type === 'primitive'
                        ? 'Hike-In'
                        : 'Remote'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {data.campsite_type === 'developed'
                      ? 'Vehicle access'
                      : data.campsite_type === 'primitive'
                        ? '1–5 km hike'
                        : 'Remote location'}
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Experience Level
                  </p>
                  <p className="mt-1.5 text-base font-bold text-white">
                    {data.campsite_type === 'developed'
                      ? 'Beginner'
                      : data.campsite_type === 'primitive'
                        ? 'Intermediate'
                        : 'Advanced'}
                  </p>
                  <p className="text-xs text-slate-400">Recommended skill level</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <CalendarDays aria-hidden="true" className="h-3 w-3" />
                    Best Season
                  </p>
                  <p className="mt-1.5 text-base font-bold text-white">
                    {data.campsite_type === 'developed'
                      ? 'Year-Round'
                      : data.campsite_type === 'primitive'
                        ? 'Apr–Oct'
                        : 'Jun–Sep'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {data.campsite_type === 'developed'
                      ? 'All seasons'
                      : data.campsite_type === 'primitive'
                        ? 'Spring to fall'
                        : 'Summer only'}
                  </p>
                </div>
              </div>
            </div>

            {/* Gear Recommendations */}
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                <Backpack aria-hidden="true" className="h-3.5 w-3.5" />
                Recommended Gear
              </h3>
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                      Shelter
                    </h4>
                    <ul className="space-y-1 text-sm text-slate-300">
                      <li>
                        •{' '}
                        {data.campsite_type === 'developed'
                          ? 'Tent or RV'
                          : data.campsite_type === 'primitive'
                            ? '3-season tent'
                            : 'Lightweight backpacking tent'}
                      </li>
                      <li>
                        • Sleeping bag (
                        {data.campsite_type === 'developed' ? 'comfort rated' : 'temperature rated'}
                        )
                      </li>
                      <li>• Sleeping pad or mattress</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                      Cooking
                    </h4>
                    <ul className="space-y-1 text-sm text-slate-300">
                      <li>
                        •{' '}
                        {data.campsite_type === 'developed'
                          ? 'Camp stove or grill'
                          : 'Portable camp stove'}
                      </li>
                      <li>• Cookware and utensils</li>
                      <li>• Food storage {data.campsite_type !== 'developed' && '(bear-proof)'}</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                      Essentials
                    </h4>
                    <ul className="space-y-1 text-sm text-slate-300">
                      <li>• Headlamp/flashlight</li>
                      <li>• First aid kit</li>
                      <li>• Water filtration</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                      Clothing
                    </h4>
                    <ul className="space-y-1 text-sm text-slate-300">
                      <li>• Layered clothing system</li>
                      <li>• Rain gear</li>
                      <li>• Sturdy footwear</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Location Info */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                <Info aria-hidden="true" className="h-3.5 w-3.5" />
                About This Campsite
              </h3>
              <div className="space-y-2">
                <div className="rounded-lg border border-white/[0.06] bg-slate-800/40 p-4">
                  <p className="text-sm text-slate-300">
                    <span className="font-semibold text-white">{data.name}</span> is a{' '}
                    {data.campsite_type} located at coordinates {data.coordinates[0].toFixed(4)},{' '}
                    {data.coordinates[1].toFixed(4)}.
                    {data.rating && ` Rated ${data.rating.toFixed(1)} stars.`} Perfect for outdoor
                    enthusiasts looking for a comfortable base to explore the surrounding trails and
                    mountains.
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-slate-800/40 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Nearby Activities
                  </p>
                  <p className="text-sm text-slate-300">
                    Hiking, mountain climbing, nature photography, stargazing, and wildlife
                    observation
                  </p>
                </div>
              </div>
            </div>

            {/* Actions — "Check Availability" had no handler and no booking
                  integration behind it to have one. */}
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
              <button
                type="button"
                onClick={() => {
                  onGetDirections?.({ name: data.name, coordinates: data.coordinates });
                  onClose();
                }}
                className={`${buttonPrimary} ${buttonSize.md} flex-1`}
              >
                Get Directions
              </button>
              <ShareButton kind="campsite" id={data.id} name={data.name} />
            </div>
          </div>
        ) : data.type === 'activity' ? (
          <div className="space-y-6">
            {/* Source badge */}
            {(() => {
              const sourceMeta: Record<string, { label: string; bg: string; text: string }> = {
                strava: { label: 'Strava', bg: 'bg-orange-500/10', text: 'text-orange-400' },
                coros: { label: 'COROS', bg: 'bg-blue-500/10', text: 'text-blue-400' },
                garmin: { label: 'Garmin Connect', bg: 'bg-sky-500/10', text: 'text-sky-400' },
                komoot: { label: 'Komoot', bg: 'bg-green-500/10', text: 'text-green-400' },
              };
              const meta = sourceMeta[data.source] ?? {
                label: data.source,
                bg: 'bg-white/[0.06]',
                text: 'text-slate-200',
              };
              const activityDate = new Date(data.start_date).toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              });
              return (
                <div
                  className={`flex items-center gap-3 rounded-lg border border-white/[0.08] ${meta.bg} px-4 py-3`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.06] shadow-sm">
                    <Route aria-hidden="true" className={`h-4 w-4 ${meta.text}`} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${meta.text}`}>{meta.label} Activity</p>
                    <p className="text-xs text-slate-400">{activityDate}</p>
                  </div>
                </div>
              );
            })()}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Route aria-hidden="true" className="h-3 w-3" />
                  Distance
                </p>
                <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                  {data.distance_km.toFixed(2)}{' '}
                  <span className="text-sm font-normal text-slate-400">km</span>
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Elevation Gain
                </p>
                <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                  {data.elevation_gain_m}{' '}
                  <span className="text-sm font-normal text-slate-400">m</span>
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Timer aria-hidden="true" className="h-3 w-3" />
                  Moving Time
                </p>
                <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                  {(() => {
                    const h = Math.floor(data.moving_time_s / 3600);
                    const m = Math.floor((data.moving_time_s % 3600) / 60);
                    return h > 0 ? `${h}h ${m}m` : `${m}m`;
                  })()}
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Sport
                </p>
                <p className="mt-1.5 text-base font-bold capitalize text-white">
                  {data.sport_type}
                </p>
              </div>
              {data.avg_heartrate && (
                <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Avg Heart Rate
                  </p>
                  <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                    {Math.round(data.avg_heartrate)}{' '}
                    <span className="text-sm font-normal text-slate-400">bpm</span>
                  </p>
                </div>
              )}
              {data.max_heartrate && (
                <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Max Heart Rate
                  </p>
                  <p className="font-tabular mt-1.5 text-xl font-bold text-white">
                    {Math.round(data.max_heartrate)}{' '}
                    <span className="text-sm font-normal text-slate-400">bpm</span>
                  </p>
                </div>
              )}
            </div>

            {/* Pace / Speed */}
            {data.moving_time_s > 0 && data.distance_km > 0 && (
              <div className="rounded-lg border border-white/[0.06] bg-slate-800/40 p-4">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
                  <Gauge aria-hidden="true" className="h-3.5 w-3.5" />
                  Performance
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Avg Speed</p>
                    <p className="font-tabular mt-0.5 font-bold text-white">
                      {((data.distance_km / data.moving_time_s) * 3600).toFixed(1)} km/h
                    </p>
                  </div>
                  {data.sport_type.toLowerCase() !== 'ride' && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Avg Pace</p>
                      <p className="font-tabular mt-0.5 font-bold text-white">
                        {(() => {
                          const totalSec = Math.round(data.moving_time_s / data.distance_km);
                          const m = Math.floor(totalSec / 60);
                          const s = totalSec % 60;
                          return `${m}:${s.toString().padStart(2, '0')} /km`;
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 border-t border-white/[0.08] pt-5">
              {data.source === 'strava' && data.external_id && (
                <a
                  href={`https://www.strava.com/activities/${data.external_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-md bg-orange-500 px-5 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-orange-600"
                >
                  View on Strava
                </a>
              )}
              {data.coordinates && (
                <button
                  type="button"
                  onClick={() => {
                    onGetDirections?.({ name: data.name, coordinates: data.coordinates! });
                    onClose();
                  }}
                  className={`${buttonSecondary} ${buttonSize.md} flex-1`}
                >
                  Show on map
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
