import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadActivities, saveActivities, type Activity } from './activityTypes';
import { useStravaSync } from './useStravaSync';

/**
 * The browser-side Strava refresh. What matters is what it does to the stored
 * activity list, and whether a failure is mistaken for a success (or the
 * reverse) — both of which it used to get wrong.
 */

const authedFetch = vi.fn();
vi.mock('./firebaseClient', () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock('./stravaAuth', () => ({ clearLegacyStravaToken: () => undefined }));

const REFRESH_KEY = 'fri_strava_last_fetch';

function gpx(id: string): Activity {
  return {
    id,
    source: 'garmin',
    name: 'Imported ride',
    sport_type: 'Ride',
    start_date: '2026-09-01T08:00:00Z',
    distance_km: 20,
    elevation_gain_m: 200,
    moving_time_s: 3600,
  } as Activity;
}

const stravaItem = {
  id: 7,
  name: 'Morning run',
  sport_type: 'Run',
  start_date: '2026-09-20T06:00:00Z',
  distance: 5000,
  total_elevation_gain: 40,
  moving_time: 1500,
};

function respond(status: number, body: unknown = []) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  localStorage.clear();
  authedFetch.mockReset();
});

describe('useStravaSync', () => {
  it('merges into what is stored at write time, keeping an import made mid-fetch', async () => {
    let release: (v: unknown) => void = () => undefined;
    authedFetch.mockImplementation((url: string) =>
      url.includes('/activities')
        ? new Promise((resolve) => {
            release = () => resolve(respond(200, [stravaItem]));
          })
        : Promise.resolve(respond(200, { synced: 1 }))
    );

    renderHook(() => useStravaSync('alice'));
    // A GPX import lands while the Strava fetch is still in flight.
    saveActivities([gpx('gpx-1')]);
    release(undefined);

    await waitFor(() => expect(loadActivities()).toHaveLength(2));
    expect(
      loadActivities()
        .map((a) => a.id)
        .sort()
    ).toEqual(['gpx-1', 'strava-7']);
  });

  it('treats "not connected" as the normal state, not a failed sync', async () => {
    authedFetch.mockResolvedValue(respond(409, { error: 'not connected' }));
    const { result } = renderHook(() => useStravaSync('alice'));

    await waitFor(() => expect(authedFetch).toHaveBeenCalled());
    await waitFor(() => expect(result.current.stravaSyncState).toBe('idle'));
    // No background Firestore sync for a user with no connection.
    expect(authedFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a real failure, and does not stamp the throttle as if it had worked', async () => {
    authedFetch.mockResolvedValue(respond(502));
    const { result } = renderHook(() => useStravaSync('alice'));

    await waitFor(() => expect(result.current.stravaSyncState).toBe('failed'));
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('does nothing for a signed-out visitor', async () => {
    renderHook(() => useStravaSync(null));
    await Promise.resolve();
    expect(authedFetch).not.toHaveBeenCalled();
  });
});
