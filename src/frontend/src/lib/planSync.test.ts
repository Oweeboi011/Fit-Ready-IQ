import { describe, expect, it, vi } from 'vitest';

import { mergePlans } from './planSync';
import type { SavedPlan } from './savedPlans';

// Hoisted above the imports: planSync must not pull in the Firebase client.
vi.mock('./useSavedPlaces', () => ({ getFirestoreDb: async () => null }));

const plan = (id: string, savedAt: number, extra: Partial<SavedPlan> = {}): SavedPlan => ({
  id,
  name: id,
  waypoints: [{ id: 'w', name: 'w', coordinates: [120.9, 16.5] }],
  savedAt,
  distanceKm: null,
  ...extra,
});

describe('mergePlans', () => {
  it('uploads a plan made on this device while signed out', () => {
    const local = plan('a', 1);
    const { plans, upload } = mergePlans([local], []);
    expect(upload).toEqual([local]);
    expect(plans).toEqual([{ ...local, synced: true }]);
  });

  it("brings in another device's plans", () => {
    const remote = plan('b', 2);
    const { plans, upload } = mergePlans([], [remote]);
    expect(upload).toEqual([]);
    expect(plans).toEqual([{ ...remote, synced: true }]);
  });

  it('drops a synced plan the account no longer has — it was deleted elsewhere', () => {
    const { plans, upload } = mergePlans([plan('gone', 1, { synced: true })], []);
    expect(plans).toEqual([]);
    expect(upload).toEqual([]);
  });

  it('keeps the later edit of a plan both sides have, and uploads it if it is ours', () => {
    const ours = plan('c', 5, { name: 'edited here', synced: true });
    const theirs = plan('c', 3, { name: 'older' });
    const merged = mergePlans([ours], [theirs]);
    expect(merged.plans[0].name).toBe('edited here');
    expect(merged.upload).toEqual([ours]);

    const newer = mergePlans([plan('c', 3, { synced: true })], [plan('c', 9, { name: 'new' })]);
    expect(newer.plans[0].name).toBe('new');
    expect(newer.upload).toEqual([]);
  });

  it('returns newest first, every entry marked synced', () => {
    const { plans } = mergePlans([plan('x', 1)], [plan('y', 3), plan('z', 2)]);
    expect(plans.map((p) => p.id)).toEqual(['y', 'z', 'x']);
    expect(plans.every((p) => p.synced)).toBe(true);
  });
});
