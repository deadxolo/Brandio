const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const geminiService = require('../services/geminiService');

// Path to store settings
const SETTINGS_PATH = path.join(__dirname, '../config/user-settings.json');

/**
 * Load user settings from file
 */
async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { apiKey: null };
  }
}

/**
 * Save user settings to file
 */
async function saveSettings(settings) {
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

/**
 * @route GET /api/settings/api-status
 * @desc Check if API key is configured
 */
router.get('/api-status', async (req, res) => {
  try {
    const settings = await loadSettings();
    const envConfigured = !!process.env.GEMINI_API_KEY;
    const userConfigured = !!settings.apiKey;

    res.json({
      success: true,
      configured: envConfigured || userConfigured,
      source: userConfigured ? 'user' : envConfigured ? 'env' : 'none'
    });
  } catch (error) {
    console.error('API status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/settings/api-key
 * @desc Save user's Gemini API key
 */
router.post('/api-key', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }

    // Validate API key format (basic check)
    if (!apiKey.startsWith('AIza') || apiKey.length < 30) {
      return res.status(400).json({
        success: false,
        error: 'Invalid API key format'
      });
    }

    // Save to settings file
    const settings = await loadSettings();
    settings.apiKey = apiKey;
    settings.updatedAt = new Date().toISOString();
    await saveSettings(settings);

    // Update the gemini service with new key
    geminiService.updateApiKey(apiKey);

    console.log('API key updated by user');

    res.json({
      success: true,
      message: 'API key saved successfully'
    });
  } catch (error) {
    console.error('Save API key error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/settings/api-key
 * @desc Remove user's API key (revert to env key if available)
 */
router.delete('/api-key', async (req, res) => {
  try {
    const settings = await loadSettings();
    settings.apiKey = null;
    settings.updatedAt = new Date().toISOString();
    await saveSettings(settings);

    // Revert to env key if available
    if (process.env.GEMINI_API_KEY) {
      geminiService.updateApiKey(process.env.GEMINI_API_KEY);
    }

    res.json({
      success: true,
      message: 'API key removed'
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/settings
 * @desc Get all settings (without sensitive data)
 */
router.get('/', async (req, res) => {
  try {
    const settings = await loadSettings();

    res.json({
      success: true,
      settings: {
        apiKeyConfigured: !!settings.apiKey,
        updatedAt: settings.updatedAt || null
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
