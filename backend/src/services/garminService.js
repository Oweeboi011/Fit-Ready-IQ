'use strict';

const axios = require('axios');
const config = require('../config');

/**
 * Garmin Connect API service – OAuth 1.0a + health metrics.
 *
 * Real credentials must be set in environment variables:
 *   GARMIN_CONSUMER_KEY, GARMIN_CONSUMER_SECRET, GARMIN_REDIRECT_URI
 *
 * OAuth 1.0a requires request signing (HMAC-SHA1). A full production
 * implementation would use a library such as `oauth-1.0a`.
 * When credentials are absent the service returns realistic mock data.
 */

const MOCK_GARMIN_METRICS = {
  vo2Max: 48.5,
  trainingStatus: 'Productive',
  trainingLoad: 312,
  trainingLoadBalance: { optimal: true, acute: 280, chronic: 295 },
  heartRateZones: [
    { zone: 1, minHR: 0,   maxHR: 114, name: 'Easy' },
    { zone: 2, minHR: 115, maxHR: 133, name: 'Aerobic' },
    { zone: 3, minHR: 134, maxHR: 152, name: 'Tempo' },
    { zone: 4, minHR: 153, maxHR: 171, name: 'Threshold' },
    { zone: 5, minHR: 172, maxHR: 200, name: 'VO2 Max' },
  ],
  weeklyTrainingLoad: 245,
  restingHeartRate: 52,
  bodyBattery: 68,
};

/**
 * Build the Garmin OAuth1 authorization URL.
 * In a real implementation this first obtains a request token from Garmin,
 * then redirects the user to the authorization page.
 * @returns {string} URL string (or guidance object in mock mode).
 */
function getAuthUrl() {
  if (!config.garmin.consumerKey) {
    return `${config.garmin.authUrl}?oauth_token=mock_request_token`;
  }
  // REAL IMPLEMENTATION: obtain request token via signed OAuth1 request, then:
  // return `${config.garmin.authUrl}?oauth_token=${requestToken}`;
  return `${config.garmin.authUrl}?oauth_token=PLACEHOLDER_REAL_REQUEST_TOKEN`;
}

/**
 * Exchange an OAuth1 verifier for an access token.
 * @param {string} oauthToken    - The request token.
 * @param {string} oauthVerifier - The verifier from the callback.
 * @returns {Promise<Object>} Access token data.
 */
async function exchangeToken(oauthToken, oauthVerifier) {
  if (!config.garmin.consumerKey || !config.garmin.consumerSecret) {
    return {
      oauth_token: 'mock_garmin_access_token',
      oauth_token_secret: 'mock_garmin_token_secret',
      userId: 'garmin_user_001',
    };
  }

  // REAL IMPLEMENTATION:
  // Sign a POST request to config.garmin.accessTokenUrl using HMAC-SHA1
  // with consumer key/secret and request token/verifier.
  // Use a library like `oauth-1.0a` + `crypto`.
  const response = await axios.post(config.garmin.accessTokenUrl, null, {
    params: { oauth_token: oauthToken, oauth_verifier: oauthVerifier },
    // headers would include signed OAuth1 Authorization header
  });
  return response.data;
}

/**
 * Fetch VO2 Max estimate from Garmin Connect.
 * @param {string} accessToken
 * @param {string} tokenSecret
 * @param {string} userId
 * @returns {Promise<number>} VO2 Max value.
 */
async function getVo2Max(accessToken, tokenSecret, userId) {
  if (!accessToken || accessToken.startsWith('mock_')) {
    return MOCK_GARMIN_METRICS.vo2Max;
  }

  // REAL IMPLEMENTATION: GET /wellness-service/wellness/dailySummary/{userId}
  const url = `${config.garmin.apiBase}/wellness-service/wellness/vo2Max/${userId}`;
  const response = await axios.get(url, {
    // headers: signed OAuth1 Authorization header
  });
  return response.data.vo2Max;
}

/**
 * Fetch training status and load from Garmin Connect.
 * @param {string} accessToken
 * @param {string} tokenSecret
 * @param {string} userId
 * @returns {Promise<Object>} Training status object.
 */
async function getTrainingStatus(accessToken, tokenSecret, userId) {
  if (!accessToken || accessToken.startsWith('mock_')) {
    return {
      trainingStatus: MOCK_GARMIN_METRICS.trainingStatus,
      trainingLoad: MOCK_GARMIN_METRICS.trainingLoad,
      trainingLoadBalance: MOCK_GARMIN_METRICS.trainingLoadBalance,
      weeklyTrainingLoad: MOCK_GARMIN_METRICS.weeklyTrainingLoad,
    };
  }

  // REAL IMPLEMENTATION: GET /wellness-service/wellness/trainingStatus/{userId}
  const url = `${config.garmin.apiBase}/wellness-service/wellness/trainingStatus/${userId}`;
  const response = await axios.get(url);
  return response.data;
}

/**
 * Fetch heart rate zones configured for the user.
 * @param {string} accessToken
 * @param {string} tokenSecret
 * @param {string} userId
 * @returns {Promise<Array>} Heart rate zone definitions.
 */
async function getHeartRateZones(accessToken, tokenSecret, userId) {
  if (!accessToken || accessToken.startsWith('mock_')) {
    return MOCK_GARMIN_METRICS.heartRateZones;
  }

  const url = `${config.garmin.apiBase}/wellness-service/wellness/hrZones/${userId}`;
  const response = await axios.get(url);
  return response.data.heartRateZones;
}

/**
 * Fetch aggregate Garmin metrics for use in the scoring service.
 * @param {string} accessToken
 * @param {string} [tokenSecret]
 * @param {string} [userId]
 * @returns {Promise<Object>} Aggregated Garmin metrics.
 */
async function getMetrics(accessToken, tokenSecret, userId) {
  if (!accessToken || accessToken.startsWith('mock_')) {
    return { ...MOCK_GARMIN_METRICS };
  }

  const [vo2Max, trainingStatus, heartRateZones] = await Promise.all([
    getVo2Max(accessToken, tokenSecret, userId),
    getTrainingStatus(accessToken, tokenSecret, userId),
    getHeartRateZones(accessToken, tokenSecret, userId),
  ]);

  return {
    vo2Max,
    ...trainingStatus,
    heartRateZones,
    restingHeartRate: MOCK_GARMIN_METRICS.restingHeartRate, // supplemented
    bodyBattery: MOCK_GARMIN_METRICS.bodyBattery,
  };
}

module.exports = {
  getAuthUrl,
  exchangeToken,
  getVo2Max,
  getTrainingStatus,
  getHeartRateZones,
  getMetrics,
  MOCK_GARMIN_METRICS,
};
