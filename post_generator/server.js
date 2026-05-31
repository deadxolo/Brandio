const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
// Load environment variables from root .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const templateRoutes = require('./routes/templateRoutes');
const postRoutes = require('./routes/postRoutes');
const renderRoutes = require('./routes/renderRoutes');
const assetRoutes = require('./routes/assetRoutes');
const servicesConfig = require('../shared/config/services');
const { createAuthMiddleware, createRateLimiter } = require('../shared/middleware/auth');

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
app.use('/exports', express.static(path.join(__dirname, 'uploads/exports')));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/templates', templateRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/render', renderRoutes);
app.use('/api/assets', assetRoutes);

// Platform sizes endpoint
app.get('/api/platforms', (req, res) => {
  res.json({
    success: true,
    platforms: servicesConfig.platforms
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'post_generator',
    timestamp: new Date().toISOString()
  });
});

// Root API info
app.get('/api', (req, res) => {
  res.json({
    service: 'Post Generator',
    version: '1.0.0',
    description: 'Social media post template editor and generator',
    endpoints: {
      templates: {
        list: 'GET /api/templates/:businessId',
        create: 'POST /api/templates',
        get: 'GET /api/templates/item/:id',
        update: 'PUT /api/templates/:id',
        delete: 'DELETE /api/templates/:id',
        duplicate: 'POST /api/templates/:id/duplicate'
      },
      posts: {
        list: 'GET /api/posts/:businessId',
        create: 'POST /api/posts',
        get: 'GET /api/posts/item/:id',
        update: 'PUT /api/posts/:id',
        delete: 'DELETE /api/posts/:id'
      },
      render: {
        preview: 'POST /api/render/preview',
        export: 'POST /api/render/export',
        thumbnail: 'POST /api/render/thumbnail'
      }
    },
    platforms: servicesConfig.platforms
  });
});

// Serve home page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Serve home page (alternate route)
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Serve template editor
app.get('/editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve templates list page
app.get('/templates', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates.html'));
});

// Serve post generator page
app.get('/generate', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'generate.html'));
});

// Serve settings page
app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// Legacy routes for backward compatibility
app.get('/templates.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates.html'));
});

app.get('/generate.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'generate.html'));
});

app.get('/home.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
const PORT = servicesConfig.services.post_generator.port;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('  Post Generator Service Started');
  console.log('='.repeat(50));
  console.log(`  Home: http://${HOST}:${PORT}`);
  console.log(`  Editor: http://${HOST}:${PORT}/editor`);
  console.log(`  Templates: http://${HOST}:${PORT}/templates`);
  console.log(`  Generate: http://${HOST}:${PORT}/generate`);
  console.log(`  Settings: http://${HOST}:${PORT}/settings`);
  console.log(`  API: http://${HOST}:${PORT}/api`);
  console.log('='.repeat(50));
  console.log('');
});

module.exports = app;
