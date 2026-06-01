// Cross-service business-ownership guard (defense in depth for Rule 1).
//
// Design note: this guard is LENIENT by intent so it can be added to the
// proxied services without breaking internal/service-to-service or dev-mode
// (token-less) calls:
//   - If there is no authenticated end-user (req.user) — e.g. a service-token
//     call or local dev without a token — it does nothing.
//   - If a business id cannot be resolved from the request, it does nothing
//     (id-level endpoints are protected at their own layer).
//   - If an authenticated user IS present and the resolved business is not
//     theirs, it returns 403.
//
// In production (auth required, every request carries a user token) this
// enforces object-level ownership; in dev it stays out of the way.

function defaultResolve(req) {
  return (
    (req.params && req.params.businessId) ||
    (req.body && req.body.business_id) ||
    (req.query && req.query.business_id) ||
    (req.query && req.query.businessId) ||
    null
  );
}

function requireBusinessOwnership(db, options = {}) {
  const resolve = options.resolve || defaultResolve;
  return (req, res, next) => {
    if (!req.user || !req.user.id) return next();      // no end-user context
    const businessId = resolve(req);
    if (!businessId) return next();                    // nothing to check here
    try {
      if (db.userOwnsBusiness(req.user.id, businessId)) return next();
    } catch (err) {
      return next(err);
    }
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You do not have access to this business'
    });
  };
}

// router.param handler for ':businessId' routes. A plain router.use() guard
// runs BEFORE route params are parsed, so req.params.businessId is not yet
// available there; this fires exactly when :businessId is matched.
//   router.param('businessId', requireBusinessOwnership.param(db));
requireBusinessOwnership.param = function paramGuard(db) {
  return (req, res, next, businessId) => {
    if (!req.user || !req.user.id) return next();
    if (!businessId) return next();
    try {
      if (db.userOwnsBusiness(req.user.id, businessId)) return next();
    } catch (err) {
      return next(err);
    }
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You do not have access to this business'
    });
  };
};

module.exports = requireBusinessOwnership;
module.exports.defaultResolve = defaultResolve;
