'use strict';

const { Router } = require('express');
const { optionalAuthenticate } = require('../middleware/auth');
const stravaService  = require('../services/stravaService');
const garminService  = require('../services/garminService');
const corosService   = require('../services/corosService');
const FitnessData    = require('../models/FitnessData');

const router = Router();

// All fitness routes attempt JWT auth but fall back to mock data
router.use(optionalAuthenticate);

/**
 * GET /api/fitness/strava
 * Returns recent Strava activities (mock if no token).
 */
router.get('/strava', async (req, res, next) => {
  try {
    const token = req.user
      ? (FitnessData.findByUserId(req.user.userId) || {}).stravaToken || 'mock_'
      : 'mock_strava_token';

    const activities = await stravaService.getRecentActivities(token);
    const summary    = stravaService.summariseActivities(activities);

    res.json({ activities, summary });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/fitness/garmin
 * Returns Garmin health metrics (mock if no token).
 */
router.get('/garmin', async (req, res, next) => {
  try {
    const token = req.user
      ? (FitnessData.findByUserId(req.user.userId) || {}).garminToken || 'mock_'
      : 'mock_garmin_token';

    const metrics = await garminService.getMetrics(token);
    res.json({ metrics });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/fitness/coros
 * Returns COROS wearable metrics (mock if no token).
 */
router.get('/coros', async (req, res, next) => {
  try {
    const token = req.user
      ? (FitnessData.findByUserId(req.user.userId) || {}).corosToken || 'mock_'
      : 'mock_coros_token';

    const metrics = await corosService.getMetrics(token);
    res.json({ metrics });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/fitness/summary
 * Returns an aggregated view of all three providers.
 */
router.get('/summary', async (req, res, next) => {
  try {
    const [stravaActivities, garminMetrics, corosMetrics] = await Promise.all([
      stravaService.getRecentActivities('mock_strava_token'),
      garminService.getMetrics('mock_garmin_token'),
      corosService.getMetrics('mock_coros_token'),
    ]);

    const stravaSummary = stravaService.summariseActivities(stravaActivities);

    res.json({
      strava:  { summary: stravaSummary, activities: stravaActivities },
      garmin:  garminMetrics,
      coros:   corosMetrics,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
