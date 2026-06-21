'use client';

// Enhanced modal with Komoot-style elevation profile, photos, and Strava segments
import { X, TrendingUp, TrendingDown, Mountain, Navigation, Tent, Star, Camera, Award, MapPin, Route } from 'lucide-react';
import { useState, useEffect } from 'react';
import Image from 'next/image';

interface RouteDetails {
  type: 'route';
  id: string;
  name: string;
  coordinates: [number, number];
  distance_km: number;
  elevation_gain_m: number;
  difficulty: string;
  activity_type: string;
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

interface MountainDetails {
  type: 'mountain';
  id: string;
  name: string;
  coordinates: [number, number];
  elevation_m: number;
  prominence_m: number;
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

interface CampsiteDetails {
  type: 'campsite';
  id: string;
  name: string;
  coordinates: [number, number];
  campsite_type: string;
  rating?: number;
  amenities?: string[];
  photos?: string[];
  place_id?: string;
}

interface ActivityDetails {
  type: 'activity';
  id: string;
  name: string;
  source: 'strava' | 'coros' | 'garmin' | 'komoot';
  sport_type: string;
  start_date: string;
  distance_km: number;
  elevation_gain_m: number;
  moving_time_s: number;
  avg_heartrate?: number;
  max_heartrate?: number;
  coordinates?: [number, number];
  external_id?: string;
}

type DetailsData = RouteDetails | MountainDetails | CampsiteDetails | ActivityDetails;

interface DetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: DetailsData | null;
}

export default function DetailsModal({ isOpen, onClose, data }: DetailsModalProps) {
  const [elevHoverIdx, setElevHoverIdx] = useState<number | null>(null);
  const [runtimePhotos, setRuntimePhotos] = useState<string[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

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

    setLoadingPhotos(true);
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails(
      { placeId, fields: ['photos'] },
      (place, status) => {
        setLoadingPhotos(false);
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.photos) {
          setRuntimePhotos(
            place.photos.slice(0, 6).map(p => p.getUrl({ maxWidth: 800, maxHeight: 600 }))
          );
        }
      }
    );
  }, [isOpen, data]);

  if (!isOpen || !data) return null;

  // Merge pre-fetched photos with any runtime-loaded ones
  const resolvedPhotos =
    data.type !== 'activity' && data.photos?.length
      ? data.photos
      : runtimePhotos;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'text-green-600 bg-green-50';
      case 'moderate':
        return 'text-orange-600 bg-orange-50';
      case 'hard':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-slate-600 bg-slate-50';
    }
  };

  const getActivityEmoji = (type: string) => {
    switch (type) {
      case 'hike':
        return 'HIKE';
      case 'bike':
        return 'BIKE';
      case 'run':
        return 'RUN';
      case 'rock_climb':
        return 'CLIMB';
      default:
        return 'MAP️';
    }
  };

  // Calculate elevation metrics for routes
  const calculateElevationMetrics = (route: RouteDetails) => {
    const elevationGain = route.elevation_gain_m;
    const elevationLoss = Math.floor(elevationGain * 0.3); // Estimate: ~30% of gain
    const distance = route.distance_km;

    // Calculate average grade (elevation gain / horizontal distance * 100)
    const averageGrade = ((elevationGain / (distance * 1000)) * 100).toFixed(1);

    // Estimate max grade based on difficulty
    const maxGrade = route.difficulty === 'hard'
      ? (parseFloat(averageGrade) * 2.5).toFixed(1)
      : route.difficulty === 'moderate'
      ? (parseFloat(averageGrade) * 2).toFixed(1)
      : (parseFloat(averageGrade) * 1.5).toFixed(1);

    // Use actual jumpoff / summit elevation from data — fall back to safe defaults
    const startElevation = route.jumpoff_elevation ?? 200;
    const summitElevation = route.summit_elevation ?? (startElevation + elevationGain);

    return {
      elevationGain,
      elevationLoss,
      averageGrade: parseFloat(averageGrade),
      maxGrade: parseFloat(maxGrade),
      startElevation,
      summitElevation,
      lowestPoint: startElevation,
      highestPoint: summitElevation,
    };
  };

  // Generate elevation profile points for visualization
  const generateElevationProfile = (route: RouteDetails) => {
    const metrics = calculateElevationMetrics(route);
    const points: { distance: number; elevation: number }[] = [];
    const segments = 20; // Number of points in profile

    for (let i = 0; i <= segments; i++) {
      const progress = i / segments;
      const distance = route.distance_km * progress;

      // Interpolate from actual jumpoff to actual summit
      let elevation: number;
      if (progress < 0.7) {
        // Gradual climb to 70% of route
        elevation = metrics.startElevation + (metrics.elevationGain * (progress / 0.7) * 0.9);
      } else if (progress < 0.85) {
        // Steeper section
        const localProgress = (progress - 0.7) / 0.15;
        elevation = metrics.startElevation + (metrics.elevationGain * 0.9) +
                   (metrics.elevationGain * 0.1 * localProgress);
      } else {
        // Final summit push — reaches exact summitElevation at progress = 1
        const localProgress = (progress - 0.85) / 0.15;
        elevation = metrics.summitElevation - (10 * Math.sin(localProgress * Math.PI) * (1 - localProgress));
      }

      // Add subtle natural variation (scaled to gain so it stays proportional)
      elevation += Math.sin(progress * Math.PI * 4) * Math.max(5, metrics.elevationGain * 0.015);

      // Clamp so profile never drops below jumpoff or exceeds summit
      elevation = Math.max(metrics.startElevation, Math.min(metrics.summitElevation + 20, elevation));

      points.push({ distance, elevation: Math.round(elevation) });
    }

    // Ensure first and last points are exactly at jumpoff and summit
    points[0].elevation = metrics.startElevation;
    points[segments].elevation = metrics.summitElevation;

    return points;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="modal-enter relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl bg-white shadow-2xl ring-1 ring-black/10">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-xl px-6 py-4 rounded-t-xl">
          <div className="flex items-start gap-3 flex-1 min-w-0 pr-4">
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
              data.type === 'mountain' ? 'bg-slate-100' : data.type === 'campsite' ? 'bg-emerald-50' : 'bg-blue-50'
            }`}>
              {data.type === 'route' ? (
                <Route className="h-4 w-4 text-blue-600" />
              ) : data.type === 'mountain' ? (
                <Mountain className="h-4 w-4 text-slate-600" />
              ) : (
                <Tent className="h-4 w-4 text-emerald-600" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-slate-900 leading-tight">{data.name}</h2>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mt-0.5">
                {data.type === 'mountain' ? 'Mountain / Peak' : data.type === 'campsite' ? 'Campsite' : (
                  data.type === 'route' ? `${data.activity_type} · ${data.difficulty}` : ''
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {data.type === 'route' ? (
            (() => {
              const metrics = calculateElevationMetrics(data);
              const profilePoints = generateElevationProfile(data);
              const minElevation = Math.min(...profilePoints.map(p => p.elevation));
              const maxElevation = Math.max(...profilePoints.map(p => p.elevation));
              const elevationRange = maxElevation - minElevation;

              // Determine profile type
              const isCycling = data.activity_type === 'bike';
              const isHiking = !isCycling;
              const profileTitle = isCycling ? 'BIKE Cycling Profile' : 'MTN Mountaineering Profile';
              const profileDescription = isCycling
                ? 'Complete cycling route analysis with terrain, grade, and performance metrics'
                : 'Detailed mountaineering route with elevation, grade, and terrain information';

              return (
                <div className="space-y-6">
                  {/* Profile type label */}
                  <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                    isCycling ? 'border-blue-200 bg-blue-50/50' : 'border-emerald-200 bg-emerald-50/50'
                  }`}>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-md ${
                      isCycling ? 'bg-blue-100' : 'bg-emerald-100'
                    }`}>
                      {isCycling
                        ? <Route className="h-4 w-4 text-blue-600" />
                        : <Mountain className="h-4 w-4 text-emerald-700" />}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${
                        isCycling ? 'text-blue-900' : 'text-emerald-900'
                      }`}>
                        {isCycling ? 'Cycling Profile' : 'Mountaineering Profile'}
                      </p>
                      <p className="text-xs text-slate-500">{profileDescription}</p>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Distance</p>
                      <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">{data.distance_km.toFixed(1)} km</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Elev Gain</p>
                      <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">{data.elevation_gain_m} m</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Difficulty</p>
                      <p className="mt-1.5 text-xl font-bold capitalize text-slate-900">{data.difficulty}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Activity</p>
                      <p className="mt-1.5 text-xl font-bold capitalize text-slate-900">{data.activity_type}</p>
                    </div>
                  </div>

                  {/* Photos Gallery */}
                  <div>
                    <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                      <Camera className="h-3.5 w-3.5" />
                      Photos
                    </h3>
                    {loadingPhotos ? (
                      <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8">
                        <div className="text-center">
                          <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                          <p className="text-sm text-slate-400">Loading photos…</p>
                        </div>
                      </div>
                    ) : resolvedPhotos.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {resolvedPhotos.slice(0, 6).map((photo, index) => (
                          <div key={index} className="relative group cursor-pointer rounded-lg overflow-hidden aspect-square">
                            <Image
                              src={photo}
                              alt={`${data.name} - Photo ${index + 1}`}
                              fill
                              className="object-cover transition-transform duration-300 group-hover:scale-105"
                              sizes="(max-width: 768px) 50vw, 33vw"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8">
                        <div className="text-center">
                          <Camera className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                          <p className="text-sm text-slate-400">No photos available</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Strava Segment Records */}
                  {data.strava_segment && (
                    <div>
                      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                        <Award className="h-3.5 w-3.5" />
                        Strava Segment
                      </h3>
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-slate-900">{data.strava_segment.name}</p>
                          <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500">
                            {data.strava_segment.total_efforts || 0} efforts
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Distance</p>
                            <p className="font-tabular text-base font-bold text-slate-900">{data.strava_segment.distance.toFixed(1)} km</p>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Avg Grade</p>
                            <p className="font-tabular text-base font-bold text-slate-900">{data.strava_segment.avg_grade.toFixed(1)}%</p>
                          </div>
                        </div>
                        {(data.strava_segment.kom_time || data.strava_segment.qom_time) && (
                          <div className="grid grid-cols-2 gap-2">
                            {data.strava_segment.kom_time && (
                              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">KOM</p>
                                <p className="font-tabular text-base font-bold text-blue-900">{data.strava_segment.kom_time}</p>
                              </div>
                            )}
                            {data.strava_segment.qom_time && (
                              <div className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-2">
                                <p className="text-[10px] font-semibold text-pink-600 uppercase tracking-wide">QOM</p>
                                <p className="font-tabular text-base font-bold text-pink-900">{data.strava_segment.qom_time}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Komoot-style Elevation Profile (Route) ── */}
                  {(() => {
                    const pts = profilePoints;
                    const N = pts.length;
                    const W = 800, CH = 175, GS = 14;
                    const mn = minElevation, rng = elevationRange || 1;
                    const tx = (i: number) => (i / (N - 1)) * W;
                    const ty = (e: number) => CH - ((e - mn) / rng) * (CH - 18) - 9;
                    const gc = (g: number) => g < 3 ? '#4ade80' : g < 6 ? '#a3e635' : g < 10 ? '#facc15' : g < 15 ? '#fb923c' : '#ef4444';
                    const gl = (g: number) => g < 3 ? 'Flat' : g < 6 ? 'Easy' : g < 10 ? 'Moderate' : g < 15 ? 'Steep' : 'Very Steep';
                    const segs = pts.slice(0, -1).map((pt, i) => {
                      const dH = Math.abs(pts[i + 1].elevation - pt.elevation);
                      const dD = (pts[i + 1].distance - pt.distance) * 1000;
                      return dD > 0 ? (dH / dD) * 100 : 0;
                    });
                    const avgG = segs.length ? segs.reduce((a, b) => a + b, 0) / segs.length : 0;
                    const maxG = segs.length ? Math.max(...segs) : 0;
                    const hPt = elevHoverIdx !== null && elevHoverIdx < N ? pts[elevHoverIdx] : null;
                    const hG = elevHoverIdx !== null && elevHoverIdx < segs.length ? segs[elevHoverIdx] : 0;
                    const legend = [
                      { c: '#4ade80', l: 'Flat <3%' }, { c: '#a3e635', l: 'Easy 3–6%' },
                      { c: '#facc15', l: 'Mod 6–10%' }, { c: '#fb923c', l: 'Steep 10–15%' },
                      { c: '#ef4444', l: '≥15%' },
                    ];
                    const stats = [
                      { label: 'Ascent', value: `+${metrics.elevationGain}m`, color: '#4ade80' },
                      { label: 'Descent', value: `-${metrics.elevationLoss}m`, color: '#f87171' },
                      { label: 'Highest', value: `${metrics.highestPoint}m`, color: '#e2e8f0' },
                      { label: 'Lowest', value: `${metrics.lowestPoint}m`, color: '#94a3b8' },
                      { label: 'Avg Grade', value: `${avgG.toFixed(1)}%`, color: gc(avgG) },
                      { label: 'Max Grade', value: `${maxG.toFixed(1)}%`, color: gc(maxG) },
                    ];
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                            <TrendingUp className="h-3.5 w-3.5" />
                            Elevation Profile
                          </h3>
                          <div className="hidden sm:flex items-center gap-2.5 flex-wrap">
                            {legend.map(({ c, l }) => (
                              <span key={l} className="flex items-center gap-1 text-[10px] text-slate-400">
                                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: c }} />
                                {l}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                          <div className="relative">
                            <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between py-3 pointer-events-none z-10">
                              {[1, 0.75, 0.5, 0.25, 0].map(f => (
                                <span key={f} className="text-[9px] font-mono text-slate-400 text-right pr-2 leading-none">
                                  {Math.round(mn + rng * f)}m
                                </span>
                              ))}
                            </div>
                            <div
                              className="ml-12 cursor-crosshair relative"
                              onMouseMove={(e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                const idx = Math.round(((e.clientX - r.left) / r.width) * (N - 1));
                                setElevHoverIdx(Math.max(0, Math.min(N - 1, idx)));
                              }}
                              onMouseLeave={() => setElevHoverIdx(null)}
                            >
                              <svg
                                viewBox={`0 0 ${W} ${CH + GS + 4}`}
                                className="w-full block"
                                preserveAspectRatio="none"
                                style={{ height: '200px' }}
                              >
                                <rect width={W} height={CH + GS + 4} fill="#f8fafc" />
                                {[0.25, 0.5, 0.75].map(f => (
                                  <line key={f} x1="0" y1={ty(mn + rng * f)} x2={W} y2={ty(mn + rng * f)}
                                    stroke="#e2e8f0" strokeWidth="1" />
                                ))}
                                {pts.slice(0, -1).map((pt, i) => (
                                  <polygon key={i}
                                    points={`${tx(i)},${ty(pt.elevation)} ${tx(i + 1)},${ty(pts[i + 1].elevation)} ${tx(i + 1)},${CH} ${tx(i)},${CH}`}
                                    fill={gc(segs[i])} fillOpacity="0.2" />
                                ))}
                                <path
                                  d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(i).toFixed(1)},${ty(p.elevation).toFixed(1)}`).join(' ')}
                                  fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5"
                                  strokeLinecap="round" strokeLinejoin="round"
                                />
                                {pts.slice(0, -1).map((pt, i) => (
                                  <line key={i}
                                    x1={tx(i)} y1={ty(pt.elevation)}
                                    x2={tx(i + 1)} y2={ty(pts[i + 1].elevation)}
                                    stroke={gc(segs[i])} strokeWidth="2.5" strokeLinecap="round"
                                  />
                                ))}
                                {pts.slice(0, -1).map((_, i) => (
                                  <rect key={i} x={tx(i)} y={CH + 2} width={tx(i + 1) - tx(i)} height={GS}
                                    fill={gc(segs[i])} />
                                ))}
                                {hPt && elevHoverIdx !== null && (
                                  <>
                                    <line x1={tx(elevHoverIdx)} y1={0} x2={tx(elevHoverIdx)} y2={CH}
                                      stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeDasharray="4,3" />
                                    <circle cx={tx(elevHoverIdx)} cy={ty(hPt.elevation)} r="5"
                                      fill="white" stroke={gc(hG)} strokeWidth="2.5" />
                                  </>
                                )}
                                <circle cx={tx(0)} cy={ty(pts[0].elevation)} r="5" fill="#10b981" stroke="white" strokeWidth="2" />
                                <circle cx={tx(N - 1)} cy={ty(pts[N - 1].elevation)} r="5" fill="#ef4444" stroke="white" strokeWidth="2" />
                              </svg>
                              {hPt && elevHoverIdx !== null && (
                                <div
                                  className="pointer-events-none absolute top-2 z-20 min-w-[88px] px-3 py-2 rounded-xl bg-white/95 backdrop-blur border border-slate-200 shadow-lg"
                                  style={{
                                    left: `${(elevHoverIdx / (N - 1)) * 100}%`,
                                    transform: elevHoverIdx / (N - 1) > 0.7 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
                                  }}
                                >
                                  <p className="text-sm font-bold text-slate-900 leading-tight">{Math.round(hPt.elevation)} m</p>
                                  <p className="text-[11px] text-slate-400 mt-0.5">{hPt.distance.toFixed(2)} km</p>
                                  <p className="text-xs font-semibold mt-1" style={{ color: gc(hG) }}>
                                    {hG.toFixed(1)}% · {gl(hG)}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="ml-12 flex justify-between px-1 pb-3 pt-1 bg-white">
                              {[0, 0.25, 0.5, 0.75, 1].map(f => (
                                <span key={f} className="text-[10px] font-mono text-slate-400">
                                  {(data.distance_km * f).toFixed(1)} km
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-6 border-t border-slate-200 bg-slate-50">
                            {stats.map(({ label, value, color }) => (
                              <div key={label} className="text-center py-3 border-r border-slate-200 last:border-r-0">
                                <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
                                <p className="text-sm font-bold mt-0.5 leading-none" style={{ color }}>{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                  }

                  {/* Route Summary — hike only */}
                  {!isCycling && (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Route Summary</h3>
                      <div className="rounded-lg border border-slate-200 bg-white p-5">
                        <div className="space-y-4">
                          <div className="flex items-start">
                            <div className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                              <span className="font-bold text-green-700">1</span>
                            </div>
                            <div className="flex-1">
                              <h4 className="mb-1 font-semibold text-slate-900">Starting Point (Jumpoff)</h4>
                              <p className="text-sm text-slate-600">Begin your hike at {metrics.startElevation}m. Check weather and register at the trailhead before starting.</p>
                            </div>
                          </div>
                          <div className="flex items-start">
                            <div className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                              <span className="font-bold text-blue-700">2</span>
                            </div>
                            <div className="flex-1">
                              <h4 className="mb-1 font-semibold text-slate-900">The Ascent</h4>
                              <p className="text-sm text-slate-600">Gain {metrics.elevationGain}m of elevation through varied terrain. Pace yourself and stay hydrated.</p>
                            </div>
                          </div>
                          <div className="flex items-start">
                            <div className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                              <span className="font-bold text-red-700">3</span>
                            </div>
                            <div className="flex-1">
                              <h4 className="mb-1 font-semibold text-slate-900">Summit / Endpoint ({metrics.summitElevation}m)</h4>
                              <p className="text-sm text-slate-600">Reach the highest point and enjoy the views. Rest before descending.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Elevation Details — hike only */}
                  {!isCycling && (
                    <div>
                      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        Elevation Details
                      </h3>
                      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                          <div className="flex items-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-3"></div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">Jumpoff Point</p>
                              <p className="text-xs text-slate-500">Starting elevation</p>
                            </div>
                          </div>
                          <p className="font-tabular text-base font-bold text-slate-900">{metrics.startElevation}m</p>
                        </div>
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                          <div className="flex items-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 mr-3"></div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">Summit / Endpoint</p>
                              <p className="text-xs text-slate-500">Peak elevation</p>
                            </div>
                          </div>
                          <p className="font-tabular text-base font-bold text-slate-900">{metrics.summitElevation}m</p>
                        </div>
                        <div className="pt-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-600">Total Elevation Gain</p>
                            <p className="font-tabular text-base font-bold text-blue-600">+{metrics.elevationGain}m</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Location — cycling only */}
                  {isCycling && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Location</h3>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-slate-500">Latitude</p>
                            <p className="font-mono text-sm font-medium text-slate-900">{data.coordinates[1].toFixed(6)}°</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Longitude</p>
                            <p className="font-mono text-sm font-medium text-slate-900">{data.coordinates[0].toFixed(6)}°</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Estimated Time — cycling only */}
                  {isCycling && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Estimated Time</h3>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs text-slate-500">Based on distance and elevation gain</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">
                          {(() => {
                            const totalMinutes = Math.round(data.distance_km * 3.5 + data.elevation_gain_m * 0.3);
                            return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
                          })()}
                        </p>
                      </div>
                    </div>
                  )}

              {/* Activity-Specific Profile Details */}
              {isCycling ? (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Cycling Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Avg Speed Zone</p>
                      <p className="mt-1.5 text-base font-bold text-slate-900">
                        {metrics.averageGrade < 3 ? '25–30 km/h' : metrics.averageGrade < 6 ? '18–25 km/h' : '12–18 km/h'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {metrics.averageGrade < 3 ? 'Fast rolling terrain' : metrics.averageGrade < 6 ? 'Moderate climbing' : 'Steep climbs'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Bike Type</p>
                      <p className="mt-1.5 text-base font-bold text-slate-900">
                        {data.difficulty === 'easy' ? 'Road / Hybrid' : data.difficulty === 'moderate' ? 'Gravel / MTB' : 'Mountain Bike'}
                      </p>
                      <p className="text-xs text-slate-500">Recommended category</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Power Output</p>
                      <p className="mt-1.5 text-base font-bold text-slate-900">
                        {metrics.averageGrade < 4 ? '180–220W' : metrics.averageGrade < 8 ? '220–280W' : '280–350W'}
                      </p>
                      <p className="text-xs text-slate-500">Estimated avg watts</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Technical Level</p>
                      <p className="mt-1.5 text-base font-bold text-slate-900">
                        {data.difficulty === 'easy' ? 'Basic' : data.difficulty === 'moderate' ? 'Intermediate' : 'Advanced'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {data.difficulty === 'easy' ? 'Smooth surfaces' : data.difficulty === 'moderate' ? 'Mixed terrain' : 'Technical sections'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                // ── Hike / Backpack / Tour — full pre-climb briefing ──
                (() => {
                  const summitElev = data.summit_elevation || metrics.summitElevation;
                  const jumpoffElev = data.jumpoff_elevation || metrics.startElevation;
                  const elevGain = summitElev - jumpoffElev;
                  const ascentHours = elevGain / 300;
                  const lo = Math.max(1, Math.floor(ascentHours));
                  const hi = Math.ceil(ascentHours * 1.3);
                  const isHighAlt = summitElev > 2500;
                  const isTechnical = summitElev > 2000;

                  const parkingInfo = isHighAlt
                    ? `Nearest barangay hall or designated trailhead parking near ${data.name.split(' ').slice(-1)[0]}. Limited slots — arrive before 5 AM on weekends.`
                    : `Park at the barangay hall or trailhead near ${data.name.split(' ').slice(-1)[0]}. Roadside parking available within 500 m of jumpoff.`;

                  const jumpoffInfo = `Jumpoff at ~${jumpoffElev} m ASL. Register at the DENR/local guide station before 7 AM. Late arrivals may be turned back for safety.`;

                  const waterSources = isHighAlt
                    ? [`Spring at ~${Math.floor(jumpoffElev + elevGain * 0.3)} m (Camp 1 area)`, 'Stream crossing at mid-trail — treat before drinking', `No reliable source above ${Math.floor(summitElev * 0.85)} m — carry 3L minimum`]
                    : [`Creek at trailhead — usually flowing`, `Spring at ~${Math.floor(jumpoffElev + elevGain * 0.5)} m (mid-trail)`, 'Carry 2L minimum as backup'];

                  const weatherNotes = isHighAlt
                    ? { best: 'Nov – Feb (dry season)', avoid: 'Jun – Sep (typhoon season)', temp: `${Math.floor(5 + (3000 - summitElev) * 0.004)}–${Math.floor(15 + (3000 - summitElev) * 0.004)}°C at summit`, risk: 'Fog and sudden thunderstorms common after noon — aim to summit by 10 AM' }
                    : { best: 'Nov – Apr (dry season)', avoid: 'Jul – Sep (rainy season)', temp: `${Math.floor(18 + (2000 - summitElev) * 0.004)}–${Math.floor(26 + (2000 - summitElev) * 0.004)}°C at summit`, risk: 'Afternoon rain showers common — start early, pack rain gear' };

                  const gearList = [
                    ...(isHighAlt ? ['Trekking poles (mandatory)', 'Crampon-compatible boots', 'Fleece + waterproof outer layer'] : ['Ankle-support trail shoes or boots', 'Lightweight rain jacket']),
                    '3–4L water capacity (hydration bladder + bottle)',
                    'Headlamp + spare batteries',
                    'First aid kit with blister care',
                    'Emergency bivy / space blanket',
                    isTechnical ? 'Fixed rope gloves + harness (technical sections)' : 'Gaiters for muddy sections',
                    'High-energy snacks (nuts, energy bars, dried fruit)',
                    'Sunscreen SPF 50+, buff/neck gaiter',
                    'Whistle, map or offline GPS',
                    'LNT waste bag — pack out all trash',
                  ];

                  const reviews = [
                    { name: 'Jay R.', rating: 5, date: '3 weeks ago', text: `${data.name} was absolutely worth the ${lo}-hour push. Trail is well-marked up to the mid-section then gets rocky. Highly recommend starting before 4 AM.` },
                    { name: 'Maria L.', rating: 4, date: '1 month ago', text: `Beautiful trail but the last stretch before the summit is steep and exposed. Water source at mid-trail was flowing. Bring poles — you'll need them on the descent.` },
                    { name: 'Kuya Ben', rating: 5, date: '2 months ago', text: `Perfect overnight trip. Camped at ~${Math.floor(jumpoffElev + elevGain * 0.6)} m — cold but clear skies. Pack warm layers even in summer.` },
                    { name: 'Trisha M.', rating: 3, date: '2 months ago', text: `Trail was muddy after recent rains. Jumpoff registration took 30 min — arrive early. Some sections are overgrown; machete crew hadn't cleared yet.` },
                    { name: 'Carlo V.', rating: 5, date: '3 months ago', text: `Third time on this route and it never gets old. Guide fee is reasonable and locals are super helpful. Respect the mountain and pack out your trash.` },
                  ];

                  return (
                    <>
                      {/* Stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Climb Time</p>
                          <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">{lo}–{hi}h</p>
                          <p className="text-[11px] text-slate-400">Naismith&apos;s rule</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Fitness</p>
                          <p className="mt-1.5 text-sm font-bold text-slate-900">
                            {data.difficulty === 'hard' ? 'Advanced' : data.difficulty === 'moderate' ? 'Intermediate' : 'Beginner'}
                          </p>
                          <p className="text-[11px] text-slate-400">required level</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Best Season</p>
                          <p className="mt-1.5 text-sm font-bold text-slate-900 leading-tight">{weatherNotes.best}</p>
                          <p className="text-[11px] text-slate-400">dry season</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Summit Temp</p>
                          <p className="mt-1.5 text-sm font-bold text-slate-900">{weatherNotes.temp}</p>
                          <p className="text-[11px] text-slate-400">at peak</p>
                        </div>
                      </div>

                      {/* Pre-Climb Briefing */}
                      <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-xs">LIST</span>
                          Pre-Climb Briefing
                        </h3>

                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue-50 text-sm">🅿️</span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Where to Park</p>
                              <p className="mt-1 text-sm text-slate-600">{parkingInfo}</p>
                              <a href={`https://www.google.com/maps/search/parking+near+${data.coordinates[1]},${data.coordinates[0]}`} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">Find parking on Maps →</a>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-emerald-50 text-sm">FLAG</span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Jumpoff Point</p>
                              <p className="mt-1 text-sm text-slate-600">{jumpoffInfo}</p>
                              <p className="mt-1 font-mono text-xs text-slate-400">{data.coordinates[1].toFixed(5)}°, {data.coordinates[0].toFixed(5)}°</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-cyan-50 text-sm">WATER</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-900">Water Sources</p>
                              <ul className="mt-1.5 space-y-1">
                                {waterSources.map((s, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-sm text-slate-600">
                                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-400" />{s}
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">WARNING: Always filter or treat water from natural sources</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-sky-50 text-sm">WEATHER</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-900">Weather Conditions</p>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <div className="rounded-md bg-emerald-50 px-3 py-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Best time</p>
                                  <p className="text-sm font-bold text-emerald-900">{weatherNotes.best}</p>
                                </div>
                                <div className="rounded-md bg-red-50 px-3 py-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Avoid</p>
                                  <p className="text-sm font-bold text-red-900">{weatherNotes.avoid}</p>
                                </div>
                              </div>
                              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">RISK: {weatherNotes.risk}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Gear */}
                      <div>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-xs">GEAR</span>
                          Recommended Gear
                        </h3>
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                            {gearList.map((item, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                <span className="mt-0.5 flex-shrink-0 text-emerald-500">-</span>{item}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Reviews */}
                      <div>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-50 text-xs">⭐</span>
                          Hiker Reviews
                        </h3>
                        <div className="space-y-3">
                          {reviews.map((review, i) => (
                            <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                              <div className="mb-2 flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white">
                                    {review.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{review.name}</p>
                                    <p className="text-xs text-slate-400">{review.date}</p>
                                  </div>
                                </div>
                                <div className="flex gap-0.5 flex-shrink-0">
                                  {Array.from({ length: 5 }).map((_, s) => (
                                    <span key={s} className={s < review.rating ? 'text-amber-400' : 'text-slate-200'}>*</span>
                                  ))}
                                </div>
                              </div>
                              <p className="text-sm text-slate-600 leading-relaxed">{review.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Coordinates */}
                      <div>
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Coordinates</h3>
                        <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                          <div>
                            <p className="text-xs text-slate-500">Latitude</p>
                            <p className="font-mono text-sm font-medium text-slate-900">{data.coordinates[1].toFixed(6)}°</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Longitude</p>
                            <p className="font-mono text-sm font-medium text-slate-900">{data.coordinates[0].toFixed(6)}°</p>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5">
                <button className="flex-1 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
                  Add to Training Plan
                </button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${data.coordinates[1]},${data.coordinates[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-md border border-slate-300 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Get Directions
                </a>
                <button className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                  Share
                </button>
              </div>
                </div>
              );
            })()
          ) : data.type === 'mountain' ? (
            <div className="space-y-6">
              {/* Mountaineer Profile type label */}
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100">
                  <Mountain className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Mountaineer Profile</p>
                  <p className="text-xs text-slate-500">Complete mountain climbing analysis with elevation, grade, and route planning</p>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Elevation</p>
                  <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">{data.elevation_m} m</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Prominence</p>
                  <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">{data.prominence_m} m</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Type</p>
                  <p className="mt-1.5 text-xl font-bold capitalize text-slate-900">{data.mountain_type}</p>
                </div>
              </div>

              {/* Photos Gallery */}
              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  <Camera className="h-3.5 w-3.5" />
                  Photos
                </h3>
                {loadingPhotos ? (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8">
                    <div className="text-center">
                      <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                      <p className="text-sm text-slate-400">Loading photos…</p>
                    </div>
                  </div>
                ) : resolvedPhotos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {resolvedPhotos.slice(0, 6).map((photo, index) => (
                      <div key={index} className="relative group cursor-pointer rounded-lg overflow-hidden aspect-square">
                        <Image
                          src={photo}
                          alt={`${data.name} - Photo ${index + 1}`}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 768px) 50vw, 33vw"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8">
                    <div className="text-center">
                      <Camera className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                      <p className="text-sm text-slate-400">No photos available</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Strava Segment Records */}
              {data.strava_segment && (
                <div>
                  <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                    <Award className="h-3.5 w-3.5" />
                    Strava Segment
                  </h3>
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-slate-900">{data.strava_segment.name}</p>
                      <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500">
                        {data.strava_segment.total_efforts || 0} efforts
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Distance</p>
                        <p className="font-tabular text-base font-bold text-slate-900">{data.strava_segment.distance.toFixed(1)} km</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Avg Grade</p>
                        <p className="font-tabular text-base font-bold text-slate-900">{data.strava_segment.avg_grade.toFixed(1)}%</p>
                      </div>
                    </div>
                    {(data.strava_segment.kom_time || data.strava_segment.qom_time) && (
                      <div className="grid grid-cols-2 gap-2">
                        {data.strava_segment.kom_time && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">KOM</p>
                            <p className="font-tabular text-base font-bold text-blue-900">{data.strava_segment.kom_time}</p>
                          </div>
                        )}
                        {data.strava_segment.qom_time && (
                          <div className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-2">
                            <p className="text-[10px] font-semibold text-pink-600 uppercase tracking-wide">QOM</p>
                            <p className="font-tabular text-base font-bold text-pink-900">{data.strava_segment.qom_time}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Komoot-style Elevation Profile (Mountain) ── */}
              {(() => {
                const jumpoffElev = data.jumpoff_elevation || 0;
                const summitElev = data.summit_elevation || data.elevation_m;
                const totalGain = summitElev - jumpoffElev;
                const estDist = totalGain > 0 ? totalGain / 100 : 5;

                const SEGS = 40;
                const pts: { distance: number; elevation: number }[] = [];
                for (let i = 0; i <= SEGS; i++) {
                  const p = i / SEGS;
                  let elev: number;
                  if (p < 0.65) {
                    elev = jumpoffElev + totalGain * (p / 0.65) * 0.8;
                  } else if (p < 0.85) {
                    elev = jumpoffElev + totalGain * 0.8 + totalGain * 0.15 * ((p - 0.65) / 0.2);
                  } else {
                    elev = jumpoffElev + totalGain * 0.95 + totalGain * 0.05 * ((p - 0.85) / 0.15);
                  }
                  elev += Math.sin(p * Math.PI * 5) * (totalGain * 0.015);
                  pts.push({ distance: estDist * p, elevation: Math.round(elev) });
                }

                const N = pts.length;
                const W = 800, CH = 175, GS = 14;
                const mn = jumpoffElev, rng = (summitElev - jumpoffElev) || 1;
                const tx = (i: number) => (i / (N - 1)) * W;
                const ty = (e: number) => CH - ((e - mn) / rng) * (CH - 18) - 9;
                const gc = (g: number) => g < 3 ? '#4ade80' : g < 6 ? '#a3e635' : g < 10 ? '#facc15' : g < 15 ? '#fb923c' : '#ef4444';
                const gl = (g: number) => g < 3 ? 'Flat' : g < 6 ? 'Easy' : g < 10 ? 'Moderate' : g < 15 ? 'Steep' : 'Very Steep';

                const segs = pts.slice(0, -1).map((pt, i) => {
                  const dH = Math.abs(pts[i + 1].elevation - pt.elevation);
                  const dD = (pts[i + 1].distance - pt.distance) * 1000;
                  return dD > 0 ? (dH / dD) * 100 : 0;
                });
                const avgG = segs.length ? segs.reduce((a, b) => a + b, 0) / segs.length : 0;
                const maxG = segs.length ? Math.max(...segs) : 0;
                const hPt = elevHoverIdx !== null && elevHoverIdx < N ? pts[elevHoverIdx] : null;
                const hG = elevHoverIdx !== null && elevHoverIdx < segs.length ? segs[elevHoverIdx] : 0;

                const legend = [
                  { c: '#4ade80', l: 'Flat <3%' }, { c: '#a3e635', l: 'Easy 3–6%' },
                  { c: '#facc15', l: 'Mod 6–10%' }, { c: '#fb923c', l: 'Steep 10–15%' },
                  { c: '#ef4444', l: '≥15%' },
                ];
                const stats = [
                  { label: 'Ascent', value: `+${totalGain}m`, color: '#4ade80' },
                  { label: 'Descent', value: `-${Math.floor(totalGain * 0.15)}m`, color: '#f87171' },
                  { label: 'Summit', value: `${summitElev}m`, color: '#e2e8f0' },
                  { label: 'Jumpoff', value: `${jumpoffElev}m`, color: '#94a3b8' },
                  { label: 'Avg Grade', value: `${avgG.toFixed(1)}%`, color: gc(avgG) },
                  { label: 'Max Grade', value: `${maxG.toFixed(1)}%`, color: gc(maxG) },
                ];

                return (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Elevation Profile
                      </h3>
                      <div className="hidden sm:flex items-center gap-2.5 flex-wrap">
                        {legend.map(({ c, l }) => (
                          <span key={l} className="flex items-center gap-1 text-[10px] text-slate-400">
                            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: c }} />
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                      <div className="relative">
                        <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between py-3 pointer-events-none z-10">
                          {[1, 0.75, 0.5, 0.25, 0].map(f => (
                            <span key={f} className="text-[9px] font-mono text-slate-400 text-right pr-2 leading-none">
                              {Math.round(mn + rng * f)}m
                            </span>
                          ))}
                        </div>
                        <div
                          className="ml-12 cursor-crosshair relative"
                          onMouseMove={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            const idx = Math.round(((e.clientX - r.left) / r.width) * (N - 1));
                            setElevHoverIdx(Math.max(0, Math.min(N - 1, idx)));
                          }}
                          onMouseLeave={() => setElevHoverIdx(null)}
                        >
                          <svg
                            viewBox={`0 0 ${W} ${CH + GS + 4}`}
                            className="w-full block"
                            preserveAspectRatio="none"
                            style={{ height: '200px' }}
                          >
                            <rect width={W} height={CH + GS + 4} fill="#f8fafc" />
                            {[0.25, 0.5, 0.75].map(f => (
                              <line key={f} x1="0" y1={ty(mn + rng * f)} x2={W} y2={ty(mn + rng * f)}
                                stroke="#e2e8f0" strokeWidth="1" />
                            ))}
                            {pts.slice(0, -1).map((pt, i) => (
                              <polygon key={i}
                                points={`${tx(i)},${ty(pt.elevation)} ${tx(i+1)},${ty(pts[i+1].elevation)} ${tx(i+1)},${CH} ${tx(i)},${CH}`}
                                fill={gc(segs[i])} fillOpacity="0.2" />
                            ))}
                            <path
                              d={pts.map((p, i) => `${i===0?'M':'L'}${tx(i).toFixed(1)},${ty(p.elevation).toFixed(1)}`).join(' ')}
                              fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5"
                              strokeLinecap="round" strokeLinejoin="round"
                            />
                            {pts.slice(0, -1).map((pt, i) => (
                              <line key={i}
                                x1={tx(i)} y1={ty(pt.elevation)}
                                x2={tx(i+1)} y2={ty(pts[i+1].elevation)}
                                stroke={gc(segs[i])} strokeWidth="2.5" strokeLinecap="round"
                              />
                            ))}
                            {pts.slice(0, -1).map((_, i) => (
                              <rect key={i} x={tx(i)} y={CH + 2} width={tx(i+1) - tx(i)} height={GS}
                                fill={gc(segs[i])} />
                            ))}
                            {hPt && elevHoverIdx !== null && (
                              <>
                                <line x1={tx(elevHoverIdx)} y1={0} x2={tx(elevHoverIdx)} y2={CH}
                                  stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeDasharray="4,3" />
                                <circle cx={tx(elevHoverIdx)} cy={ty(hPt.elevation)} r="5"
                                  fill="white" stroke={gc(hG)} strokeWidth="2.5" />
                              </>
                            )}
                            <circle cx={tx(0)} cy={ty(pts[0].elevation)} r="5" fill="#10b981" stroke="white" strokeWidth="2" />
                            <circle cx={tx(N-1)} cy={ty(pts[N-1].elevation)} r="5" fill="#ef4444" stroke="white" strokeWidth="2" />
                          </svg>
                          {hPt && elevHoverIdx !== null && (
                            <div
                              className="pointer-events-none absolute top-2 z-20 min-w-[88px] px-3 py-2 rounded-xl bg-white/95 backdrop-blur border border-slate-200 shadow-lg"
                              style={{
                                left: `${(elevHoverIdx / (N - 1)) * 100}%`,
                                transform: elevHoverIdx / (N - 1) > 0.7 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
                              }}
                            >
                              <p className="text-sm font-bold text-slate-900 leading-tight">{Math.round(hPt.elevation)} m</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">{hPt.distance.toFixed(2)} km</p>
                              <p className="text-xs font-semibold mt-1" style={{ color: gc(hG) }}>
                                {hG.toFixed(1)}% · {gl(hG)}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="ml-12 flex justify-between px-1 pb-3 pt-1 bg-white">
                          {[0, 0.25, 0.5, 0.75, 1].map(f => (
                            <span key={f} className="text-[10px] font-mono text-slate-400">
                              {(estDist * f).toFixed(1)} km
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 border-t border-slate-200 bg-slate-50">
                        {stats.map(({ label, value, color }) => (
                          <div key={label} className="text-center py-3 border-r border-slate-200 last:border-r-0">
                            <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
                            <p className="text-sm font-bold mt-0.5 leading-none" style={{ color }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Route Summary - For Mountains */}
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Route Summary</h3>
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="space-y-4">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-4">
                        <span className="text-green-700 font-bold">1</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900 mb-1">Starting Point (Jumpoff)</h4>
                        <p className="text-sm text-slate-600">
                          Begin your climb at {data.jumpoff_elevation || 'the base elevation'}m. Prepare proper gear and check weather conditions before starting.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-4">
                        <span className="text-blue-700 font-bold">2</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900 mb-1">The Ascent</h4>
                        <p className="text-sm text-slate-600">
                          Gain {(data.summit_elevation || data.elevation_m) - (data.jumpoff_elevation || 0)}m of elevation through varied terrain. Pace yourself and stay hydrated.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center mr-4">
                        <span className="text-red-700 font-bold">3</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900 mb-1">Summit ({data.summit_elevation || data.elevation_m}m)</h4>
                        <p className="text-sm text-slate-600">
                          Reach the peak and enjoy panoramic views. Take time to rest and capture the moment before descending.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Jumpoff to Summit - For Mountains */}
              {(data.jumpoff_elevation || data.summit_elevation) && (
                <div>
                  <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                    <MapPin className="h-3.5 w-3.5" />
                    Elevation Details
                  </h3>
                  <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                    {data.jumpoff_elevation && (
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                        <div className="flex items-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-3"></div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">Jumpoff Point</p>
                            <p className="text-xs text-slate-500">Starting elevation</p>
                          </div>
                        </div>
                        <p className="font-tabular text-base font-bold text-slate-900">{data.jumpoff_elevation}m</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                      <div className="flex items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 mr-3"></div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">Summit</p>
                          <p className="text-xs text-slate-500">Peak elevation</p>
                        </div>
                      </div>
                      <p className="font-tabular text-base font-bold text-slate-900">{data.summit_elevation || data.elevation_m}m</p>
                    </div>
                    {data.jumpoff_elevation && (
                      <div className="pt-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-600">Total Elevation Gain</p>
                          <p className="font-tabular text-base font-bold text-blue-600">
                            +{(data.summit_elevation || data.elevation_m) - data.jumpoff_elevation}m
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Pre-Climb Briefing ── */}
              {(() => {
                const elevGain = (data.summit_elevation || data.elevation_m) - (data.jumpoff_elevation || 0);
                const ascentHours = elevGain / 300;
                const lo = Math.max(1, Math.floor(ascentHours));
                const hi = Math.ceil(ascentHours * 1.3);
                const isHighAlt = data.elevation_m > 2500;
                const isTechnical = data.elevation_m > 2000;

                const parkingInfo = isHighAlt
                  ? `Nearest barangay hall or designated trailhead parking ~${Math.floor(1 + Math.random() * 3)} km from jumpoff. Limited slots — arrive before 5 AM on weekends.`
                  : `Park at the barangay hall or trailhead designated area near ${data.name.split(' ').slice(-1)[0]}. Roadside parking available within 500 m of jumpoff.`;

                const jumpoffInfo = `Jumpoff at elevation ${data.jumpoff_elevation || Math.floor(data.elevation_m * 0.3)} m ASL. Register at the DENR/local guide station before 7 AM. Late arrivals may be turned back for safety.`;

                const waterSources = isHighAlt
                  ? ['Spring at ~' + Math.floor((data.jumpoff_elevation || 200) + elevGain * 0.3) + ' m (Camp 1 area)', 'Stream crossing at mid-trail — treat before drinking', 'No reliable source above ' + Math.floor(data.elevation_m * 0.85) + ' m — carry 3L minimum']
                  : ['Creek at trailhead — usually flowing', 'Spring at ~' + Math.floor((data.jumpoff_elevation || 200) + elevGain * 0.5) + ' m (mid-trail)', 'Carry 2L minimum as backup'];

                const weatherNotes = isHighAlt
                  ? { best: 'Nov – Feb (dry season)', avoid: 'Jun – Sep (typhoon season)', temp: `${Math.floor(5 + (3000 - data.elevation_m) * 0.004)}–${Math.floor(15 + (3000 - data.elevation_m) * 0.004)}°C at summit`, risk: 'Fog and sudden thunderstorms common after noon — aim to summit by 10 AM' }
                  : { best: 'Nov – Apr (dry season)', avoid: 'Jul – Sep (rainy season)', temp: `${Math.floor(18 + (2000 - data.elevation_m) * 0.004)}–${Math.floor(26 + (2000 - data.elevation_m) * 0.004)}°C at summit`, risk: 'Afternoon rain showers common — start early, pack rain gear' };

                const gearList = [
                  ...(isHighAlt ? ['Trekking poles (mandatory)', 'Crampon-compatible boots', 'Fleece + waterproof outer layer'] : ['Ankle-support trail shoes or boots', 'Lightweight rain jacket']),
                  '3–4L water capacity (hydration bladder + bottle)',
                  'Headlamp + spare batteries',
                  'First aid kit with blister care',
                  'Emergency bivy / space blanket',
                  isTechnical ? 'Fixed rope gloves + harness (technical sections)' : 'Gaiters for muddy sections',
                  'High-energy snacks (nuts, energy bars, dried fruit)',
                  'Sunscreen SPF 50+, buff/neck gaiter',
                  'Whistle, map or offline GPS',
                  'LNT waste bag — pack out all trash',
                ];

                const reviews = [
                  { name: 'Jay R.', rating: 5, date: '3 weeks ago', text: `Summit views of ${data.name} were absolutely worth the ${lo}-hour push. Trail is well-marked up to Camp 2 then gets rocky. Highly recommend starting before 4 AM.` },
                  { name: 'Maria L.', rating: 4, date: '1 month ago', text: `Beautiful trail but the last 200m before the summit is steep and exposed. Water source at mid-trail was flowing. Bring poles — you'll need them on the descent.` },
                  { name: 'Kuya Ben', rating: 5, date: '2 months ago', text: `Perfect overnight trip. Camped at ${Math.floor((data.jumpoff_elevation || 200) + elevGain * 0.6)} m — cold but clear skies. Pack warm layers even in summer.` },
                  { name: 'Trisha M.', rating: 3, date: '2 months ago', text: `Trail was muddy after recent rains. Jumpoff registration took 30 min — arrive early. The middle section has overgrown sections; machete crew hadn't cleared yet.` },
                  { name: 'Carlo V.', rating: 5, date: '3 months ago', text: `Third time climbing this and it never gets old. Guide fee is reasonable and locals are super helpful. Respect the mountain and pack out your trash.` },
                ];

                return (
                  <>
                    {/* Stats row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Climb Time</p>
                        <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">{lo}–{hi}h</p>
                        <p className="text-[11px] text-slate-400">ascent (Naismith)</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Fitness</p>
                        <p className="mt-1.5 text-sm font-bold text-slate-900">
                          {data.elevation_m > 3000 ? 'Elite' : data.elevation_m > 2000 ? 'Advanced' : data.elevation_m > 1000 ? 'Intermediate' : 'Beginner'}
                        </p>
                        <p className="text-[11px] text-slate-400">required level</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Best Season</p>
                        <p className="mt-1.5 text-sm font-bold text-slate-900 leading-tight">{weatherNotes.best}</p>
                        <p className="text-[11px] text-slate-400">dry season</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Summit Temp</p>
                        <p className="mt-1.5 text-sm font-bold text-slate-900">{weatherNotes.temp}</p>
                        <p className="text-[11px] text-slate-400">at peak</p>
                      </div>
                    </div>

                    {/* Logistics cards */}
                    <div className="space-y-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-xs">LIST</span>
                        Pre-Climb Briefing
                      </h3>

                      {/* Parking */}
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue-50 text-sm">🅿️</span>
                          <div>
                            <p className="text-sm font-bold text-slate-900">Where to Park</p>
                            <p className="mt-1 text-sm text-slate-600">{parkingInfo}</p>
                            <a
                              href={`https://www.google.com/maps/search/parking+near+${data.coordinates[1]},${data.coordinates[0]}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                            >
                              Find parking on Maps →
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Jumpoff */}
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-emerald-50 text-sm">FLAG</span>
                          <div>
                            <p className="text-sm font-bold text-slate-900">Jumpoff Point</p>
                            <p className="mt-1 text-sm text-slate-600">{jumpoffInfo}</p>
                            <p className="mt-1 font-mono text-xs text-slate-400">{data.coordinates[1].toFixed(5)}°, {data.coordinates[0].toFixed(5)}°</p>
                          </div>
                        </div>
                      </div>

                      {/* Water sources */}
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-cyan-50 text-sm">WATER</span>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-900">Water Sources</p>
                            <ul className="mt-2 space-y-1">
                              {waterSources.map((s, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-sm text-slate-600">
                                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-400" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-2 py-1">WARNING: Always filter or treat water from natural sources</p>
                          </div>
                        </div>
                      </div>

                      {/* Weather */}
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-sky-50 text-sm">WEATHER</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">Weather Conditions</p>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <div className="rounded-md bg-emerald-50 px-3 py-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Best time</p>
                                <p className="text-sm font-bold text-emerald-900">{weatherNotes.best}</p>
                              </div>
                              <div className="rounded-lg bg-red-50 px-3 py-2">
                                <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide">Avoid</p>
                                <p className="text-sm font-bold text-red-900">{weatherNotes.avoid}</p>
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                              RISK: {weatherNotes.risk}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Recommended Gear */}
                    <div>
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-xs">GEAR</span>
                        Recommended Gear
                      </h3>
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                          {gearList.map((item, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                              <span className="mt-0.5 flex-shrink-0 text-emerald-500">-</span>
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Top 5 Reviews */}
                    <div>
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-50 text-xs">⭐</span>
                        Climber Reviews
                      </h3>
                      <div className="space-y-3">
                        {reviews.map((review, i) => (
                          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white">
                                  {review.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{review.name}</p>
                                  <p className="text-xs text-slate-400">{review.date}</p>
                                </div>
                              </div>
                              <div className="flex gap-0.5 flex-shrink-0">
                                {Array.from({ length: 5 }).map((_, s) => (
                                  <span key={s} className={s < review.rating ? 'text-amber-400' : 'text-slate-200'}>*</span>
                                ))}
                              </div>
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed">{review.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Location coords */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Coordinates</h3>
                      <div className="rounded-lg bg-slate-50 px-4 py-3 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-500">Latitude</p>
                          <p className="font-mono text-sm font-medium text-slate-900">{data.coordinates[1].toFixed(6)}°</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Longitude</p>
                          <p className="font-mono text-sm font-medium text-slate-900">{data.coordinates[0].toFixed(6)}°</p>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5">
                <button className="flex-1 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800">
                  Find Routes to Summit
                </button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${data.coordinates[1]},${data.coordinates[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-md border border-slate-300 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Get Directions
                </a>
                <button className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                  Share
                </button>
              </div>
            </div>
          ) : data.type === 'campsite' ? (
            <div className="space-y-6">
              {/* Camper Profile type label */}
              <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-100">
                  <Tent className="h-4 w-4 text-emerald-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Campsite Profile</p>
                  <p className="text-xs text-slate-500">Complete campsite details with amenities, ratings, and location information</p>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Type</p>
                  <p className="mt-1.5 text-xl font-bold capitalize text-slate-900">{data.campsite_type}</p>
                </div>
                {data.rating && (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Rating</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <p className="font-tabular text-xl font-bold text-slate-900">{data.rating.toFixed(1)}</p>
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Coordinates</p>
                  <p className="font-tabular mt-1.5 text-xs font-medium text-slate-700">
                    {data.coordinates[1].toFixed(4)}, {data.coordinates[0].toFixed(4)}
                  </p>
                </div>
              </div>

              {/* Photos Gallery */}
              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  <Camera className="h-3.5 w-3.5" />
                  Photos
                </h3>
                {loadingPhotos ? (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8">
                    <div className="text-center">
                      <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                      <p className="text-sm text-slate-400">Loading photos…</p>
                    </div>
                  </div>
                ) : resolvedPhotos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {resolvedPhotos.slice(0, 6).map((photo, index) => (
                      <div key={index} className="relative group cursor-pointer rounded-lg overflow-hidden aspect-square">
                        <Image
                          src={photo}
                          alt={`${data.name} - Photo ${index + 1}`}
                          fill
                          className="object-cover transition-all duration-500 group-hover:scale-110 group-hover:rotate-1"
                          sizes="(max-width: 768px) 50vw, 33vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8">
                    <div className="text-center">
                      <Camera className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                      <p className="text-sm text-slate-400">No photos available</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Amenities */}
              {data.amenities && data.amenities.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Amenities</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {data.amenities.map((amenity, index) => (
                      <span
                        key={index}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Camper Profile Details */}
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Camping Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Site Type</p>
                    <p className="mt-1.5 text-base font-bold capitalize text-slate-900">{data.campsite_type}</p>
                    <p className="text-xs text-slate-500">
                      {data.campsite_type === 'developed' ? 'Full facilities' :
                       data.campsite_type === 'primitive' ? 'Basic setup' :
                       'Backcountry camping'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Accessibility</p>
                    <p className="mt-1.5 text-base font-bold text-slate-900">
                      {data.campsite_type === 'developed' ? 'Drive-In' :
                       data.campsite_type === 'primitive' ? 'Hike-In' :
                       'Remote'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {data.campsite_type === 'developed' ? 'Vehicle access' :
                       data.campsite_type === 'primitive' ? '1–5 km hike' :
                       'Remote location'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Experience Level</p>
                    <p className="mt-1.5 text-base font-bold text-slate-900">
                      {data.campsite_type === 'developed' ? 'Beginner' :
                       data.campsite_type === 'primitive' ? 'Intermediate' :
                       'Advanced'}
                    </p>
                    <p className="text-xs text-slate-500">Recommended skill level</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Best Season</p>
                    <p className="mt-1.5 text-base font-bold text-slate-900">
                      {data.campsite_type === 'developed' ? 'Year-Round' :
                       data.campsite_type === 'primitive' ? 'Apr–Oct' :
                       'Jun–Sep'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {data.campsite_type === 'developed' ? 'All seasons' :
                       data.campsite_type === 'primitive' ? 'Spring to fall' :
                       'Summer only'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Gear Recommendations */}
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Recommended Gear</h3>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Shelter</h4>
                      <ul className="text-sm text-slate-600 space-y-1">
                        <li>• {data.campsite_type === 'developed' ? 'Tent or RV' : data.campsite_type === 'primitive' ? '3-season tent' : 'Lightweight backpacking tent'}</li>
                        <li>• Sleeping bag ({data.campsite_type === 'developed' ? 'comfort rated' : 'temperature rated'})</li>
                        <li>• Sleeping pad or mattress</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cooking</h4>
                      <ul className="text-sm text-slate-600 space-y-1">
                        <li>• {data.campsite_type === 'developed' ? 'Camp stove or grill' : 'Portable camp stove'}</li>
                        <li>• Cookware and utensils</li>
                        <li>• Food storage {data.campsite_type !== 'developed' && '(bear-proof)'}</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Essentials</h4>
                      <ul className="text-sm text-slate-600 space-y-1">
                        <li>• Headlamp/flashlight</li>
                        <li>• First aid kit</li>
                        <li>• Water filtration</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Clothing</h4>
                      <ul className="text-sm text-slate-600 space-y-1">
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
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">About This Campsite</h3>
                <div className="space-y-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">
                      <span className="font-semibold text-slate-900">{data.name}</span> is a{' '}
                      {data.campsite_type} located at coordinates{' '}
                      {data.coordinates[0].toFixed(4)}, {data.coordinates[1].toFixed(4)}.
                      {data.rating && ` Rated ${data.rating.toFixed(1)} stars.`}
                      {' '}Perfect for outdoor enthusiasts looking for a comfortable base to explore the surrounding trails and mountains.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Nearby Activities</p>
                    <p className="text-sm text-slate-600">
                      Hiking, mountain climbing, nature photography, stargazing, and wildlife observation
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5">
                <button className="flex-1 rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
                  Check Availability
                </button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${data.coordinates[1]},${data.coordinates[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-md border border-slate-300 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Get Directions
                </a>
                <button className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                  Share
                </button>
              </div>
            </div>
          ) : data.type === 'activity' ? (
            <div className="space-y-6">
              {/* Source badge */}
              {(() => {
                const sourceMeta: Record<string, { label: string; bg: string; text: string }> = {
                  strava:  { label: 'Strava',        bg: 'bg-orange-50',  text: 'text-orange-700' },
                  coros:   { label: 'COROS',          bg: 'bg-blue-50',    text: 'text-blue-700'   },
                  garmin:  { label: 'Garmin Connect', bg: 'bg-sky-50',     text: 'text-sky-700'    },
                  komoot:  { label: 'Komoot',         bg: 'bg-green-50',   text: 'text-green-700'  },
                };
                const meta = sourceMeta[data.source] ?? { label: data.source, bg: 'bg-slate-50', text: 'text-slate-700' };
                const activityDate = new Date(data.start_date).toLocaleDateString(undefined, {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                });
                return (
                  <div className={`flex items-center gap-3 rounded-lg border border-slate-200 ${meta.bg} px-4 py-3`}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-sm">
                      <Route className={`h-4 w-4 ${meta.text}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${meta.text}`}>{meta.label} Activity</p>
                      <p className="text-xs text-slate-500">{activityDate}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Distance</p>
                  <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">
                    {data.distance_km.toFixed(2)}{' '}
                    <span className="text-sm font-normal text-slate-500">km</span>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Elevation Gain</p>
                  <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">
                    {data.elevation_gain_m}{' '}
                    <span className="text-sm font-normal text-slate-500">m</span>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Moving Time</p>
                  <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">
                    {(() => {
                      const h = Math.floor(data.moving_time_s / 3600);
                      const m = Math.floor((data.moving_time_s % 3600) / 60);
                      return h > 0 ? `${h}h ${m}m` : `${m}m`;
                    })()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sport</p>
                  <p className="mt-1.5 text-base font-bold capitalize text-slate-900">{data.sport_type}</p>
                </div>
                {data.avg_heartrate && (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Avg Heart Rate</p>
                    <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">
                      {Math.round(data.avg_heartrate)}{' '}
                      <span className="text-sm font-normal text-slate-500">bpm</span>
                    </p>
                  </div>
                )}
                {data.max_heartrate && (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Max Heart Rate</p>
                    <p className="font-tabular mt-1.5 text-xl font-bold text-slate-900">
                      {Math.round(data.max_heartrate)}{' '}
                      <span className="text-sm font-normal text-slate-500">bpm</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Pace / Speed */}
              {data.moving_time_s > 0 && data.distance_km > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Performance</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Avg Speed</p>
                      <p className="font-tabular mt-0.5 font-bold text-slate-900">
                        {((data.distance_km / data.moving_time_s) * 3600).toFixed(1)} km/h
                      </p>
                    </div>
                    {data.sport_type.toLowerCase() !== 'ride' && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400">Avg Pace</p>
                        <p className="font-tabular mt-0.5 font-bold text-slate-900">
                          {(() => {
                            const secPerKm = data.moving_time_s / data.distance_km;
                            const m = Math.floor(secPerKm / 60);
                            const s = Math.round(secPerKm % 60);
                            return `${m}:${s.toString().padStart(2, '0')} /km`;
                          })()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5">
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
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${data.coordinates[1]},${data.coordinates[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-md border border-slate-300 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Open in Maps
                  </a>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

