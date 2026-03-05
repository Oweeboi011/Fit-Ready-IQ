'use strict';

require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  strava: {
    clientId: process.env.STRAVA_CLIENT_ID || '',
    clientSecret: process.env.STRAVA_CLIENT_SECRET || '',
    redirectUri: process.env.STRAVA_REDIRECT_URI || 'http://localhost:3000/api/auth/strava/callback',
    authUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    apiBase: 'https://www.strava.com/api/v3',
    scope: 'read,activity:read_all',
  },

  garmin: {
    consumerKey: process.env.GARMIN_CONSUMER_KEY || '',
    consumerSecret: process.env.GARMIN_CONSUMER_SECRET || '',
    redirectUri: process.env.GARMIN_REDIRECT_URI || 'http://localhost:3000/api/auth/garmin/callback',
    requestTokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
    authUrl: 'https://connect.garmin.com/oauthConfirm',
    accessTokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/access_token',
    apiBase: 'https://connect.garmin.com/modern/proxy',
  },

  coros: {
    clientId: process.env.COROS_CLIENT_ID || '',
    clientSecret: process.env.COROS_CLIENT_SECRET || '',
    redirectUri: process.env.COROS_REDIRECT_URI || 'http://localhost:3000/api/auth/coros/callback',
    authUrl: 'https://open.coros.com/oauth2/authorize',
    tokenUrl: 'https://open.coros.com/oauth2/accesstoken',
    apiBase: 'https://openapi.coros.com',
  },

  google: {
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    elevationApiBase: 'https://maps.googleapis.com/maps/api/elevation/json',
  },

  komoot: {
    clientId: process.env.KOMOOT_CLIENT_ID || '',
    clientSecret: process.env.KOMOOT_CLIENT_SECRET || '',
    apiBase: 'https://api.komoot.de/v007',
  },
};

module.exports = config;
