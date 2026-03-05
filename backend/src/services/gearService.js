'use strict';

/**
 * Gear Recommendation Service
 *
 * Recommends hiking/mountain gear based on route difficulty and optional
 * environmental conditions (weather, season, altitude).
 *
 * Difficulty tiers:
 *   easy     – well-marked paths, minimal elevation, no technical terrain
 *   moderate – maintained trails, moderate ascent, variable weather
 *   hard     – remote alpine terrain, significant elevation, exposure
 *   expert   – glacier, technical rock, requires specialist equipment
 */

/**
 * @typedef {Object} GearList
 * @property {string}   difficulty   - Tier name.
 * @property {string[]} essential    - Must-have items for all conditions.
 * @property {string[]} recommended  - Highly recommended items.
 * @property {string[]} optional     - Situational extras.
 * @property {string[]} weatherExtra - Additional items for adverse weather.
 */

/** Base gear catalogue indexed by difficulty tier */
const GEAR_CATALOGUE = {
  easy: {
    essential: [
      'Water (≥ 1.5 L)',
      'Trail snacks / energy bars',
      'Comfortable walking shoes or trainers',
      'Sunscreen (SPF 30+)',
      'Sunglasses',
    ],
    recommended: [
      'Light daypack (10-15 L)',
      'Trail map or phone with offline maps',
      'Lightweight rain jacket',
      'Charged mobile phone',
    ],
    optional: [
      'Trekking poles',
      'Camera',
      'Insect repellent',
    ],
    weatherExtra: [
      'Waterproof over-trousers',
      'Warm mid-layer',
    ],
  },

  moderate: {
    essential: [
      'Water (≥ 2 L) + water filter or purification tablets',
      'High-energy snacks + packed lunch',
      'Hiking boots (ankle support)',
      'Moisture-wicking base layer',
      'Fleece or insulating mid-layer',
      'Waterproof jacket',
      'Trekking poles',
      'Compact first aid kit',
      'Sunscreen (SPF 50+)',
      'Sunglasses + sun hat',
    ],
    recommended: [
      'Daypack (20-25 L)',
      'Offline trail map / GPS app',
      'Emergency whistle',
      'Headlamp + spare batteries',
      'Buff / neck gaiter',
      'Blister plasters',
    ],
    optional: [
      'Gaiters',
      'Lightweight camp towel',
      'Sit pad',
      'Trekking poles (if not in essential)',
    ],
    weatherExtra: [
      'Waterproof over-trousers',
      'Neoprene gloves',
      'Wool or fleece hat',
      'Extra thermal layer',
    ],
  },

  hard: {
    essential: [
      'Water (≥ 3 L) + water filter',
      'Full-day calorie supply (2000+ kcal)',
      'Waterproof hiking boots (stiff sole)',
      'Moisture-wicking base layer (long-sleeve)',
      'Insulating mid-layer (down or synthetic)',
      'Hardshell waterproof jacket + trousers',
      'Trekking poles',
      'Comprehensive first aid kit (including blister care, emergency foil blanket)',
      'GPS device or offline-capable GPS app',
      'Headlamp + extra batteries',
      'Emergency whistle + signal mirror',
      'Gaiters',
      'Warm hat + gloves',
      'Sunscreen (SPF 50+) + glacier glasses',
    ],
    recommended: [
      'Lightweight crampons (microspikes for icy sections)',
      'Emergency bivy bag',
      'Trekking rope (30 m lightweight)',
      'Multi-tool or knife',
      'Personal locator beacon (PLB) or satellite communicator',
      'Water purification tablets (backup)',
    ],
    optional: [
      'Lightweight tent or tarp',
      'Cooking system + fuel',
      'Bear canister (region-dependent)',
      'Trekking pack (35-50 L)',
    ],
    weatherExtra: [
      'Balaclava',
      'Expedition-weight gloves',
      'Heated insoles',
      'Windproof over-layer',
    ],
  },

  expert: {
    essential: [
      'Water (≥ 3 L) + advanced filtration',
      'High-calorie expedition food (3000+ kcal)',
      'Mountaineering boots (crampon-compatible)',
      'Technical crampons (12-point)',
      'Ice axe',
      'Climbing harness',
      'Helmet',
      'Dynamic climbing rope (50 m)',
      'Protection rack (nuts, cams)',
      'Glacier glasses + goggles',
      'Hardshell jacket + salopettes',
      'Expedition down jacket',
      'Full-coverage gloves + liners',
      'Balaclava + expedition hat',
      'Emergency bivy / tent',
      'Comprehensive mountaineering first aid kit',
      'Personal locator beacon (PLB)',
      'Satellite communicator',
      'GPS device + backup maps',
      'Avalanche transceiver, probe, shovel (snow terrain)',
    ],
    recommended: [
      'Crevasse rescue kit',
      'Wand markers (glacier navigation)',
      'Snow anchors',
      'High-altitude nutrition supplements',
      'Altitude sickness medication (consult physician)',
      'Emergency oxygen (extreme altitude)',
    ],
    optional: [
      'Ski poles (for descent)',
      'Lightweight tent rated for extreme weather',
      'Portaledge (big wall routes)',
    ],
    weatherExtra: [
      'Expedition-weight thermal underwear',
      'Hand and foot warmers',
      'Overmitts',
    ],
  },
};

