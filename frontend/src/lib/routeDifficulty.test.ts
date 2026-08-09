import { describe, expect, it } from 'vitest';

import {
  classifyDifficulty,
  difficultyRating,
  isDifficulty,
  normaliseDifficulty,
} from './routeDifficulty';

describe('classifyDifficulty', () => {
  it('calls a flat stroll easy', () => {
    // 5 km, 50 m of ascent — a riverside path.
    expect(classifyDifficulty(5, 50)).toBe('easy');
  });

  it('calls a long day with real ascent challenging', () => {
    // 15 km and 1,200 m — a summit day.
    expect(classifyDifficulty(15, 1200)).toBe('challenging');
  });

  it('places a rolling half-day in the middle', () => {
    expect(classifyDifficulty(8, 350)).toBe('moderate');
  });

  it('gets harder as ascent grows over the same distance', () => {
    const order = [100, 400, 1500].map((gain) => classifyDifficulty(10, gain));
    expect(order).toEqual(['easy', 'moderate', 'challenging']);
  });

  it('gets harder as distance grows over the same ascent', () => {
    expect(difficultyRating(4, 500)!).toBeLessThan(difficultyRating(20, 500)!);
  });

  it('does not invent a rating when elevation is unavailable', () => {
    // The Elevation API being down must not produce a difficulty label.
    expect(classifyDifficulty(12, null)).toBe('unknown');
    expect(classifyDifficulty(12, undefined)).toBe('unknown');
  });

  it('does not invent a rating without a distance', () => {
    expect(classifyDifficulty(null, 800)).toBe('unknown');
    expect(classifyDifficulty(0, 800)).toBe('unknown');
  });

  it.each([
    [NaN, 100],
    [10, NaN],
    [Infinity, 100],
    [10, -50],
  ])('rejects nonsense input (%o, %o)', (distance, gain) => {
    expect(classifyDifficulty(distance, gain)).toBe('unknown');
  });

  it('treats a completely flat route as easy rather than unknown', () => {
    expect(classifyDifficulty(6, 0)).toBe('easy');
  });

  it('no longer depends on popularity', () => {
    // The old rule read difficulty off the Google star rating, so two routes
    // with identical terrain could be labelled differently. Terrain alone now
    // decides, and identical terrain must classify identically.
    expect(classifyDifficulty(10, 600)).toBe(classifyDifficulty(10, 600));
  });
});

describe('normaliseDifficulty', () => {
  it('maps the retired "hard" value onto challenging', () => {
    // Cached payloads and saved places written before the rename still use it.
    expect(normaliseDifficulty('hard')).toBe('challenging');
  });

  it.each(['easy', 'moderate', 'challenging', 'unknown'])('passes %s through', (value) => {
    expect(normaliseDifficulty(value)).toBe(value);
  });

  it.each([null, undefined, '', 'spicy', 42])('falls back to unknown for %o', (value) => {
    expect(normaliseDifficulty(value)).toBe('unknown');
  });

  it('guards the type predicate against the retired value', () => {
    expect(isDifficulty('hard')).toBe(false);
    expect(isDifficulty('challenging')).toBe(true);
  });
});
