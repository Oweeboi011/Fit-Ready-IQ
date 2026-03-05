'use strict';

const axios = require('axios');
const config = require('../config');

/**
 * Maps & trail service combining Google Maps Elevation API and Komoot.
 *
 * Google Maps API key: GOOGLE_MAPS_API_KEY
 * Komoot credentials: KOMOOT_CLIENT_ID, KOMOOT_CLIENT_SECRET
 *
 * Mock data is used when credentials are absent.
 */

/** @type {Object[]} Mock trail catalogue */
const MOCK_TRAILS = [
  {
    id: 'trail_001',
    name: 'Sunrise Valley Loop',
    source: 'komoot',
    difficulty: 'easy',
    difficultyScore: 15,
    distance: 5200,           // metres
    elevationGain: 120,       // metres
    elevationLoss: 120,
    terrainType: 'path',
    estimatedDuration: 5400,  // seconds
    location: { lat: 47.3769, lng: 8.5417, region: 'Swiss Plateau' },
    tags: ['family-friendly', 'scenic', 'loop'],
  },
  {
    id: 'trail_002',
    name: 'Forest Ridge Trail',
    source: 'komoot',
    difficulty: 'moderate',
    difficultyScore: 38,
    distance: 12400,
    elevationGain: 480,
    elevationLoss: 480,
    terrainType: 'trail',
    estimatedDuration: 14400,
    location: { lat: 46.8182, lng: 8.2275, region: 'Central Switzerland' },
    tags: ['forest', 'moderate-fitness', 'out-and-back'],
  },
  {
    id: 'trail_003',
    name: 'Alpine Pass Crossing',
    source: 'komoot',
    difficulty: 'hard',
    difficultyScore: 62,
    distance: 19800,
    elevationGain: 1150,
    elevationLoss: 850,
    terrainType: 'alpine',
    estimatedDuration: 28800,
    location: { lat: 46.5584, lng: 8.0196, region: 'Bernese Oberland' },
    tags: ['alpine', 'pass', 'technical'],
  },
  {
    id: 'trail_004',
    name: 'Summit Assault Route',
    source: 'komoot',
    difficulty: 'expert',
    difficultyScore: 85,
    distance: 14600,
    elevationGain: 1840,
    elevationLoss: 1840,
    terrainType: 'alpine',
    estimatedDuration: 36000,
    location: { lat: 45.9763, lng: 7.6586, region: 'Valais Alps' },
    tags: ['summit', 'exposed', 'glacier'],
  },
  {
    id: 'trail_005',
    name: 'Lakeside Promenade',
    source: 'komoot',
    difficulty: 'easy',
    difficultyScore: 8,
    distance: 7800,
    elevationGain: 45,
    elevationLoss: 45,
    terrainType: 'path',
    estimatedDuration: 7200,
    location: { lat: 47.0502, lng: 8.3093, region: 'Lake Lucerne' },
    tags: ['flat', 'lake', 'easy', 'accessible'],
  },
];

/**
 * Calculate a route difficulty score (0-100) from raw metrics.
 * Formula weights distance, elevation gain, and terrain type.
 *
 * @param {Object} params
 * @param {number} params.distance       - Route distance in metres.
 * @param {number} params.elevationGain  - Total ascent in metres.
 * @param {string} [params.terrainType]  - 'path' | 'trail' | 'alpine' | 'technical'
 * @returns {number} Difficulty score 0-100.
 */
function calculateDifficultyScore({ distance, elevationGain, terrainType = 'trail' }) {
  // Distance component: 20 km = ~40 pts, 5 km = ~10 pts
  const distanceKm = distance / 1000;
  const distancePts = Math.min(40, (distanceKm / 20) * 40);

  // Elevation component: 1000 m gain = ~40 pts
  const elevationPts = Math.min(40, (elevationGain / 1000) * 40);

  // Terrain multiplier
  const terrainBonus = { path: 0, trail: 5, alpine: 15, technical: 20 };
  const terrainPts = terrainBonus[terrainType] ?? 5;

  const raw = distancePts + elevationPts + terrainPts;
  return Math.min(100, Math.round(raw));
}

