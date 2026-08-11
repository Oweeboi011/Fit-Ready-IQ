import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deletePlan, loadPlans, MAX_PLANS, savePlan, SAVED_PLANS_KEY } from './savedPlans';
import type { SavedPlan } from './savedPlans';

function plan(id: string, savedAt: number, name = `Plan ${id}`): SavedPlan {
  return {
    id,
    name,
    savedAt,
    distanceKm: 12.3,
    waypoints: [
      { id: 'a', coordinates: [120.9, 16.5], name: 'Start' },
      { id: 'b', coordinates: [120.95, 16.55], name: 'End' },
    ],
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('savedPlans', () => {
  it('round-trips a plan', () => {
    savePlan(plan('p1', 1000));
    const [loaded] = loadPlans();
    expect(loaded.id).toBe('p1');
    expect(loaded.waypoints).toHaveLength(2);
  });

  it('lists newest first', () => {
    savePlan(plan('old', 1000));
    savePlan(plan('new', 5000));
    expect(loadPlans().map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('replaces a plan saved again under the same id', () => {
    savePlan(plan('p1', 1000, 'First name'));
    savePlan(plan('p1', 2000, 'Renamed'));

    const plans = loadPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].name).toBe('Renamed');
  });

  it('deletes by id and leaves the rest', () => {
    savePlan(plan('a', 1));
    savePlan(plan('b', 2));

    deletePlan('a');

    expect(loadPlans().map((p) => p.id)).toEqual(['b']);
  });

  it('returns an empty list when nothing was ever saved', () => {
    expect(loadPlans()).toEqual([]);
  });

  it('drops corrupt entries rather than crashing the list', () => {
    localStorage.setItem(
      SAVED_PLANS_KEY,
      JSON.stringify([
        plan('good', 1),
        { id: 'no-waypoints', name: 'x', savedAt: 2, waypoints: [] },
        { id: 'bad-coords', name: 'x', savedAt: 3, waypoints: [{ coordinates: ['a', 'b'] }] },
        null,
        'nonsense',
      ])
    );

    expect(loadPlans().map((p) => p.id)).toEqual(['good']);
  });

  it('survives unparseable storage', () => {
    localStorage.setItem(SAVED_PLANS_KEY, '{not json');
    expect(loadPlans()).toEqual([]);
  });

  it(`keeps at most ${MAX_PLANS} plans, discarding the oldest`, () => {
    for (let i = 0; i < MAX_PLANS + 10; i++) savePlan(plan(`p${i}`, i));

    const plans = loadPlans();
    expect(plans).toHaveLength(MAX_PLANS);
    // The most recent survive; the earliest are gone.
    expect(plans[0].id).toBe(`p${MAX_PLANS + 9}`);
    expect(plans.some((p) => p.id === 'p0')).toBe(false);
  });

  it('does not throw when storage refuses writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => savePlan(plan('p1', 1))).not.toThrow();
  });
});
