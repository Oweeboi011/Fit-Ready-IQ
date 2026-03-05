'use strict';

const { Router } = require('express');
const { query, validationResult } = require('express-validator');
const { optionalAuthenticate } = require('../middleware/auth');
const gearService = require('../services/gearService');

const router = Router();
router.use(optionalAuthenticate);

const VALID_DIFFICULTIES = ['easy', 'moderate', 'hard', 'expert'];

/**
 * GET /api/gear
 * Query params:
 *   difficulty      – 'easy' | 'moderate' | 'hard' | 'expert'  (default: moderate)
 *   adverseWeather  – 'true' | 'false'
 *   snow            – 'true' | 'false'
 *   overnight       – 'true' | 'false'
 */
router.get(
  '/',
  [
    query('difficulty')
      .optional()
      .isIn(VALID_DIFFICULTIES)
      .withMessage(`difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}`),
    query('adverseWeather').optional().isBoolean(),
    query('snow').optional().isBoolean(),
    query('overnight').optional().isBoolean(),
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    next();
  },
  (req, res) => {
    const difficulty     = req.query.difficulty || 'moderate';
    const adverseWeather = req.query.adverseWeather === 'true';
    const snow           = req.query.snow === 'true';
    const overnight      = req.query.overnight === 'true';

    const gear = gearService.getGearRecommendations(difficulty, {
      adverseWeather,
      snow,
      overnight,
    });

    res.json(gear);
  },
);

/**
 * GET /api/gear/catalogue
 * Returns the complete gear catalogue for all difficulty tiers.
 */
router.get('/catalogue', (req, res) => {
  res.json(gearService.getFullCatalogue());
});

module.exports = router;
