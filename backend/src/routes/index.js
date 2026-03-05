'use strict';

const { Router } = require('express');
const authRoutes    = require('./auth');
const fitnessRoutes = require('./fitness');
const scoreRoutes   = require('./score');
const routeRoutes   = require('./routes');
const gearRoutes    = require('./gear');

const router = Router();

/**
 * GET /api/health
 * Simple health-check endpoint.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FitReady IQ API',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

router.use('/auth',    authRoutes);
router.use('/fitness', fitnessRoutes);
router.use('/score',   scoreRoutes);
router.use('/routes',  routeRoutes);
router.use('/gear',    gearRoutes);

module.exports = router;