/**
 * Get gear recommendations for a given route difficulty.
 *
 * @param {string} difficulty  - 'easy' | 'moderate' | 'hard' | 'expert'
 * @param {Object} [conditions]
 * @param {boolean} [conditions.adverseWeather=false] - Whether bad weather is expected.
 * @param {boolean} [conditions.snow=false]           - Snow or icy conditions.
 * @param {boolean} [conditions.overnight=false]      - Multi-day / overnight route.
 * @returns {GearList} Gear recommendation object.
 */
function getGearRecommendations(difficulty, conditions = {}) {
  const tier = GEAR_CATALOGUE[difficulty] || GEAR_CATALOGUE.moderate;

  const essential = [...tier.essential];
  const recommended = [...tier.recommended];
  const optional = [...tier.optional];

  if (conditions.adverseWeather) {
    essential.push(...tier.weatherExtra);
  }

  if (conditions.snow && difficulty !== 'expert') {
    recommended.push('Microspikes or lightweight crampons');
    recommended.push('Ice axe (if steep snow)');
    recommended.push('Avalanche awareness training');
  }

  if (conditions.overnight) {
    essential.push('Sleeping bag (rated for conditions)');
    essential.push('Sleeping mat');
    essential.push('Lightweight tent or bivy');
    essential.push('Camp cooking system + food');
    essential.push('Power bank for devices');
  }

  return {
    difficulty,
    essential,
    recommended,
    optional,
    conditions,
  };
}

/**
 * Determine recommended gear based on a route object from mapsService.
 *
 * @param {Object} route - Route/trail object with `difficulty` and optional metadata.
 * @param {Object} [conditions]
 * @returns {GearList}
 */
function getGearForRoute(route, conditions = {}) {
  const difficulty = route.difficulty || 'moderate';

  // Infer snow conditions from terrain type
  const snowConditions = {
    ...conditions,
    snow: conditions.snow || route.terrainType === 'alpine',
  };

  return getGearRecommendations(difficulty, snowConditions);
}

/**
 * Return the full gear catalogue for all difficulty tiers.
 * Useful for UI "what-if" scenarios.
 * @returns {Object} Full catalogue indexed by difficulty.
 */
function getFullCatalogue() {
  return { ...GEAR_CATALOGUE };
}

module.exports = {
  getGearRecommendations,
  getGearForRoute,
  getFullCatalogue,
  GEAR_CATALOGUE,
};
