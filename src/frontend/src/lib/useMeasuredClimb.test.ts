import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RouteDetails } from './detailsData';
import { useMeasuredClimb, waymarkedRef } from './useMeasuredClimb';

const route = (id: string, extra: Partial<RouteDetails> = {}): RouteDetails => ({
  type: 'route',
  id,
  name: 'Mark Twain Weg',
  coordinates: [7.75, 46.0],
  distance_km: 3.3,
  elevation_gain_m: null,
  difficulty: 'unknown',
  activity_type: 'hike',
  ...extra,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('waymarkedRef', () => {
  it('reads the site and relation from a discovered route id', () => {
    expect(waymarkedRef('wmt-mtb-123')).toEqual({ site: 'mtb', id: '123' });
    expect(waymarkedRef('osm-node-1')).toBeNull();
  });
});

describe('useMeasuredClimb', () => {
  it('measures an unrated route and rates it the harder way round', async () => {
    const fetchMock = vi.fn(async () => Response.json({ climbM: 15, descentM: 600 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMeasuredClimb(route('wmt-hiking-101')));
    expect(result.current.climbSource).toBe('measuring');

    await waitFor(() => expect(result.current.climbSource).toBe('measured'));
    const details = result.current.details as RouteDetails;
    expect(details.elevation_gain_m).toBe(15);
    // Rated on 600 m, not 15: someone may walk it the other way. 15 m alone is easy.
    expect(details.difficulty).toBe('moderate');
    expect(result.current.measuredClimb).toEqual({ climbM: 15, descentM: 600 });
    expect(fetchMock).toHaveBeenCalledWith('/api/route-climb?site=hiking&id=101', {
      signal: expect.any(AbortSignal),
    });
  });

  it('leaves a tagged climb alone and asks nothing', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const tagged = route('wmt-hiking-102', { elevation_gain_m: 400, difficulty: 'moderate' });

    const { result } = renderHook(() => useMeasuredClimb(tagged));
    expect(result.current).toEqual({ details: tagged, climbSource: 'tagged' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the climb unknown when it cannot be measured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ climbM: null, reason: 'too_long' }))
    );
    const { result } = renderHook(() => useMeasuredClimb(route('wmt-hiking-103')));

    await waitFor(() => expect(result.current.climbSource).toBe('unavailable'));
    expect((result.current.details as RouteDetails).elevation_gain_m).toBeNull();
  });

  it('treats a failed request as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    const { result } = renderHook(() => useMeasuredClimb(route('wmt-hiking-104')));
    await waitFor(() => expect(result.current.climbSource).toBe('unavailable'));
  });
});
