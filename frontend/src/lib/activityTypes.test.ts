import { describe, expect, it, vi } from 'vitest';

import {
  formatDuration,
  loadActivities,
  mergeActivities,
  saveActivities,
  type Activity,
} from '@/lib/activityTypes';

describe('activityTypes helpers', () => {
  it('formats duration with hour precision', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(59)).toBe('0:59');
  });

  it('merges activities by id and sorts by latest start date', () => {
    const existing: Activity[] = [
      {
        id: 'a1',
        source: 'strava',
        name: 'Older',
        sport_type: 'Run',
        start_date: '2024-01-01T00:00:00.000Z',
        distance_km: 5,
        elevation_gain_m: 50,
        moving_time_s: 1500,
      },
    ];

    const incoming: Activity[] = [
      {
        id: 'a1',
        source: 'strava',
        name: 'Updated',
        sport_type: 'Run',
        start_date: '2024-01-02T00:00:00.000Z',
        distance_km: 6,
        elevation_gain_m: 60,
        moving_time_s: 1600,
      },
      {
        id: 'a2',
        source: 'garmin',
        name: 'Newest',
        sport_type: 'Hike',
        start_date: '2024-01-03T00:00:00.000Z',
        distance_km: 8,
        elevation_gain_m: 120,
        moving_time_s: 3600,
      },
    ];

    const merged = mergeActivities(existing, incoming);

    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('a2');
    expect(merged[1].name).toBe('Updated');
  });

  it('persists and reloads activities from localStorage', () => {
    const activities: Activity[] = [
      {
        id: 'a1',
        source: 'komoot',
        name: 'Load Test',
        sport_type: 'Ride',
        start_date: '2024-06-01T00:00:00.000Z',
        distance_km: 20,
        elevation_gain_m: 200,
        moving_time_s: 4200,
      },
    ];

    saveActivities(activities);

    expect(loadActivities()).toEqual(activities);
  });

  it('returns empty activities on malformed localStorage payload', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'not-json'),
      setItem: vi.fn(),
    });

    expect(loadActivities()).toEqual([]);
    vi.unstubAllGlobals();
  });
});
