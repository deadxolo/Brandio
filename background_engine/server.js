const express = require('express');
const cors = require('cors');
const path = require('path');
// Load environment variables from root .env file first, then local
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config(); // Also load local .env for backward compatibility

const config = require('./config/config');
const backgroundRoutes = require('./routes/backgroundRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const storageService = require('./services/storageService');
const geminiService = require('./services/geminiService');
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
  additionalPublicPaths: [
    '/api/integration/health'
  ],
  allowServiceToken: true
}));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve background images
app.use('/backgrounds', express.static(config.storage.backgroundsPath));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/backgrounds', backgroundRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api/settings', settingsRoutes);

// Health check (for monitoring, specs page, container orchestration)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'background_engine',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'Background Engine',
    version: '1.0.0',
    description: 'AI-powered background generator for social media posts',
    endpoints: {
      backgrounds: {
        generate: 'POST /api/backgrounds/generate',
        search: 'GET /api/backgrounds/search?q=query',
        list: 'GET /api/backgrounds/list',
        getById: 'GET /api/backgrounds/:id',
        getImage: 'GET /api/backgrounds/image/:filename',
        byOccasion: 'GET /api/backgrounds/occasion/:occasion',
        delete: 'DELETE /api/backgrounds/:id',
        suggestions: 'GET /api/backgrounds/suggest/autocomplete?q=query',
        analyze: 'POST /api/backgrounds/analyze',
        improvePrompt: 'POST /api/backgrounds/improve-prompt',
        categories: 'GET /api/backgrounds/meta/categories',
        occasions: 'GET /api/backgrounds/meta/occasions'
      },
      integration: {
        getBackground: 'POST /api/integration/get-background',
        batchBackgrounds: 'POST /api/integration/batch-backgrounds',
        festivalsToday: 'GET /api/integration/festivals-today',
        forPost: 'POST /api/integration/for-post',
        stats: 'GET /api/integration/stats',
        health: 'GET /api/integration/health'
      }
    },
    documentation: 'See /api/docs for detailed documentation'
  });
});

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Background Engine API Documentation',
    version: '1.0.0',
    endpoints: [
      {
        path: 'POST /api/backgrounds/generate',
        description: 'Generate a new background using Gemini AI',
        body: {
          prompt: 'string (required) - Description of background to generate',
          category: 'string (optional) - Category: festival, business, nature, etc.',
          style: 'string (optional) - Style: vibrant, minimal, gradient, festive, etc.',
          width: 'number (optional) - Width in pixels (default: 1080)',
          height: 'number (optional) - Height in pixels (default: 1080)',
          forceNew: 'boolean (optional) - Force new generation even if matches exist',
          occasion: 'string (optional) - Festival/occasion name'
        },
        response: {
          success: 'boolean',
          type: '"existing" | "generated"',
          background: 'Background object or array of suggestions'
        }
      },
      {
        path: 'GET /api/backgrounds/search',
        description: 'Search for existing backgrounds',
        query: {
          q: 'string (required) - Search query',
          category: 'string (optional) - Filter by category',
          occasion: 'string (optional) - Filter by occasion',
          limit: 'number (optional) - Max results (default: 10)'
        }
      },
      {
        path: 'POST /api/integration/get-background',
        description: 'Smart endpoint for other services - returns existing or generates new',
        body: {
          query: 'string (required) - What kind of background needed',
          category: 'string (optional)',
          preferExisting: 'boolean (optional, default: true)',
          autoGenerate: 'boolean (optional, default: true)',
          style: 'string (optional)',
          occasion: 'string (optional)'
        }
      },
      {
        path: 'POST /api/integration/for-post',
        description: 'Get best background for a social media post content',
        body: {
          postContent: 'string (required) - The post text content',
          platform: 'string (optional) - instagram, facebook, twitter, etc.',
          mood: 'string (optional) - positive, professional, festive, etc.',
          category: 'string (optional)'
        }
      }
    ],
    integration: {
      description: 'Integration with auto_poster, manager, and post_generator',
      usage: [
        'Use POST /api/integration/get-background for automatic background selection',
        'Use GET /api/integration/festivals-today for daily automated posts',
        'Use POST /api/integration/for-post to match backgrounds to post content',
        'Use GET /api/integration/stats for dashboard statistics'
      ]
    }
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
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

// Load user settings
async function loadUserSettings() {
  const fs = require('fs').promises;
  const settingsPath = path.join(__dirname, 'config/user-settings.json');
  try {
    const data = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { apiKey: null };
  }
}

// Initialize storage and start server
async function startServer() {
  try {
    // Initialize storage service
    await storageService.init();
    console.log('Storage service initialized');

    // Load user settings and check for saved API key
    const userSettings = await loadUserSettings();
    if (userSettings.apiKey) {
      geminiService.updateApiKey(userSettings.apiKey);
      console.log('Loaded user API key from settings');
    } else if (!config.gemini.apiKey) {
      console.warn('Warning: GEMINI_API_KEY not set. AI generation will not work.');
      console.warn('Set GEMINI_API_KEY in .env file or use Settings in the UI.');
    } else {
      console.log('Gemini API configured from environment');
    }

    // Start server
    const PORT = config.server.port;
    const HOST = config.server.host;

    app.listen(PORT, HOST, () => {
      console.log('');
      console.log('='.repeat(50));
      console.log('  Background Engine Server Started');
      console.log('='.repeat(50));
      console.log(`  URL: http://${HOST}:${PORT}`);
      console.log(`  API: http://${HOST}:${PORT}/api`);
      console.log(`  Docs: http://${HOST}:${PORT}/api/docs`);
      console.log('='.repeat(50));
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
