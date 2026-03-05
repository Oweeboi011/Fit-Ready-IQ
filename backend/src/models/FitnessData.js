'use strict';

/**
 * FitnessData model – lightweight in-memory store keyed by userId.
 * In production, replace with a database-backed ORM.
 */

const store = new Map();

/**
 * @typedef {Object} FitnessData
 * @property {number}  userId
 * @property {Array}   stravaActivities   - Recent Strava activities
 * @property {Object}  garminMetrics      - Garmin health metrics
 * @property {Object}  corosMetrics       - COROS metrics
 * @property {Date}    lastUpdated
 */

const FitnessData = {
  /**
   * Save or overwrite fitness data for a user.
   * @param {number} userId
   * @param {Partial<FitnessData>} data
   * @returns {FitnessData}
   */
  save(userId, data) {
    const existing = store.get(userId) || {};
    const record = {
      ...existing,
      ...data,
      userId,
      lastUpdated: new Date(),
    };
    store.set(userId, record);
    return { ...record };
  },

  /**
   * Retrieve fitness data for a user.
   * @param {number} userId
   * @returns {FitnessData|undefined}
   */
  findByUserId(userId) {
    const record = store.get(userId);
    return record ? { ...record } : undefined;
  },

  /**
   * Merge partial data into an existing record (creates one if absent).
   * @param {number} userId
   * @param {Partial<FitnessData>} partial
   * @returns {FitnessData}
   */
  merge(userId, partial) {
    const existing = store.get(userId) || { userId };
    const merged = {
      ...existing,
      ...partial,
      userId,
      lastUpdated: new Date(),
    };
    store.set(userId, merged);
    return { ...merged };
  },

  /** Clear all records (test helper). */
  _clear() {
    store.clear();
  },
};

module.exports = FitnessData;