/**
 * Map a numeric difficulty score to a named difficulty level.
 * @param {number} score 0-100
 * @returns {'easy'|'moderate'|'hard'|'expert'}
 */
function scoreToDifficulty(score) {
  if (score < 25)  return 'easy';
  if (score < 50)  return 'moderate';
  if (score < 75)  return 'hard';
  return 'expert';
}

/**
 * Get elevation data for a path of coordinates using the Google Maps Elevation API.
 * @param {Array<{lat: number, lng: number}>} path - Array of coordinate objects.
 * @returns {Promise<Array<{elevation: number, location: Object, resolution: number}>>}
 */
async function getElevationProfile(path) {
  if (!config.google.mapsApiKey || !path || path.length === 0) {
    // Mock: generate a plausible elevation profile
    return path.map((loc, i) => ({
      elevation: 800 + Math.sin(i / 3) * 200,
      location: loc,
      resolution: 9.543951988220215,
    }));
  }

  // REAL IMPLEMENTATION: Google Maps Elevation API
  const locations = path.map(p => `${p.lat},${p.lng}`).join('|');
  const response = await axios.get(config.google.elevationApiBase, {
    params: { locations, key: config.google.mapsApiKey },
  });

  if (response.data.status !== 'OK') {
    throw new Error(`Google Elevation API error: ${response.data.status}`);
  }
  return response.data.results;
}

/**
 * Fetch trails from Komoot matching optional filter criteria.
 * @param {Object} [filters]
 * @param {string} [filters.difficulty]  - 'easy' | 'moderate' | 'hard' | 'expert'
 * @param {number} [filters.maxDistance] - Maximum distance in metres.
 * @param {string} [filters.region]      - Region name substring to filter by.
 * @returns {Promise<Array>} Matched trail objects.
 */
async function getTrails(filters = {}) {
  // REAL IMPLEMENTATION: GET https://api.komoot.de/v007/tours/?sport_types=hike&...
  // Requires Komoot OAuth and returns paginated tour objects.
  let trails = [...MOCK_TRAILS];

  if (filters.difficulty) {
    trails = trails.filter(t => t.difficulty === filters.difficulty);
  }
  if (filters.maxDistance) {
    trails = trails.filter(t => t.distance <= filters.maxDistance);
  }
  if (filters.region) {
    const q = filters.region.toLowerCase();
    trails = trails.filter(t => t.location.region.toLowerCase().includes(q));
  }

  return trails;
}

/**
 * Fetch a single trail by its ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getTrailById(id) {
  const trail = MOCK_TRAILS.find(t => t.id === id);
  return trail ? { ...trail } : null;
}

/**
 * Match trails suitable for a user's fitness readiness score.
 * Returns trails whose difficulty aligns with the user's capability.
 *
 * @param {number} fitnessScore   - User's readiness score (0-100).
 * @param {Object} [options]
 * @param {number} [options.tolerance=10] - Score tolerance band (±).
 * @returns {Promise<Array>} Matched trails, best-fit first.
 */
async function matchTrailsToFitness(fitnessScore, options = {}) {
  const tolerance = options.tolerance ?? 10;
  const allTrails = await getTrails();

  // Score thresholds map fitness score to difficulty ranges
  const suitableTrails = allTrails.filter(t => {
    const diff = t.difficultyScore;
    // User can comfortably handle trails up to their score + tolerance
    // but should not tackle trails far below (boring) or above (dangerous)
    return diff <= fitnessScore + tolerance && diff >= Math.max(0, fitnessScore - 30);
  });

  // Sort: closest match first
  suitableTrails.sort((a, b) =>
    Math.abs(a.difficultyScore - fitnessScore) - Math.abs(b.difficultyScore - fitnessScore)
  );

  return suitableTrails;
}

module.exports = {
  calculateDifficultyScore,
  scoreToDifficulty,
  getElevationProfile,
  getTrails,
  getTrailById,
  matchTrailsToFitness,
  MOCK_TRAILS,
};
