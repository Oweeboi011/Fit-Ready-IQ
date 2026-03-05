'use strict';

const axios = require('axios');
const config = require('../config');

/**
 * Strava API service – OAuth 2.0 + activity data.
 *
 * Real credentials must be set in environment variables:
 *   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI
 *
 * When credentials are absent the service returns realistic mock data
 * so that the rest of the application can function without a live Strava account.
 */

const MOCK_ACTIVITIES = [
  {
    id: 1001,
    name: 'Morning Run',
    type: 'Run',
    distance: 8500,
    moving_time: 2700,
    elapsed_time: 2820,
    total_elevation_gain: 85,
    average_heartrate: 152,
    max_heartrate: 174,
    suffer_score: 42,
    start_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 1002,
    name: 'Trail Hike',
    type: 'Hike',
    distance: 14200,
    moving_time: 10800,
    elapsed_time: 11400,
    total_elevation_gain: 620,
    average_heartrate: 128,
    max_heartrate: 158,
    suffer_score: 55,
    start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 1003,
    name: 'Evening Ride',
    type: 'Ride',
    distance: 32000,
    moving_time: 5400,
    elapsed_time: 5600,
    total_elevation_gain: 210,
    average_heartrate: 145,
    max_heartrate: 168,
    suffer_score: 38,
    start_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 1004,
    name: 'Long Run',
    type: 'Run',
    distance: 21000,
    moving_time: 7200,
    elapsed_time: 7500,
    total_elevation_gain: 150,
    average_heartrate: 155,
    max_heartrate: 178,
    suffer_score: 78,
    start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 1005,
    name: 'Mountain Hike',
    type: 'Hike',
    distance: 18000,
    moving_time: 21600,
    elapsed_time: 22800,
    total_elevation_gain: 1240,
    average_heartrate: 138,
    max_heartrate: 162,
    suffer_score: 92,
    start_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

/**
 * Build the Strava OAuth2 authorization URL.
 * @returns {string} URL to redirect the user to.
 */
function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: config.strava.clientId,
    redirect_uri: config.strava.redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: config.strava.scope,
  });
  return `${config.strava.authUrl}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * @param {string} code - The authorization code from the OAuth callback.
 * @returns {Promise<Object>} Token response from Strava.
 */
async function exchangeToken(code) {
  // REAL IMPLEMENTATION:
  // POST to https://www.strava.com/oauth/token with client_id, client_secret, code, grant_type
  if (!config.strava.clientId || !config.strava.clientSecret) {
    return {
      access_token: 'mock_strava_access_token',
      refresh_token: 'mock_strava_refresh_token',
      expires_at: Math.floor(Date.now() / 1000) + 21600,
      athlete: { id: 12345, firstname: 'Mock', lastname: 'Athlete' },
    };
  }

  const response = await axios.post(config.strava.tokenUrl, {
    client_id: config.strava.clientId,
    client_secret: config.strava.clientSecret,
    code,
    grant_type: 'authorization_code',
  });
  return response.data;
}

/**
 * Refresh an expired Strava access token.
 * @param {string} refreshToken
 * @returns {Promise<Object>} New token data.
 */
async function refreshToken(refreshToken) {
  if (!config.strava.clientId || !config.strava.clientSecret) {
    return {
      access_token: 'mock_strava_access_token_refreshed',
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + 21600,
    };
  }

  const response = await axios.post(config.strava.tokenUrl, {
    client_id: config.strava.clientId,
    client_secret: config.strava.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return response.data;
}

/**
 * Fetch recent activities from Strava (last 30 days).
 * @param {string} accessToken - Valid Strava access token.
 * @param {number} [perPage=20] - Max number of activities to fetch.
 * @returns {Promise<Array>} Array of activity objects.
 */
async function getRecentActivities(accessToken, perPage = 20) {
  if (!accessToken || accessToken.startsWith('mock_')) {
    return MOCK_ACTIVITIES;
  }

  // REAL IMPLEMENTATION: GET /athlete/activities
  const after = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const response = await axios.get(`${config.strava.apiBase}/athlete/activities`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { after, per_page: perPage },
  });
  return response.data;
}

/**
 * Summarise a list of Strava activities into fitness-relevant metrics.
 * @param {Array} activities
 * @returns {Object} Summarised metrics.
 */
function summariseActivities(activities) {
  if (!activities || activities.length === 0) {
    return {
      totalActivities: 0,
      totalDistance: 0,
      totalElevation: 0,
      avgHeartRate: 0,
      maxHeartRate: 0,
      totalSufferScore: 0,
      totalMovingTime: 0,
      activityTypes: {},
    };
  }

  let totalDistance = 0;
  let totalElevation = 0;
  let hrSum = 0;
  let hrCount = 0;
  let maxHR = 0;
  let totalSufferScore = 0;
  let totalMovingTime = 0;
  const activityTypes = {};

  for (const act of activities) {
    totalDistance += act.distance || 0;
    totalElevation += act.total_elevation_gain || 0;
    totalMovingTime += act.moving_time || 0;
    totalSufferScore += act.suffer_score || 0;

    if (act.average_heartrate) {
      hrSum += act.average_heartrate;
      hrCount++;
    }
    if (act.max_heartrate && act.max_heartrate > maxHR) {
      maxHR = act.max_heartrate;
    }

    const type = act.type || 'Unknown';
    activityTypes[type] = (activityTypes[type] || 0) + 1;
  }

  return {
    totalActivities: activities.length,
    totalDistance: Math.round(totalDistance),
    totalElevation: Math.round(totalElevation),
    avgHeartRate: hrCount > 0 ? Math.round(hrSum / hrCount) : 0,
    maxHeartRate: maxHR,
    totalSufferScore,
    totalMovingTime,
    activityTypes,
  };
}

module.exports = {
  getAuthUrl,
  exchangeToken,
  refreshToken,
  getRecentActivities,
  summariseActivities,
  MOCK_ACTIVITIES,
};
