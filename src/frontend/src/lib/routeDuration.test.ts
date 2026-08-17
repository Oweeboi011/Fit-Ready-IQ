import { describe, expect, it } from 'vitest';

import { ASCENT_METRES_PER_HOUR, estimateAscentHours } from './routeDuration';

describe('estimateAscentHours', () => {
  it('returns null rather than a guess when ascent is unknown', () => {
    expect(estimateAscentHours(null)).toBeNull();
    expect(estimateAscentHours(undefined)).toBeNull();
  });

  it('returns null for a non-finite or non-positive ascent', () => {
    expect(estimateAscentHours(Number.NaN)).toBeNull();
    expect(estimateAscentHours(0)).toBeNull();
    expect(estimateAscentHours(-100)).toBeNull();
  });

  it('applies the standard 300 m per hour figure', () => {
    expect(ASCENT_METRES_PER_HOUR).toBe(300);
    expect(estimateAscentHours(900)).toEqual({ low: 3, high: 4 });
  });

  it('never estimates less than an hour for a small climb', () => {
    expect(estimateAscentHours(60)).toEqual({ low: 1, high: 1 });
  });

  it('gives an upper bound at or above the lower bound', () => {
    for (const gain of [50, 300, 640, 1180, 2400]) {
      const estimate = estimateAscentHours(gain);
      expect(estimate).not.toBeNull();
      expect(estimate!.high).toBeGreaterThanOrEqual(estimate!.low);
    }
  });

  it('scales with the climb', () => {
    const small = estimateAscentHours(600)!;
    const large = estimateAscentHours(1800)!;
    expect(large.low).toBeGreaterThan(small.low);
  });
});
