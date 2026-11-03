import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedPlan } from './savedPlans';
import { usePlanSync } from './usePlanSync';

const cloud = vi.hoisted(() => ({
  fetchCloudPlans: vi.fn(),
  writeCloudPlan: vi.fn(),
  writeCloudPlans: vi.fn(),
  deleteCloudPlan: vi.fn(),
}));

vi.mock('./planSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./planSync')>()),
  ...cloud,
}));

const plan = (id: string, savedAt: number): SavedPlan => ({
  id,
  name: id,
  waypoints: [{ id: 'w', name: 'w', coordinates: [120.9, 16.5] }],
  savedAt,
  distanceKm: null,
});

/** The account, as the mocked writes leave it. */
let account: Map<string, SavedPlan>;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  account = new Map();
  cloud.fetchCloudPlans.mockImplementation(async () => [...account.values()]);
  cloud.writeCloudPlan.mockImplementation(async (_uid: string, p: SavedPlan) => {
    account.set(p.id, p);
  });
  cloud.writeCloudPlans.mockImplementation(async (_uid: string, plans: SavedPlan[]) => {
    plans.forEach((p) => account.set(p.id, p));
  });
});

describe('usePlanSync', () => {
  it('keeps a plan saved while the account was being read', async () => {
    account.set('cloud', plan('cloud', 1));
    let answer!: (plans: SavedPlan[]) => void;
    cloud.fetchCloudPlans.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    );

    const { result } = renderHook(() => usePlanSync('uid-1', true));
    await waitFor(() => expect(cloud.fetchCloudPlans).toHaveBeenCalledTimes(1));

    // Saved mid-sync: the first merge read the device before this existed.
    await act(() => result.current.save(plan('mine', 5)));
    await act(async () => answer([plan('cloud', 1)]));

    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(cloud.fetchCloudPlans).toHaveBeenCalledTimes(2);
    expect(result.current.plans.map((p) => p.id)).toEqual(['mine', 'cloud']);
  });

  it('uploads plans made signed out in one batch', async () => {
    localStorage.setItem('fri_saved_plans', JSON.stringify([plan('a', 1), plan('b', 2)]));

    const { result } = renderHook(() => usePlanSync('uid-1', true));

    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(cloud.writeCloudPlans).toHaveBeenCalledTimes(1);
    expect(cloud.writeCloudPlans.mock.calls[0][1].map((p: SavedPlan) => p.id).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('says so when the account cannot be read, and keeps the device list', async () => {
    localStorage.setItem('fri_saved_plans', JSON.stringify([plan('a', 1)]));
    cloud.fetchCloudPlans.mockRejectedValue(new Error('denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => usePlanSync('uid-1', true));

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.plans.map((p) => p.id)).toEqual(['a']);
  });
});
