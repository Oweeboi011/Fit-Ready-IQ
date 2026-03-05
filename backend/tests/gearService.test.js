'use strict';

const {
  getGearRecommendations,
  getGearForRoute,
  getFullCatalogue,
  GEAR_CATALOGUE,
} = require('../src/services/gearService');

// ─── Catalogue structure ──────────────────────────────────────────────────────
describe('GEAR_CATALOGUE', () => {
  const TIERS = ['easy', 'moderate', 'hard', 'expert'];

  test('all four difficulty tiers are present', () => {
    TIERS.forEach(tier => expect(GEAR_CATALOGUE).toHaveProperty(tier));
  });

  test.each(TIERS)('%s tier has required keys', tier => {
    expect(GEAR_CATALOGUE[tier]).toHaveProperty('essential');
    expect(GEAR_CATALOGUE[tier]).toHaveProperty('recommended');
    expect(GEAR_CATALOGUE[tier]).toHaveProperty('optional');
    expect(GEAR_CATALOGUE[tier]).toHaveProperty('weatherExtra');
  });

  test('expert tier has more essential items than easy', () => {
    expect(GEAR_CATALOGUE.expert.essential.length).toBeGreaterThan(
      GEAR_CATALOGUE.easy.essential.length,
    );
  });
});

// ─── getGearRecommendations ───────────────────────────────────────────────────
describe('getGearRecommendations', () => {
  test('returns object with difficulty, essential, recommended, optional, conditions', () => {
    const gear = getGearRecommendations('moderate');
    expect(gear).toHaveProperty('difficulty', 'moderate');
    expect(gear).toHaveProperty('essential');
    expect(gear).toHaveProperty('recommended');
    expect(gear).toHaveProperty('optional');
    expect(gear).toHaveProperty('conditions');
    expect(Array.isArray(gear.essential)).toBe(true);
  });

  test('adverse weather adds extra items to essential list', () => {
    const normal  = getGearRecommendations('moderate', { adverseWeather: false });
    const adverse = getGearRecommendations('moderate', { adverseWeather: true });
    expect(adverse.essential.length).toBeGreaterThan(normal.essential.length);
  });

  test('overnight adds sleeping/camp gear to essential', () => {
    const gear = getGearRecommendations('hard', { overnight: true });
    const hasSleepingBag = gear.essential.some(item => /sleeping bag/i.test(item));
    expect(hasSleepingBag).toBe(true);
  });

  test('snow conditions add crampons to recommended (non-expert)', () => {
    const gear = getGearRecommendations('moderate', { snow: true });
    const hasSpikes = gear.recommended.some(item => /microspikes|crampons/i.test(item));
    expect(hasSpikes).toBe(true);
  });

  test('unknown difficulty falls back to moderate', () => {
    const gear = getGearRecommendations('unknown_difficulty');
    expect(gear.difficulty).toBe('unknown_difficulty');
    expect(Array.isArray(gear.essential)).toBe(true);
  });

  test('easy routes include water and sunscreen', () => {
    const gear = getGearRecommendations('easy');
    const hasWater     = gear.essential.some(i => /water/i.test(i));
    const hasSunscreen = gear.essential.some(i => /sunscreen/i.test(i));
    expect(hasWater).toBe(true);
    expect(hasSunscreen).toBe(true);
  });

  test('expert routes include climbing harness and ice axe', () => {
    const gear = getGearRecommendations('expert');
    const hasHarness = gear.essential.some(i => /harness/i.test(i));
    const hasIceAxe  = gear.essential.some(i => /ice axe/i.test(i));
    expect(hasHarness).toBe(true);
    expect(hasIceAxe).toBe(true);
  });

  test('conditions object is reflected in the response', () => {
    const conditions = { adverseWeather: true, snow: false, overnight: true };
    const gear = getGearRecommendations('hard', conditions);
    expect(gear.conditions).toEqual(conditions);
  });
});

// ─── getGearForRoute ──────────────────────────────────────────────────────────
describe('getGearForRoute', () => {
  test('uses route difficulty to select gear tier', () => {
    const trail = { id: 't1', difficulty: 'hard', terrainType: 'alpine' };
    const gear  = getGearForRoute(trail);
    expect(gear.difficulty).toBe('hard');
  });

  test('alpine terrain type sets snow=true automatically', () => {
    const trail = { difficulty: 'hard', terrainType: 'alpine' };
    const gear  = getGearForRoute(trail);
    expect(gear.conditions.snow).toBe(true);
  });

  test('non-alpine terrain does not force snow condition', () => {
    const trail = { difficulty: 'moderate', terrainType: 'trail' };
    const gear  = getGearForRoute(trail, { snow: false });
    expect(gear.conditions.snow).toBe(false);
  });

  test('explicit snow=true overrides terrain type check', () => {
    const trail = { difficulty: 'moderate', terrainType: 'trail' };
    const gear  = getGearForRoute(trail, { snow: true });
    expect(gear.conditions.snow).toBe(true);
  });

  test('missing difficulty defaults to moderate', () => {
    const gear = getGearForRoute({});
    expect(gear.difficulty).toBe('moderate');
  });
});

// ─── getFullCatalogue ─────────────────────────────────────────────────────────
describe('getFullCatalogue', () => {
  test('returns all four tiers', () => {
    const catalogue = getFullCatalogue();
    expect(Object.keys(catalogue)).toEqual(expect.arrayContaining(['easy', 'moderate', 'hard', 'expert']));
  });

  test('returns a copy, not the original reference', () => {
    const a = getFullCatalogue();
    const b = getFullCatalogue();
    expect(a).not.toBe(b);
  });
});
