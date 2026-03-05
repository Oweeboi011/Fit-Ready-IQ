'use strict';

const { Router } = require('express');
const { signToken } = require('../middleware/auth');
const stravaService = require('../services/stravaService');
const garminService = require('../services/garminService');
const corosService  = require('../services/corosService');
const User          = require('../models/User');

const router = Router();

// ─── Strava ──────────────────────────────────────────────────────────────────

/**
 * GET /api/auth/strava/url
 * Returns the Strava OAuth2 authorization URL.
 */
router.get('/strava/url', (req, res) => {
  const url = stravaService.getAuthUrl();
  res.json({ url });
});

/**
 * POST /api/auth/strava/callback
 * Body: { code: string }
 * Exchanges the authorization code for tokens, upserts the user, returns a JWT.
 */
router.post('/strava/callback', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });

    const tokenData = await stravaService.exchangeToken(code);

    const athlete = tokenData.athlete || {};
    const email   = athlete.email || `strava_${athlete.id || 'unknown'}@fitreadyiq.local`;

    const user = User.upsertByEmail(email, {
      name:   `${athlete.firstname || ''} ${athlete.lastname || ''}`.trim(),
      tokens: { strava: tokenData.access_token },
    });

    const jwt = signToken({ userId: user.id, email: user.email });
    res.json({ token: jwt, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    next(err);
  }
});

// ─── Garmin ──────────────────────────────────────────────────────────────────

/**
 * GET /api/auth/garmin/url
 */
router.get('/garmin/url', (req, res) => {
  const url = garminService.getAuthUrl();
  res.json({ url });
});

/**
 * POST /api/auth/garmin/callback
 * Body: { oauth_token: string, oauth_verifier: string }
 */
router.post('/garmin/callback', async (req, res, next) => {
  try {
    const { oauth_token, oauth_verifier } = req.body;
    if (!oauth_token || !oauth_verifier) {
      return res.status(400).json({ error: 'Missing oauth_token or oauth_verifier' });
    }

    const tokenData = await garminService.exchangeToken(oauth_token, oauth_verifier);

    const userId  = tokenData.userId || `garmin_${Date.now()}`;
    const email   = `garmin_${userId}@fitreadyiq.local`;

    const user = User.upsertByEmail(email, {
      tokens: {
        garmin:       tokenData.oauth_token,
        garminSecret: tokenData.oauth_token_secret,
      },
    });

    const jwt = signToken({ userId: user.id, email: user.email });
    res.json({ token: jwt, user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

// ─── COROS ───────────────────────────────────────────────────────────────────

/**
 * GET /api/auth/coros/url
 */
router.get('/coros/url', (req, res) => {
  const url = corosService.getAuthUrl();
  res.json({ url });
});

/**
 * POST /api/auth/coros/callback
 * Body: { code: string }
 */
router.post('/coros/callback', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });

    const tokenData = await corosService.exchangeToken(code);

    const userId = tokenData.userId || `coros_${Date.now()}`;
    const email  = `coros_${userId}@fitreadyiq.local`;

    const user = User.upsertByEmail(email, {
      tokens: { coros: tokenData.access_token },
    });

    const jwt = signToken({ userId: user.id, email: user.email });
    res.json({ token: jwt, user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
