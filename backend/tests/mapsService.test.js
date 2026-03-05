'use strict';

const {
  calculateDifficultyScore,
  scoreToDifficulty,
  getElevationProfile,
  getTrails,
  getTrailById,
  matchTrailsToFitness,
  MOCK_TRAILS,
} = require('../src/services/mapsService');

// ─── calculateDifficultyScore ─────────────────────────────────────────────────
describe('calculateDifficultyScore', () => {
  test('flat, short path scores near 0', () => {
    const score = calculateDifficultyScore({ distance: 1000, elevationGain: 0, terrainType: 'path' });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(15);
  });

  test('long alpine route with high elevation scores high', () => {
    const score = calculateDifficultyScore({ distance: 20000, elevationGain: 1000, terrainType: 'alpine' });
    expect(score).toBeGreaterThan(70);
  });

  test('technical terrain adds bonus pts', () => {
    const withPath = calculateDifficultyScore({ distance: 10000, elevationGain: 500, terrainType: 'path' });
    const withTech = calculateDifficultyScore({ distance: 10000, elevationGain: 500, terrainType: 'technical' });
    expect(withTech).toBeGreaterThan(withPath);
  });

  test('output is always in [0, 100]', () => {
    const extreme = calculateDifficultyScore({ distance: 999999, elevationGain: 99999, terrainType: 'technical' });
    expect(extreme).toBeLessThanOrEqual(100);
    expect(extreme).toBeGreaterThanOrEqual(0);
  });

  test('unknown terrain type uses default', () => {
    const score = calculateDifficultyScore({ distance: 10000, elevationGain: 500, terrainType: 'unknown' });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── scoreToDifficulty ────────────────────────────────────────────────────────
describe('scoreToDifficulty', () => {
  test.each([
    [10,  'easy'],
    [24,  'easy'],
    [25,  'moderate'],
    [49,  'moderate'],
    [50,  'hard'],
    [74,  'hard'],
    [75,  'expert'],
    [100, 'expert'],
  ])('score %d → %s', (score, expected) => {
    expect(scoreToDifficulty(score)).toBe(expected);
  });
});

// ─── getElevationProfile ──────────────────────────────────────────────────────
describe('getElevationProfile', () => {
  test('returns mock profile matching input path length', async () => {
    const path = [
      { lat: 47.0, lng: 8.0 },
      { lat: 47.1, lng: 8.1 },
      { lat: 47.2, lng: 8.2 },
    ];
    const profile = await getElevationProfile(path);
    expect(profile).toHaveLength(3);
    profile.forEach(point => {
      expect(point).toHaveProperty('elevation');
      expect(point).toHaveProperty('location');
    });
  });

  test('returns empty array for empty path', async () => {
    const profile = await getElevationProfile([]);
    expect(profile).toEqual([]);
  });

  test('each elevation point has a numeric elevation value', async () => {
    const path = [{ lat: 46.0, lng: 7.5 }];
    const [point] = await getElevationProfile(path);
    expect(typeof point.elevation).toBe('number');
  });
});

// ─── getTrails ────────────────────────────────────────────────────────────────
describe('getTrails', () => {
  test('returns all mock trails with no filters', async () => {
    const trails = await getTrails();
    expect(trails.length).toBe(MOCK_TRAILS.length);
  });

  test('filters by difficulty', async () => {
    const trails = await getTrails({ difficulty: 'easy' });
    expect(trails.length).toBeGreaterThan(0);
    trails.forEach(t => expect(t.difficulty).toBe('easy'));
  });

  test('filters by maxDistance', async () => {
    const max    = 10000;
    const trails = await getTrails({ maxDistance: max });
    trails.forEach(t => expect(t.distance).toBeLessThanOrEqual(max));
  });

  test('filters by region (case-insensitive substring)', async () => {
    const trails = await getTrails({ region: 'alps' });
    expect(trails.length).toBeGreaterThan(0);
    trails.forEach(t => expect(t.location.region.toLowerCase()).toContain('alps'));
  });

  test('returns empty array if no trails match filters', async () => {
    const trails = await getTrails({ region: 'nonexistent_region_xyz' });
    expect(trails).toEqual([]);
  });
});

// ─── getTrailById ─────────────────────────────────────────────────────────────
describe('getTrailById', () => {
  test('returns correct trail for valid ID', async () => {
    const trail = await getTrailById('trail_001');
    expect(trail).not.toBeNull();
    expect(trail.id).toBe('trail_001');
  });

  test('returns null for unknown ID', async () => {
    const trail = await getTrailById('nonexistent_id');
    expect(trail).toBeNull();
  });
});

// ─── matchTrailsToFitness ─────────────────────────────────────────────────────
describe('matchTrailsToFitness', () => {
  test('low fitness score only matches easy trails', async () => {
    const matches = await matchTrailsToFitness(15);
    matches.forEach(t => {
      expect(t.difficultyScore).toBeLessThanOrEqual(15 + 10);
    });
  });

  test('high fitness score can match hard/expert trails', async () => {
    const matches = await matchTrailsToFitness(80);
    const hasHard = matches.some(t => t.difficulty === 'hard' || t.difficulty === 'expert');
    expect(hasHard).toBe(true);
  });

  test('results are sorted by proximity to fitness score', async () => {
    const score   = 40;
    const matches = await matchTrailsToFitness(score);
    if (matches.length > 1) {
      const diffs = matches.map(t => Math.abs(t.difficultyScore - score));
      for (let i = 1; i < diffs.length; i++) {
        expect(diffs[i]).toBeGreaterThanOrEqual(diffs[i - 1]);
      }
    }
  });

  test('custom tolerance is respected', async () => {
    const score   = 50;
    const matches = await matchTrailsToFitness(score, { tolerance: 5 });
    matches.forEach(t => {
      expect(t.difficultyScore).toBeLessThanOrEqual(score + 5);
    });
  });

  test('returns an array (can be empty)', async () => {
    const matches = await matchTrailsToFitness(50);
    expect(Array.isArray(matches)).toBe(true);
  });
});
