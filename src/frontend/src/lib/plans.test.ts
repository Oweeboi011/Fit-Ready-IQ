import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  annualSavingPercent,
  getPlan,
  hasEntitlement,
  isPlanId,
  PLANS,
  readSelectedPlan,
  rememberSelectedPlan,
  TRIAL_DAYS,
} from './plans';

describe('plans', () => {
  it('features exactly one plan, so the pricing table has one primary button', () => {
    expect(PLANS.filter((plan) => plan.featured)).toHaveLength(1);
  });

  it('keeps discovery free so the map is never behind the paywall', () => {
    expect(hasEntitlement('free', 'route_discovery')).toBe(true);
    expect(hasEntitlement('free', 'weather_forecast')).toBe(true);
  });

  it('gates the paid differentiators behind Pro', () => {
    for (const entitlement of ['readiness_score', 'ai_coach', 'strava_sync'] as const) {
      expect(hasEntitlement('free', entitlement)).toBe(false);
      expect(hasEntitlement('pro', entitlement)).toBe(true);
    }
  });

  it('never lets a higher tier lose a capability a lower tier had', () => {
    const free = getPlan('free');
    const pro = getPlan('pro');
    const guide = getPlan('guide');

    for (const entitlement of free.entitlements) {
      expect(pro.entitlements).toContain(entitlement);
    }
    for (const entitlement of pro.entitlements) {
      expect(guide.entitlements).toContain(entitlement);
    }
  });

  it('prices annual below monthly for every paid plan', () => {
    for (const plan of PLANS.filter((p) => p.monthlyPrice > 0)) {
      expect(plan.annualMonthlyPrice).toBeLessThan(plan.monthlyPrice);
      expect(annualSavingPercent(plan)).toBeGreaterThan(0);
    }
  });

  it('reports no annual saving on a free plan rather than dividing by zero', () => {
    expect(annualSavingPercent(getPlan('free'))).toBe(0);
  });

  it('throws on an unknown plan id instead of silently granting nothing', () => {
    // @ts-expect-error deliberately outside PlanId
    expect(() => getPlan('enterprise')).toThrow(/Unknown plan/);
  });

  it('offers a trial long enough to include two weekends', () => {
    expect(TRIAL_DAYS).toBeGreaterThanOrEqual(14);
  });
});

describe('selected plan', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips every real plan id', () => {
    for (const plan of PLANS) {
      rememberSelectedPlan(plan.id);
      expect(readSelectedPlan()).toBe(plan.id);
    }
  });

  it('returns null when nothing was ever chosen', () => {
    expect(readSelectedPlan()).toBeNull();
  });

  it('rejects a tampered value rather than handing back a bogus tier', () => {
    localStorage.setItem('fri_selected_plan', 'enterprise');
    expect(readSelectedPlan()).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => rememberSelectedPlan('pro')).not.toThrow();
    expect(readSelectedPlan()).toBeNull();
  });

  it.each([
    ['pro', true],
    ['free', true],
    ['guide', true],
    ['enterprise', false],
    ['', false],
    [null, false],
    [42, false],
  ])('isPlanId(%o) is %s', (value, expected) => {
    expect(isPlanId(value)).toBe(expected);
  });
});
