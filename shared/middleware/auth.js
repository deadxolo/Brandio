// Authentication Middleware
// Provides API key and JWT-based authentication for all services

const crypto = require('crypto');

// Configuration
const AUTH_CONFIG = {
  // API Key header name
  apiKeyHeader: 'x-api-key',
  // JWT header (Bearer token)
  authHeader: 'authorization',
  // Skip auth for these paths (health checks, public endpoints)
  publicPaths: [
    '/api',
    '/api/docs',
    '/health',
    '/api/health'
  ],
  // Skip auth for these methods on root
  publicMethods: ['GET']
};

/**
 * Validate API key against stored keys
 */
function validateApiKey(apiKey) {
  const validKeys = (process.env.API_KEYS || '').split(',').filter(Boolean);

  if (validKeys.length === 0) {
    // No API keys configured - check if in development mode
    if (process.env.NODE_ENV !== 'production') {
      return { valid: true, reason: 'development-mode' };
    }
    return { valid: false, reason: 'no-keys-configured' };
  }

  // Timing-safe comparison to prevent timing attacks
  for (const key of validKeys) {
    if (key.length === apiKey.length) {
      const keyBuffer = Buffer.from(key);
      const apiKeyBuffer = Buffer.from(apiKey);
      if (crypto.timingSafeEqual(keyBuffer, apiKeyBuffer)) {
        return { valid: true };
      }
    }
  }

  return { valid: false, reason: 'invalid-key' };
}

/**
 * Simple JWT validation (for internal service-to-service communication)
 * For production, use a proper JWT library like jsonwebtoken
 */
function validateJwt(token) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV !== 'production') {
      return { valid: true, reason: 'development-mode', user: { id: 'dev-user' } };
    }
    return { valid: false, reason: 'jwt-not-configured' };
  }

  try {
    // Basic JWT structure validation
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, reason: 'invalid-token-format' };
    }

    // Decode payload (for production, properly verify signature)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return { valid: false, reason: 'token-expired' };
    }

    return { valid: true, user: payload };
  } catch (error) {
    return { valid: false, reason: 'token-parse-error' };
  }
}

/**
 * Check if path is public (no auth required)
 */
function isPublicPath(path, method) {
  // Exact match for public paths
  if (AUTH_CONFIG.publicPaths.includes(path)) {
    return true;
  }

  // Static files and frontend routes don't need API auth
  if (!path.startsWith('/api/')) {
    return true;
  }

  return false;
}

/**
 * Authentication middleware factory
 * @param {Object} options - Configuration options
 * @param {boolean} options.required - If true, reject unauthenticated requests (default: true in production)
 * @param {string[]} options.additionalPublicPaths - Additional paths to skip auth
 * @param {boolean} options.allowServiceToken - Allow internal service tokens
 */
function createAuthMiddleware(options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const required = options.required !== undefined ? options.required : isProduction;
  const additionalPublicPaths = options.additionalPublicPaths || [];

  return (req, res, next) => {
    // Check if path is public
    if (isPublicPath(req.path, req.method) || additionalPublicPaths.includes(req.path)) {
      return next();
    }

    // Try API key authentication
    const apiKey = req.headers[AUTH_CONFIG.apiKeyHeader];
    if (apiKey) {
      const result = validateApiKey(apiKey);
      if (result.valid) {
        req.auth = { type: 'api-key', ...result };
        return next();
      }
    }

    // Try JWT authentication
    const authHeader = req.headers[AUTH_CONFIG.authHeader];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const result = validateJwt(token);
      if (result.valid) {
        req.auth = { type: 'jwt', ...result };
        req.user = result.user;
        return next();
      }
    }

    // Try internal service token (for service-to-service communication)
    const serviceToken = req.headers['x-service-token'];
    if (serviceToken && options.allowServiceToken !== false) {
      const validServiceToken = process.env.INTERNAL_SERVICE_TOKEN;
      if (validServiceToken && serviceToken === validServiceToken) {
        req.auth = { type: 'service', service: req.headers['x-service-name'] || 'unknown' };
        return next();
      }
    }

    // No valid authentication found
    if (required) {
      console.warn(`[Auth] Unauthorized request to ${req.method} ${req.path} from ${req.ip}`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Valid authentication required. Provide API key in x-api-key header or Bearer token in Authorization header.'
      });
    }

    // Not required - allow through but mark as unauthenticated
    req.auth = { type: 'none', authenticated: false };
    next();
  };
}

/**
 * Middleware to require specific authentication type
 */
function requireAuth(type = 'any') {
  return (req, res, next) => {
    if (!req.auth || req.auth.type === 'none') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (type !== 'any' && req.auth.type !== type) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `${type} authentication required`
      });
    }

    next();
  };
}

/**
 * Rate limiting middleware (basic implementation)
 * For production, use express-rate-limit or similar
 */
const rateLimitStore = new Map();

function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60000; // 1 minute
  const maxRequests = options.maxRequests || 100;
  const keyGenerator = options.keyGenerator || ((req) => req.ip);

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
      if (now - data.windowStart > windowMs) {
        rateLimitStore.delete(key);
      }
    }
  }, windowMs);

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let data = rateLimitStore.get(key);

    if (!data || now - data.windowStart > windowMs) {
      data = { windowStart: now, count: 0 };
    }

    data.count++;
    rateLimitStore.set(key, data);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - data.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil((data.windowStart + windowMs) / 1000));

    if (data.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((data.windowStart + windowMs - now) / 1000)} seconds.`
      });
    }

    next();
  };
}

/**
 * Generate a secure API key
 */
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate internal service token
 */
function generateServiceToken() {
  return crypto.randomBytes(48).toString('base64url');
}

module.exports = {
  createAuthMiddleware,
  requireAuth,
  createRateLimiter,
  validateApiKey,
  validateJwt,
  generateApiKey,
  generateServiceToken,
  AUTH_CONFIG
};
