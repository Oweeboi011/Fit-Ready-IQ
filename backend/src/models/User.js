'use strict';

/**
 * User model – lightweight in-memory store.
 * In production, replace with a database-backed ORM (e.g. Mongoose, Sequelize).
 */

const users = new Map();
let nextId = 1;

/**
 * @typedef {Object} User
 * @property {number}  id
 * @property {string}  email
 * @property {string}  [name]
 * @property {Object}  tokens        - Per-provider OAuth tokens
 * @property {string}  [tokens.strava]
 * @property {string}  [tokens.garmin]
 * @property {string}  [tokens.coros]
 * @property {Date}    createdAt
 * @property {Date}    updatedAt
 */

const User = {
  /**
   * Create a new user record.
   * @param {Partial<User>} data
   * @returns {User}
   */
  create(data) {
    const now = new Date();
    const user = {
      id: nextId++,
      email: data.email || '',
      name: data.name || '',
      tokens: data.tokens || {},
      createdAt: now,
      updatedAt: now,
    };
    users.set(user.id, user);
    return { ...user };
  },

  /**
   * Find a user by ID.
   * @param {number} id
   * @returns {User|undefined}
   */
  findById(id) {
    const user = users.get(id);
    return user ? { ...user } : undefined;
  },

  /**
   * Find a user by email.
   * @param {string} email
   * @returns {User|undefined}
   */
  findByEmail(email) {
    for (const user of users.values()) {
      if (user.email === email) return { ...user };
    }
    return undefined;
  },

  /**
   * Update an existing user.
   * @param {number} id
   * @param {Partial<User>} updates
   * @returns {User|undefined}
   */
  update(id, updates) {
    const user = users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates, id, updatedAt: new Date() };
    users.set(id, updated);
    return { ...updated };
  },

  /**
   * Upsert a user by email (create if not found).
   * @param {string} email
   * @param {Partial<User>} data
   * @returns {User}
   */
  upsertByEmail(email, data) {
    const existing = User.findByEmail(email);
    if (existing) {
      return User.update(existing.id, data);
    }
    return User.create({ email, ...data });
  },

  /** Return total stored user count (useful for tests). */
  count() {
    return users.size;
  },

  /** Clear all records (test helper). */
  _clear() {
    users.clear();
    nextId = 1;
  },
};

module.exports = User;
