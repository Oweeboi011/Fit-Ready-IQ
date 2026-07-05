/** Shared Activity type used across the app.
 * Activities come from Strava (OAuth) or GPX file uploads (COROS, Garmin, Komoot).
 */
export interface Activity {
  id: string;
  source: 'strava' | 'coros' | 'garmin' | 'komoot' | 'apple_health';
  name: string;
  sport_type: string; // 'Run', 'Hike', 'Ride', 'Walk', etc.
  start_date: string; // ISO 8601
  distance_km: number;
  elevation_gain_m: number;
  moving_time_s: number;
  polyline?: [number, number][]; // [lng, lat] pairs
  start_latlng?: [number, number]; // [lng, lat]
  avg_heartrate?: number;
  max_heartrate?: number;
  external_id?: string; // Strava activity ID or file name
}

/** Polyline payload passed to MapView for rendering imported activity routes. */
export interface ActivityPolyline {
  id: string;
  coords: [number, number][]; // [lng, lat] pairs
  source: string;
  name: string;
}

/** Format seconds → H:MM:SS or M:SS */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Source display helpers */
export const SOURCE_LABELS: Record<Activity['source'], string> = {
  strava: 'Strava',
  coros: 'COROS',
  garmin: 'Garmin',
  komoot: 'Komoot',
  apple_health: 'Apple Health',
};

export const SOURCE_COLORS: Record<Activity['source'], string> = {
  strava: '#fc4c02',
  coros: '#2563eb',
  garmin: '#0ea5e9',
  komoot: '#16a34a',
  apple_health: '#ef4444',
};

export const SOURCE_BG: Record<Activity['source'], string> = {
  strava: 'bg-orange-500',
  coros: 'bg-blue-600',
  garmin: 'bg-sky-500',
  komoot: 'bg-green-600',
  apple_health: 'bg-red-500',
};

/** Persist activities to localStorage */
const STORAGE_KEY = 'fri_activities';

export function saveActivities(activities: Activity[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
  } catch {
    // localStorage may be unavailable (SSR or private browsing quota)
  }
}

export function loadActivities(): Activity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Activity[];
  } catch {
    return [];
  }
}

export function mergeActivities(existing: Activity[], incoming: Activity[]): Activity[] {
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const activity of incoming) {
    byId.set(activity.id, activity);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );
}
