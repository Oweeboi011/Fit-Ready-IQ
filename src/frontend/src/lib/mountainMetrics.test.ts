import { describe, expect, it } from 'vitest';

import { mountainGain, summitOf } from './mountainMetrics';

describe('summitOf', () => {
  it('prefers the summit elevation, then the peak elevation', () => {
    expect(summitOf({ elevation_m: 784, summit_elevation: 790 })).toBe(790);
    expect(summitOf({ elevation_m: 784 })).toBe(784);
  });

  it('is null when neither was measured', () => {
    expect(summitOf({ elevation_m: null })).toBeNull();
  });
});

describe('mountainGain', () => {
  it('is summit minus jump-off when both are known', () => {
    expect(mountainGain({ elevation_m: 2500, jumpoff_elevation: 2200 })).toBe(300);
  });

  it('is null — not the whole altitude — when the start is unknown', () => {
    // The regression: `summit - (jumpoff ?? 0)` made a 2,500 m peak a
    // 2,500 m climb whatever the trailhead.
    expect(mountainGain({ elevation_m: 2500 })).toBeNull();
    expect(mountainGain({ elevation_m: 2500, jumpoff_elevation: null })).toBeNull();
  });

  it('is null when the summit is unknown', () => {
    expect(mountainGain({ elevation_m: null, jumpoff_elevation: 400 })).toBeNull();
  });

  it('is null when the data says the start is above the top', () => {
    expect(mountainGain({ elevation_m: 500, jumpoff_elevation: 800 })).toBeNull();
  });
});
