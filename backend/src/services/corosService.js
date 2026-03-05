'use strict';

const axios = require('axios');
const config = require('../config');

/**
 * COROS Open API service – OAuth 2.0 + wearable metrics.
 *
 * Real credentials must be set in environment variables:
 *   COROS_CLIENT_ID, COROS_CLIENT_SECRET, COROS_REDIRECT_URI
 *
 * When credentials are absent the service returns realistic mock data.
 * Documentation: https://coros.com/open-api
 */

const MOCK_COROS_METRICS = {
  trainingLoad: 285,
  acuteLoad: 265,
  chronicLoad: 290,
  recoveryStatus: 'Recovered',           // Recovered | Recovering | Fatigued
  recoveryScore: 74,                      // 0-100
  sleepQualityScore: 78,                  // 0-100
  hrv: 58,                                // milliseconds
  avgSleepDuration: 7.4,                  // hours
  dailyStressLevel: 32,                   // 0-100 (higher = more stress)
  lastUpdated: new Date().toISOString(),
};

/**
 * Build the COROS OAuth2 authorization URL.
 * @returns {string}
 */
function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: config.coros.clientId || 'mock_coros_client_id',
    redirect_uri: config.coros.redirectUri,
    response_type: 'code',
    scope: 'training_data health_data',
  });
  return `${config.coros.authUrl}?${params.toString()}`;
}

/**
 * Exchange an authorization code for COROS access + refresh tokens.
 * @param {string} code
 * @returns {Promise<Object>} Token response.
 */
async function exchangeToken(code) {
  if (!config.coros.clientId || !config.coros.clientSecret) {
    return {
      access_token: 'mock_coros_access_token',
      refresh_token: 'mock_coros_refresh_token',
      expires_in: 86400,
      userId: 'coros_user_001',
    };
  }

  // REAL IMPLEMENTATION: POST to config.coros.tokenUrl
  const response = await axios.post(config.coros.tokenUrl, {
    client_id: config.coros.clientId,
    client_secret: config.coros.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.coros.redirectUri,
  });
  return response.data;
}

/**
 * Refresh a COROS access token.
 * @param {string} refreshToken
 * @returns {Promise<Object>} New token data.
 */
async function refreshToken(refreshToken) {
  if (!config.coros.clientId || !config.coros.clientSecret) {
    return {
      access_token: 'mock_coros_access_token_refreshed',
      refresh_token: refreshToken,
      expires_in: 86400,
    };
  }

  const response = await axios.post(config.coros.tokenUrl, {
    client_id: config.coros.clientId,
    client_secret: config.coros.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return response.data;
}

/**
 * Fetch training load data from COROS.
 * @param {string} accessToken
 * @returns {Promise<Object>}
 */
async function getTrainingLoad(accessToken) {
  if (!accessToken || accessToken.startsWith('mock_')) {
    return {
      trainingLoad: MOCK_COROS_METRICS.trainingLoad,
      acuteLoad: MOCK_COROS_METRICS.acuteLoad,
      chronicLoad: MOCK_COROS_METRICS.chronicLoad,
    };
  }

  // REAL IMPLEMENTATION: GET /v2/athlete/training-load
  const response = await axios.get(`${config.coros.apiBase}/v2/athlete/training-load`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data;
}

/**
 * Fetch recovery status from COROS.
 * @param {string} accessToken
 * @returns {Promise<Object>}
 */
async function getRecoveryStatus(accessToken) {
  if (!accessToken || accessToken.startsWith('mock_')) {
    return {
      recoveryStatus: MOCK_COROS_METRICS.recoveryStatus,
      recoveryScore: MOCK_COROS_METRICS.recoveryScore,
    };
  }

  const response = await axios.get(`${config.coros.apiBase}/v2/athlete/recovery`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data;
}

/**
 * Fetch sleep quality data from COROS.
 * @param {string} accessToken
 * @returns {Promise<Object>}
 */
async function getSleepData(accessToken) {
  if (!accessToken || accessToken.startsWith('mock_')) {
    return {
      sleepQualityScore: MOCK_COROS_METRICS.sleepQualityScore,
      avgSleepDuration: MOCK_COROS_METRICS.avgSleepDuration,
    };
  }

  const response = await axios.get(`${config.coros.apiBase}/v2/athlete/sleep`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data;
}

/**
 * Fetch HRV (Heart Rate Variability) from COROS.
 * @param {string} accessToken
 * @returns {Promise<number>} HRV in milliseconds.
 */
async function getHrv(accessToken) {
  if (!accessToken || accessToken.startsWith('mock_')) {
    return MOCK_COROS_METRICS.hrv;
  }

  const response = await axios.get(`${config.coros.apiBase}/v2/athlete/hrv`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data.hrv;
}

/**
 * Fetch all relevant COROS metrics for use in the scoring service.
 * @param {string} accessToken
 * @returns {Promise<Object>} Aggregated COROS metrics.
 */
async function getMetrics(accessToken) {
  if (!accessToken || accessToken.startsWith('mock_')) {
    return { ...MOCK_COROS_METRICS };
  }

  const [trainingLoad, recoveryStatus, sleepData, hrv] = await Promise.all([
    getTrainingLoad(accessToken),
    getRecoveryStatus(accessToken),
    getSleepData(accessToken),
    getHrv(accessToken),
  ]);

  return {
    ...trainingLoad,
    ...recoveryStatus,
    ...sleepData,
    hrv,
    dailyStressLevel: MOCK_COROS_METRICS.dailyStressLevel, // supplemented
    lastUpdated: new Date().toISOString(),
  };
}

module.exports = {
  getAuthUrl,
  exchangeToken,
  refreshToken,
  getTrainingLoad,
  getRecoveryStatus,
  getSleepData,
  getHrv,
  getMetrics,
  MOCK_COROS_METRICS,
};
