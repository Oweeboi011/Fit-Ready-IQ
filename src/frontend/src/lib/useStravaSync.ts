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

// Loads activities from localStorage on mount, refreshes from Strava if a
// valid token is cached (paginated, throttled to once per 5 minutes), and
// background-syncs historical activities to Firestore for authenticated
// users (at most once per hour).
export function useStravaSync(uid: string | null | undefined) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stravaSyncState, setStravaSyncState] = useState<StravaSyncState>('idle');

  useEffect(() => {
    const stored = loadActivities();
    if (stored.length > 0) setActivities(stored);

    (async () => {
      // One-time cleanup of the token an earlier version left in localStorage.
      // Harmless if absent; the refresh token beside it was not harmless to keep.
      clearLegacyStravaToken();

      // Strava now requires a signed-in account, because the tokens are held
      // server-side against a uid. Without one there is nothing to sync.
      if (!uid) return;

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
          // The Strava credential is server-side now; all we present is our
          // Firebase ID token, which is revocable.
          const res = await authedFetch(`/api/strava/activities?page=${page}`);
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
      if (uid) {
        const SYNC_KEY = 'fri_strava_last_firestore_sync';
        const SYNC_TTL_MS = 60 * 60 * 1000; // re-sync at most once per hour
        const lastSync = parseInt(localStorage.getItem(SYNC_KEY) ?? '0', 10);
        if (Date.now() - lastSync > SYNC_TTL_MS) {
          // authedFetch, not fetch: the route derives the destination uid from
          // the Firebase ID token. Sending our own uid in the body would be an
          // unverifiable claim, and the route no longer reads one.
          authedFetch('/api/strava/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
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
  }, [uid]);

  return { activities, setActivities, stravaSyncState };
}
