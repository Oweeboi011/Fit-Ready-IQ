'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const { optionalAuthenticate } = require('../middleware/auth');
const scoringService = require('../services/scoringService');
const stravaService  = require('../services/stravaService');
const garminService  = require('../services/garminService');
const corosService   = require('../services/corosService');

const router = Router();
router.use(optionalAuthenticate);

/**
 * GET /api/score
 * Calculate readiness score from mock (or stored) fitness data.
 */
router.get('/', async (req, res, next) => {
  try {
    const [stravaActivities, garminMetrics, corosMetrics] = await Promise.all([
      stravaService.getRecentActivities('mock_strava_token'),
      garminService.getMetrics('mock_garmin_token'),
      corosService.getMetrics('mock_coros_token'),
    ]);

    const stravaSummary = stravaService.summariseActivities(stravaActivities);
    const metrics = scoringService.buildMetricsFromProviders(
      stravaSummary,
      garminMetrics,
      corosMetrics,
    );

    const result = scoringService.calculateScore(metrics);
    res.json({ ...result, metrics, calculatedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/score/calculate
 * Body: fitness metrics object (any subset of the metrics schema).
 * Allows the client to provide custom metrics for score calculation.
 */
router.post(
  '/calculate',
  [
    body('vo2Max').optional().isFloat({ min: 0, max: 100 }),
    body('hrv').optional().isFloat({ min: 0 }),
    body('sleepQualityScore').optional().isFloat({ min: 0, max: 100 }),
    body('restingHeartRate').optional().isFloat({ min: 20, max: 250 }),
    body('recoveryScore').optional().isFloat({ min: 0, max: 100 }),
    body('weeklyDistanceKm').optional().isFloat({ min: 0 }),
    body('weeklyElevation').optional().isFloat({ min: 0 }),
    body('trainingLoad').optional().isFloat({ min: 0 }),
    body('hikeCount').optional().isInt({ min: 0 }),
    body('strengthCount').optional().isInt({ min: 0 }),
    body('totalElevation').optional().isFloat({ min: 0 }),
    body('activityCount30d').optional().isInt({ min: 0 }),
    body('activeDays30d').optional().isInt({ min: 0, max: 30 }),
    body('recentCardioCount').optional().isInt({ min: 0 }),
    body('avgHeartRate').optional().isFloat({ min: 0 }),
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    next();
  },
  (req, res) => {
    const metrics = req.body;
    const result  = scoringService.calculateScore(metrics);
    res.json({ ...result, metrics, calculatedAt: new Date().toISOString() });
  },
);

module.exports = router;
