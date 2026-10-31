import { useEffect, useState } from 'react';
import {
  type Activity,
  loadActivities,
  saveActivities,
  mergeActivities,
} from '@/lib/activityTypes';
import { authedFetch } from '@/lib/firebaseClient';
import { decodePolyline } from '@/lib/polylineDecoder';
import { clearLegacyStravaToken } from '@/lib/stravaAuth';

type StravaSyncState = 'idle' | 'syncing' | 'failed';

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

const STRAVA_REFRESH_KEY = 'fri_strava_last_fetch';
const STRAVA_TTL_MS = 5 * 60 * 1000;
const SYNC_KEY = 'fri_strava_last_firestore_sync';
const SYNC_TTL_MS = 60 * 60 * 1000; // re-sync at most once per hour

/** Strava paginates 30 per page; same cap as the server-side sync. */
const STRAVA_MAX_PAGES = 10;
const PER_PAGE = 30;

/**
 * Storage that cannot throw. Private browsing and blocked site data make
 * `localStorage` throw on access, which used to surface as an unhandled
 * rejection from inside this effect.
 */
function readStamp(key: string): number {
  try {
    return parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeStamp(key: string): void {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // Without storage the throttle cannot persist; the next load simply asks again.
  }
}

function toActivity(item: StravaItem): Activity {
  return {
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
    start_latlng: item.start_latlng ? [item.start_latlng[1], item.start_latlng[0]] : undefined,
    polyline: item.map?.summary_polyline ? decodePolyline(item.map.summary_polyline) : undefined,
  };
}

type FetchOutcome =
  { kind: 'ok'; items: StravaItem[] } | { kind: 'not_connected' } | { kind: 'failed' };

/** Every page of the caller's recent activities, or why there are none. */
async function fetchStravaPages(): Promise<FetchOutcome> {
  const items: StravaItem[] = [];
  try {
    for (let page = 1; page <= STRAVA_MAX_PAGES; page++) {
      // The Strava credential is server-side now; all we present is our
      // Firebase ID token, which is revocable.
      const res = await authedFetch(`/api/strava/activities?page=${page}`);
      // 409 is the route's "no Strava connection" — the normal state for
      // anyone who never linked one, not a failed sync to warn them about.
      if (res.status === 409) return { kind: 'not_connected' };
      if (!res.ok) {
        // A non-OK page used to `break` silently, truncating the history
        // and reporting it as a complete sync.
        console.error('Strava activities request failed:', res.status);
        return { kind: 'failed' };
      }
      const pageItems: StravaItem[] = await res.json();
      if (!pageItems || pageItems.length === 0) break;
      items.push(...pageItems);
      if (pageItems.length < PER_PAGE) break;
    }
  } catch (err) {
    console.error('Strava sync failed:', err);
    return { kind: 'failed' };
  }
  return { kind: 'ok', items };
}

/** Fire-and-forget copy of the history into Firestore, at most hourly. */
function backgroundFirestoreSync(): void {
  if (Date.now() - readStamp(SYNC_KEY) <= SYNC_TTL_MS) return;
  // authedFetch, not fetch: the route derives the destination uid from the
  // Firebase ID token. Sending our own uid in the body would be an
  // unverifiable claim, and the route no longer reads one.
  authedFetch('/api/strava/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
    .then((r) => {
      if (r.ok) writeStamp(SYNC_KEY);
    })
    .catch(() => {
      /* non-critical, will retry next load */
    });
}

// Loads activities from localStorage on mount, refreshes from Strava for a
// signed-in user (paginated, throttled to once per 5 minutes), and
// background-syncs historical activities to Firestore (at most once per hour).
export function useStravaSync(uid: string | null | undefined) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stravaSyncState, setStravaSyncState] = useState<StravaSyncState>('idle');

  useEffect(() => {
    // A uid change or unmount mid-fetch must not land stale results.
    let cancelled = false;

    const stored = loadActivities();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser state is read after mount; reading it during render breaks hydration
    if (stored.length > 0) setActivities(stored);

    (async () => {
      // One-time cleanup of the token an earlier version left in localStorage.
      // Harmless if absent; the refresh token beside it was not harmless to keep.
      clearLegacyStravaToken();

      // Strava now requires a signed-in account, because the tokens are held
      // server-side against a uid. Without one there is nothing to sync.
      if (!uid) return;
      if (Date.now() - readStamp(STRAVA_REFRESH_KEY) < STRAVA_TTL_MS) return;

      // Previously this ran with no indicator and swallowed every failure, so
      // activities either appeared out of nowhere or never appeared at all.
      setStravaSyncState('syncing');
      const outcome = await fetchStravaPages();
      if (cancelled) return;

      if (outcome.kind === 'failed') {
        // Not stamped: a failed refresh is retried on the next load, not
        // skipped for five minutes as if it had worked.
        setStravaSyncState('failed');
        return;
      }
      setStravaSyncState('idle');
      if (outcome.kind === 'not_connected') return;

      writeStamp(STRAVA_REFRESH_KEY);
      if (outcome.items.length > 0) {
        // Merged into what is stored *now*. Merging into the snapshot read at
        // mount overwrote anything imported while the fetch was in flight — a
        // GPX file added from the Connect Devices modal simply vanished.
        const merged = mergeActivities(loadActivities(), outcome.items.map(toActivity));
        saveActivities(merged);
        setActivities(merged);
      }

      backgroundFirestoreSync();
    })();

    return () => {
      cancelled = true;
    };
    // Re-run when uid changes so users who sign in post-mount get their Strava sync fired.
  }, [uid]);

  return { activities, setActivities, stravaSyncState };
}
