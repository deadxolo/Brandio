// Lightweight, dependency-free observability.
//
// - Structured JSON error logging (greppable / alertable by log tooling).
// - Optional Sentry: only activates if SENTRY_DSN is set AND @sentry/node is
//   installed (lazy-required). No new dependency is forced on the project.
// - An Express error handler that logs + returns a clean 500.

let sentry = null;

function initObservability(serviceName) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    sentry = require('@sentry/node');
    sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      serverName: serviceName
    });
    console.log(`[observability] Sentry enabled for ${serviceName}`);
  } catch (e) {
    console.warn('[observability] SENTRY_DSN is set but @sentry/node is not installed — skipping Sentry.');
    sentry = null;
  }
}

function logError(err, context = {}) {
  const entry = {
    level: 'error',
    ts: new Date().toISOString(),
    message: (err && err.message) || String(err),
    ...context
  };
  if (err && err.stack) {
    entry.stack = err.stack.split('\n').slice(0, 4).join(' | ');
  }
  console.error(JSON.stringify(entry));
  if (sentry) {
    try { sentry.captureException(err, { extra: context }); } catch (e) { /* ignore */ }
  }
}

// Express error-handling middleware (use as the LAST app.use).
function errorHandler(serviceName) {
  return (err, req, res, next) => {
    logError(err, {
      service: serviceName,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip
    });
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({
      success: false,
      error: 'Internal server error',
      message: err.message
    });
  };
}

module.exports = { initObservability, logError, errorHandler };
