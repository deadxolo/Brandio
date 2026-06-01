const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
// Load environment variables from root .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const scheduleRoutes = require('./routes/scheduleRoutes');
const socialRoutes = require('./routes/socialRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const oauthRoutes = require('./routes/oauthRoutes');
const publishRoutes = require('./routes/publishRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const schedulerService = require('./services/schedulerService');
const publishingService = require('./services/publishingService');
const db = require('../shared/db/database');
const servicesConfig = require('../shared/config/services');
const { createAuthMiddleware, createRateLimiter } = require('../shared/middleware/auth');
const { corsOptions } = require('../shared/config/corsOptions');
const { validateEnv } = require('../shared/config/validateEnv');
const { initObservability, logError } = require('../shared/observability');

validateEnv();
initObservability('auto_poster');

// Register platform services with publishing service
try {
  const metaService = require('./services/platforms/metaService');
  publishingService.registerPlatformService('meta', metaService);
} catch (e) {
  console.warn('[Server] Meta service not available:', e.message);
}

try {
  const twitterService = require('./services/platforms/twitterService');
  publishingService.registerPlatformService('twitter', twitterService);
} catch (e) {
  console.log('[Server] Twitter service not loaded (optional)');
}

try {
  const linkedinService = require('./services/platforms/linkedinService');
  publishingService.registerPlatformService('linkedin', linkedinService);
} catch (e) {
  console.log('[Server] LinkedIn service not loaded (optional)');
}

const app = express();

// Middleware
app.use(cors(corsOptions()));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
app.use('/api/', createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 100 // 100 requests per minute per IP
}));

// Authentication middleware
// In production, this will require valid API key or JWT
// In development, it allows unauthenticated requests with a warning
app.use('/api/', createAuthMiddleware({
  additionalPublicPaths: [
    '/api/oauth/meta/authorize',
    '/api/oauth/meta/callback',
    '/api/oauth/twitter/authorize',
    '/api/oauth/twitter/callback',
    '/api/oauth/linkedin/authorize',
    '/api/oauth/linkedin/callback',
    '/api/oauth/platforms'
  ],
  allowServiceToken: true
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
// Shared front-end assets (service-config.js, etc.)
app.use('/shared', express.static(path.join(__dirname, '..', 'shared', 'public')));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/schedule', scheduleRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/publish', publishRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'auto_poster',
    timestamp: new Date().toISOString()
  });
});

// Root API info
app.get('/api', (req, res) => {
  res.json({
    service: 'Auto Poster',
    version: '2.0.0',
    description: 'Social media scheduling and auto-posting service with direct publishing',
    endpoints: {
      schedule: {
        list: 'GET /api/schedule/:businessId',
        create: 'POST /api/schedule',
        get: 'GET /api/schedule/item/:id',
        update: 'PUT /api/schedule/:id',
        delete: 'DELETE /api/schedule/:id',
        cancel: 'POST /api/schedule/:id/cancel',
        reschedule: 'POST /api/schedule/:id/reschedule'
      },
      social: {
        accounts: 'GET /api/social/accounts/:businessId',
        platforms: 'GET /api/social/platforms',
        connect: 'POST /api/social/connect',
        disconnect: 'DELETE /api/social/accounts/:id'
      },
      oauth: {
        platforms: 'GET /api/oauth/platforms',
        metaAuthorize: 'GET /api/oauth/meta/authorize',
        metaCallback: 'GET /api/oauth/meta/callback',
        twitterAuthorize: 'GET /api/oauth/twitter/authorize',
        linkedinAuthorize: 'GET /api/oauth/linkedin/authorize',
        status: 'GET /api/oauth/:platform/status',
        revoke: 'DELETE /api/oauth/:platform/revoke'
      },
      publish: {
        now: 'POST /api/publish/now',
        schedule: 'POST /api/publish/schedule',
        status: 'GET /api/publish/status/:postId',
        statusStream: 'GET /api/publish/status/:postId/stream (SSE)',
        logs: 'GET /api/publish/logs/:postId',
        validate: 'POST /api/publish/validate',
        limits: 'GET /api/publish/limits/:platform',
        cancel: 'POST /api/publish/cancel/:jobId',
        retry: 'POST /api/publish/retry/:jobId'
      },
      calendar: {
        month: 'GET /api/calendar/:businessId/:year/:month',
        week: 'GET /api/calendar/:businessId/week',
        day: 'GET /api/calendar/:businessId/day/:date'
      }
    },
    scheduler: {
      status: 'Running',
      checkInterval: '1 minute'
    }
  });
});

// Helper function to escape HTML and prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  return String(text).replace(/[&<>"'`=\/]/g, s => map[s]);
}

