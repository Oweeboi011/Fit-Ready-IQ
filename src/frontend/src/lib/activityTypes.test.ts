import { describe, expect, it, vi } from 'vitest';

import {
  SOURCE_BG,
  SOURCE_COLORS,
  SOURCE_LABELS,
  formatDuration,
  loadActivities,
  mergeActivities,
  saveActivities,
  type Activity,
} from '@/lib/activityTypes';

/** Builds an Activity with sensible defaults, overridable per test. */
function activity(overrides: Partial<Activity> & Pick<Activity, 'id'>): Activity {
  return {
    source: 'strava',
    name: 'Activity',
    sport_type: 'Run',
    start_date: '2024-01-01T00:00:00.000Z',
    distance_km: 5,
    elevation_gain_m: 50,
    moving_time_s: 1500,
    ...overrides,
  };
}

describe('formatDuration', () => {
  it('formats durations of an hour or more as H:MM:SS', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(36000)).toBe('10:00:00');
  });

  it('formats durations under an hour as M:SS', () => {
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(599)).toBe('9:59');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('pads seconds but not the leading unit', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3665)).toBe('1:01:05');
  });

  it('separates each unit with a colon', () => {
    expect(formatDuration(7325).split(':')).toEqual(['2', '02', '05']);
  });
});

describe('source display maps', () => {
  const sources: Activity['source'][] = ['strava', 'coros', 'garmin', 'komoot', 'apple_health'];

  it('labels every source', () => {
    expect(SOURCE_LABELS).toEqual({
      strava: 'Strava',
      coros: 'COROS',
      garmin: 'Garmin',
      komoot: 'Komoot',
      apple_health: 'Apple Health',
    });
  });

  it('assigns every source a brand colour', () => {
    expect(SOURCE_COLORS).toEqual({
      strava: '#fc4c02',
      coros: '#2563eb',
      garmin: '#0ea5e9',
      komoot: '#16a34a',
      apple_health: '#ef4444',
    });
  });

  it('assigns every source a background class', () => {
    expect(SOURCE_BG).toEqual({
      strava: 'bg-orange-500',
      coros: 'bg-blue-600',
      garmin: 'bg-sky-500',
      komoot: 'bg-green-600',
      apple_health: 'bg-red-500',
    });
  });

  it('covers all sources in every map, with no blank entries', () => {
    for (const source of sources) {
      expect(SOURCE_LABELS[source]).toBeTruthy();
      expect(SOURCE_COLORS[source]).toMatch(/^#[0-9a-f]{6}$/);
      expect(SOURCE_BG[source]).toMatch(/^bg-/);
    }
  });
});

describe('mergeActivities', () => {
  it('merges activities by id and sorts by latest start date', () => {
    const merged = mergeActivities(
      [activity({ id: 'a1', name: 'Older', start_date: '2024-01-01T00:00:00.000Z' })],
      [
        activity({ id: 'a1', name: 'Updated', start_date: '2024-01-02T00:00:00.000Z' }),
        activity({
          id: 'a2',
          name: 'Newest',
          source: 'garmin',
          start_date: '2024-01-03T00:00:00.000Z',
        }),
      ]
    );

    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('a2');
    expect(merged[1].name).toBe('Updated');
  });

  it('lets an incoming activity overwrite the existing one with the same id', () => {
    const merged = mergeActivities(
      [activity({ id: 'a1', name: 'Old', distance_km: 1 })],
      [activity({ id: 'a1', name: 'New', distance_km: 42 })]
    );

    expect(merged).toEqual([expect.objectContaining({ name: 'New', distance_km: 42 })]);
  });

  it('sorts newest first across many activities', () => {
    const merged = mergeActivities(
      [],
      [
        activity({ id: 'mid', start_date: '2024-05-01T00:00:00.000Z' }),
        activity({ id: 'old', start_date: '2024-01-01T00:00:00.000Z' }),
        activity({ id: 'new', start_date: '2024-09-01T00:00:00.000Z' }),
      ]
    );

    expect(merged.map((a) => a.id)).toEqual(['new', 'mid', 'old']);
  });

  it('keeps existing activities that are absent from the incoming batch', () => {
    const merged = mergeActivities([activity({ id: 'keep' })], [activity({ id: 'add' })]);

    expect(merged.map((a) => a.id).sort()).toEqual(['add', 'keep']);
  });

  it('returns an empty list when both inputs are empty', () => {
    expect(mergeActivities([], [])).toEqual([]);
  });
});

describe('activity persistence', () => {
  it('persists and reloads activities from localStorage', () => {
    const activities = [activity({ id: 'a1', source: 'komoot', name: 'Load Test' })];

    saveActivities(activities);

    expect(loadActivities()).toEqual(activities);
  });

  it('writes to the fri_activities key as JSON', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn() });

    const activities = [activity({ id: 'a1' })];
    saveActivities(activities);

    expect(setItem).toHaveBeenCalledWith('fri_activities', JSON.stringify(activities));
    vi.unstubAllGlobals();
  });

  it('reads from the fri_activities key', () => {
    const getItem = vi.fn(() => null);
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });

    loadActivities();

    expect(getItem).toHaveBeenCalledWith('fri_activities');
    vi.unstubAllGlobals();
  });

  it('returns an empty list when nothing has been stored', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    expect(loadActivities()).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('returns an empty list when the stored value is an empty string', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => ''), setItem: vi.fn() });

    expect(loadActivities()).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('returns empty activities on malformed localStorage payload', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'not-json'),
      setItem: vi.fn(),
    });

    expect(loadActivities()).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('swallows write failures when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError');
      }),
      getItem: vi.fn(),
    });

    expect(() => saveActivities([activity({ id: 'a1' })])).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('returns an empty list when reading throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('SecurityError');
      }),
      setItem: vi.fn(),
    });

    expect(loadActivities()).toEqual([]);
    vi.unstubAllGlobals();
  });
});
