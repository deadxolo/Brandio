/**
 * Background Engine
 *
 * AI-powered background generator for social media posts using Gemini
 *
 * Usage:
 *   const { BackgroundClient, geminiService, storageService } = require('./background_engine');
 *
 * Or start the server:
 *   npm start
 */

const geminiService = require('./services/geminiService');
const storageService = require('./services/storageService');
const BackgroundClient = require('./client/BackgroundClient');
const config = require('./config/config');
const helpers = require('./utils/helpers');

module.exports = {
  // Services
  geminiService,
  storageService,

  // Client SDK for other services
  BackgroundClient,

  // Configuration
  config,

  // Utilities
  helpers,

  // Quick methods for common operations
  async getBackground(query, options = {}) {
    const existing = await storageService.searchBackgrounds(query, { limit: 1 });
    if (existing.length > 0) {
      return { source: 'existing', background: existing[0] };
    }

    if (options.autoGenerate !== false) {
      const result = await geminiService.generateBackground(query, options);
      const saved = await storageService.saveBackground({
        imageData: result.imageData,
        prompt: query,
        description: result.description,
        metadata: result.metadata,
        category: options.category || 'general',
        occasion: options.occasion || '',
        tags: []
      });
      return { source: 'generated', background: saved };
    }

    return { source: 'not_found', background: null };
  },

  async searchBackgrounds(query, options = {}) {
    return storageService.searchBackgrounds(query, options);
  },

  async generateBackground(prompt, options = {}) {
    const result = await geminiService.generateBackground(prompt, options);
    return storageService.saveBackground({
      imageData: result.imageData,
      prompt,
      description: result.description,
      metadata: result.metadata,
      category: options.category || 'general',
      occasion: options.occasion || '',
      tags: []
    });
  }
};