// Allowed platforms for validation
const ALLOWED_PLATFORMS = ['meta', 'facebook', 'instagram', 'twitter', 'linkedin', 'whatsapp'];

// OAuth success page
app.get('/oauth-success', (req, res) => {
  const rawPlatform = req.query.platform;
  const rawName = req.query.name;

  // Validate platform against whitelist
  const platform = ALLOWED_PLATFORMS.includes(rawPlatform) ? rawPlatform : '';
  // Escape name to prevent XSS
  const name = escapeHtml(rawName);
  const displayPlatform = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Account';

  // Get the origin for postMessage (same origin for security)
  const origin = `${req.protocol}://${req.get('host')}`;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Connected Successfully</title>
      <style>
        body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0d1117; color: #e6edf3; }
        .container { text-align: center; padding: 40px; }
        .icon { font-size: 64px; color: #3fb950; margin-bottom: 20px; }
        h1 { margin-bottom: 10px; }
        p { color: #8b949e; margin-bottom: 30px; }
        .btn { background: #58a6ff; color: #0d1117; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; }
        .btn:hover { background: #79b8ff; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">&#10004;</div>
        <h1>${displayPlatform} Connected</h1>
        <p>${name ? `Connected as ${name}` : 'Your account has been connected successfully.'}</p>
        <a href="javascript:window.close()" class="btn">Close Window</a>
      </div>
      <script>
        // Notify parent window if opened in popup - use specific origin for security
        if (window.opener) {
          const data = { type: 'oauth-success', platform: ${JSON.stringify(platform)}, name: ${JSON.stringify(rawName || '')} };
          // Only send to same origin or parent origin
          try {
            window.opener.postMessage(data, window.opener.location.origin);
          } catch (e) {
            // Fallback to current origin if cross-origin
            window.opener.postMessage(data, '${origin}');
          }
        }
      </script>
    </body>
    </html>
  `);
});

// OAuth error page
app.get('/oauth-error', (req, res) => {
  const rawError = req.query.error;
  // Escape error message to prevent XSS
  const error = escapeHtml(rawError) || 'An unknown error occurred';

  // Get the origin for postMessage (same origin for security)
  const origin = `${req.protocol}://${req.get('host')}`;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Connection Failed</title>
      <style>
        body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0d1117; color: #e6edf3; }
        .container { text-align: center; padding: 40px; max-width: 500px; }
        .icon { font-size: 64px; color: #f85149; margin-bottom: 20px; }
        h1 { margin-bottom: 10px; }
        p { color: #8b949e; margin-bottom: 30px; }
        .error { background: rgba(248,81,73,0.1); padding: 16px; border-radius: 6px; color: #f85149; margin-bottom: 30px; word-break: break-word; }
        .btn { background: #58a6ff; color: #0d1117; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">&#10006;</div>
        <h1>Connection Failed</h1>
        <div class="error">${error}</div>
        <a href="javascript:window.close()" class="btn">Close Window</a>
      </div>
      <script>
        // Notify parent window if opened in popup - use specific origin for security
        if (window.opener) {
          const data = { type: 'oauth-error', error: ${JSON.stringify(rawError || 'An unknown error occurred')} };
          try {
            window.opener.postMessage(data, window.opener.location.origin);
          } catch (e) {
            window.opener.postMessage(data, '${origin}');
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Serve main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  logError(err, { service: 'auto_poster', method: req.method, path: req.originalUrl });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path
  });
});

// Start scheduler cron job - check every minute for posts to publish
cron.schedule('* * * * *', async () => {
  try {
    const pendingCount = db.getPendingJobs(100).length;
    if (pendingCount > 0) {
      console.log(`[Scheduler] Found ${pendingCount} pending jobs, processing...`);
    }
    await schedulerService.processScheduledPosts();
  } catch (error) {
    console.error('[Scheduler] Error processing posts:', error);
  }
});

// Also run scheduler check immediately on startup
setTimeout(async () => {
  console.log('[Scheduler] Running initial check for pending posts...');
  try {
    await schedulerService.processScheduledPosts();
  } catch (error) {
    console.error('[Scheduler] Initial check error:', error);
  }
}, 2000);

// Start server
const PORT = servicesConfig.services.auto_poster.port;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('  Auto Poster Service Started');
  console.log('='.repeat(50));
  console.log(`  URL: http://${HOST}:${PORT}`);
  console.log(`  API: http://${HOST}:${PORT}/api`);
  console.log('  Scheduler: Running (checks every minute)');
  console.log('='.repeat(50));
  console.log('');
});

module.exports = app;
