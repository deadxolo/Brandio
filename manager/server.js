const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { createProxyMiddleware } = require('http-proxy-middleware');
// Load environment variables from root .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const businessRoutes = require('./routes/businessRoutes');
const assetRoutes = require('./routes/assetRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const postRoutes = require('./routes/postRoutes');
const servicesConfig = require('../shared/config/services');
const { createAuthMiddleware, createRateLimiter } = require('../shared/middleware/auth');

// Internal service URLs (for Cloud Run - all services run in same container)
const BG_ENGINE_URL = `http://127.0.0.1:${servicesConfig.services.background_engine.port}`;
const POST_GEN_URL = `http://127.0.0.1:${servicesConfig.services.post_generator.port}`;
const AUTO_POSTER_URL = `http://127.0.0.1:${servicesConfig.services.auto_poster.port}`;

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
app.use('/api/', createRateLimiter({
  windowMs: 60000,
  maxRequests: 100
}));

// Authentication middleware
app.use('/api/', createAuthMiddleware({
  allowServiceToken: true
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Also serve uploads from post_generator (images are stored there)
app.use('/uploads', express.static(path.join(__dirname, '..', 'post_generator', 'uploads')));

// ============================================================
// PROXY ROUTES - For Cloud Run (single port access to all services)
// ============================================================

// Proxy error handler
const onProxyError = (err, req, res) => {
  console.error('Proxy error:', err.message);
  res.status(502).json({ error: 'Service temporarily unavailable', message: err.message });
};

// Proxy to Background Engine (port 3001)
app.use('/api/backgrounds', createProxyMiddleware({
  target: BG_ENGINE_URL,
  changeOrigin: true,
  on: { error: onProxyError }
}));

app.use('/backgrounds', createProxyMiddleware({
  target: BG_ENGINE_URL,
  changeOrigin: true,
  on: { error: onProxyError }
}));

// Proxy to Post Generator (port 3002)
app.use('/api/templates', createProxyMiddleware({
  target: POST_GEN_URL,
  changeOrigin: true,
  on: { error: onProxyError }
}));

app.use('/api/generate', createProxyMiddleware({
  target: POST_GEN_URL,
  changeOrigin: true,
  on: { error: onProxyError }
}));

app.use('/generator', createProxyMiddleware({
  target: POST_GEN_URL,
  changeOrigin: true,
  pathRewrite: { '^/generator': '' },
  on: { error: onProxyError }
}));

// Proxy to Auto Poster (port 3003)
app.use('/api/scheduler', createProxyMiddleware({
  target: AUTO_POSTER_URL,
  changeOrigin: true,
  on: { error: onProxyError }
}));

app.use('/api/publish', createProxyMiddleware({
  target: AUTO_POSTER_URL,
  changeOrigin: true,
  on: { error: onProxyError }
}));

app.use('/api/platforms', createProxyMiddleware({
  target: AUTO_POSTER_URL,
  changeOrigin: true,
  on: { error: onProxyError }
}));

app.use('/poster', createProxyMiddleware({
  target: AUTO_POSTER_URL,
  changeOrigin: true,
  pathRewrite: { '^/poster': '' },
  on: { error: onProxyError }
}));

// ============================================================

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/businesses', businessRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/posts', postRoutes);

// Health check endpoint for Cloud Run / Docker
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'manager',
    timestamp: new Date().toISOString()
  });
});

// Services configuration endpoint
app.get('/api/services', (req, res) => {
  res.json({
    success: true,
    services: servicesConfig.services,
    platforms: servicesConfig.platforms
  });
});

// Root API info
app.get('/api', (req, res) => {
  res.json({
    service: 'Manager',
    version: '1.0.0',
    description: 'Business management dashboard for social media',
    endpoints: {
      businesses: {
        list: 'GET /api/businesses',
        create: 'POST /api/businesses',
        get: 'GET /api/businesses/:id',
        update: 'PUT /api/businesses/:id',
        delete: 'DELETE /api/businesses/:id'
      },
      assets: {
        upload: 'POST /api/assets/upload',
        list: 'GET /api/assets/:businessId',
        delete: 'DELETE /api/assets/:id'
      },
      dashboard: {
        stats: 'GET /api/dashboard/stats/:businessId',
        overview: 'GET /api/dashboard/overview'
      }
    },
    linkedServices: servicesConfig.services
  });
});

// Redirect root to Post Generator home page (AI-powered landing)
app.get('/', (req, res) => {
  // Use proxy path for Cloud Run compatibility
  res.redirect('/generator/');
});

// Serve manager dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Public landing page
app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Human-readable API/tech specs page
app.get('/specs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'specs.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
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

// Start server
const PORT = servicesConfig.services.manager.port;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('  Manager Service Started');
  console.log('='.repeat(50));
  console.log(`  Home: http://${HOST}:${PORT} (redirects to AI Home)`);
  console.log(`  Dashboard: http://${HOST}:${PORT}/dashboard`);
  console.log(`  API: http://${HOST}:${PORT}/api`);
  console.log('='.repeat(50));
  console.log('');
});

module.exports = app;
