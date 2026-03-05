'use strict';

/**
 * Global error-handling middleware.
 * Must be registered AFTER all routes in app.js.
 */

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV === 'development';

  const body = {
    error: err.message || 'Internal Server Error',
    ...(isDev && { stack: err.stack }),
  };

  if (status >= 500) {
    console.error('[errorHandler]', err);
  }

  res.status(status).json(body);
}

/**
 * 404 catch-all – register before errorHandler but after all routes.
 */
function notFound(req, res, next) {
  const err = new Error(`Not Found – ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
}

module.exports = { errorHandler, notFound };
