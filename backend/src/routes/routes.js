'use strict';

const { Router } = require('express');
const { query, body, param, validationResult } = require('express-validator');
const { optionalAuthenticate } = require('../middleware/auth');
const mapsService = require('../services/mapsService');
const gearService = require('../services/gearService');

const router = Router();
router.use(optionalAuthenticate);

const VALID_DIFFICULTIES = ['easy', 'moderate', 'hard', 'expert'];

/**
 * GET /api/routes
 * Query params: difficulty, maxDistance, region
 */
router.get(
  '/',
  [
    query('difficulty').optional().isIn(VALID_DIFFICULTIES),
    query('maxDistance').optional().isInt({ min: 0 }),
    query('region').optional().isString().trim(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const { difficulty, maxDistance, region } = req.query;
      const filters = {};
      if (difficulty)  filters.difficulty  = difficulty;
      if (maxDistance) filters.maxDistance = parseInt(maxDistance, 10);
      if (region)      filters.region      = region;

      const trails = await mapsService.getTrails(filters);
      res.json({ trails, count: trails.length });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/routes/:id
 */
router.get(
  '/:id',
  [param('id').isString().trim().notEmpty()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const trail = await mapsService.getTrailById(req.params.id);
      if (!trail) return res.status(404).json({ error: 'Route not found' });

      const gear = gearService.getGearForRoute(trail);
      res.json({ trail, gear });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/routes/match
 * Body: { fitnessScore: number, tolerance?: number }
 * Returns routes suitable for the provided fitness score.
 */
router.post(
  '/match',
  [
    body('fitnessScore').isFloat({ min: 0, max: 100 }).withMessage('fitnessScore must be 0-100'),
    body('tolerance').optional().isFloat({ min: 0, max: 50 }),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const { fitnessScore, tolerance } = req.body;
      const trails = await mapsService.matchTrailsToFitness(fitnessScore, { tolerance });

      const trailsWithGear = trails.map(trail => ({
        trail,
        gear: gearService.getGearForRoute(trail),
      }));

      res.json({ fitnessScore, matches: trailsWithGear, count: trailsWithGear.length });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
