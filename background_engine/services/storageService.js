const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

class StorageService {
  constructor() {
    this.backgroundsPath = config.storage.backgroundsPath;
    this.indexPath = path.join(this.backgroundsPath, config.storage.metadataFile);
    this.index = {};
    this.initialized = false;
  }

  /**
   * Initialize storage - create directories and load index
   */
  async init() {
    if (this.initialized) return;

    try {
      // Create backgrounds directory if not exists
      await fs.mkdir(this.backgroundsPath, { recursive: true });

      // Load or create index file
      if (fsSync.existsSync(this.indexPath)) {
        const data = await fs.readFile(this.indexPath, 'utf-8');
        this.index = JSON.parse(data);
      } else {
        this.index = { backgrounds: [], lastUpdated: new Date().toISOString() };
        await this.saveIndex();
      }

      this.initialized = true;
      console.log(`Storage initialized at: ${this.backgroundsPath}`);
    } catch (error) {
      console.error('Storage initialization error:', error);
      throw error;
    }
  }

  /**
   * Save the index file
   */
  async saveIndex() {
    this.index.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2));
  }

  /**
   * Generate a filename from query/prompt
   * @param {string} query - The search query or prompt
   * @returns {string} Sanitized filename
   */
  generateFilename(query) {
    // Convert to lowercase, replace spaces with underscores, remove special chars
    const sanitized = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50); // Limit length

    const timestamp = Date.now();
    return `${sanitized}_${timestamp}`;
  }

  /**
   * Save a generated background image and its metadata
   * @param {Object} data - Image data and metadata
   * @returns {Promise<Object>} Saved background info
   */
  async saveBackground(data) {
    await this.init();

    const {
      imageData,
      prompt,
      description,
      metadata = {},
      category = 'general',
      tags = [],
      occasion = ''
    } = data;

    const id = uuidv4();
    const filename = this.generateFilename(prompt);
    const imagePath = path.join(this.backgroundsPath, `${filename}.png`);
    const jsonPath = path.join(this.backgroundsPath, `${filename}.json`);

    try {
      // Save image file
      const imageBuffer = Buffer.from(imageData.base64, 'base64');
      await fs.writeFile(imagePath, imageBuffer);

      // Prepare metadata JSON
      const backgroundMeta = {
        id,
        filename,
        imagePath: `${filename}.png`,
        prompt,
        description: description || prompt,
        category,
        occasion,
        tags: this.extractTags(prompt, tags),
        metadata: {
          ...metadata,
          mimeType: imageData.mimeType || 'image/png',
          size: imageBuffer.length,
          createdAt: new Date().toISOString()
        },
        location: {
          absolute: imagePath,
          relative: `./backgrounds/${filename}.png`,
          url: `/api/backgrounds/image/${filename}.png`
        }
      };

      // Save JSON metadata file
      await fs.writeFile(jsonPath, JSON.stringify(backgroundMeta, null, 2));

      // Add to index
      this.index.backgrounds.push({
        id,
        filename,
        imagePath: `${filename}.png`,
        prompt,
        category,
        occasion,
        tags: backgroundMeta.tags,
        createdAt: backgroundMeta.metadata.createdAt
      });
      await this.saveIndex();

      console.log(`Background saved: ${filename}`);
      return backgroundMeta;
    } catch (error) {
      console.error('Error saving background:', error);
      throw new Error(`Failed to save background: ${error.message}`);
    }
  }

  /**
   * Extract tags from prompt and provided tags
   * @param {string} prompt - The prompt text
   * @param {Array} providedTags - User-provided tags
   * @returns {Array} Combined tags
   */
  extractTags(prompt, providedTags = []) {
    const words = prompt.toLowerCase().split(/\s+/);
    const extractedTags = [];

    // Check for occasion keywords
    for (const occasion of config.occasions) {
      if (prompt.toLowerCase().includes(occasion)) {
        extractedTags.push(occasion.replace(/\s+/g, '_'));
      }
    }

    // Check for category keywords
    for (const category of config.categories) {
      if (prompt.toLowerCase().includes(category)) {
        extractedTags.push(category);
      }
    }

    // Add common descriptive words
    const descriptiveWords = ['colorful', 'vibrant', 'minimal', 'elegant', 'modern', 'traditional', 'festive', 'professional'];
    for (const word of descriptiveWords) {
      if (words.includes(word)) {
        extractedTags.push(word);
      }
    }

    // Combine with provided tags and remove duplicates
    return [...new Set([...extractedTags, ...providedTags])];
  }

  /**
   * Search for existing backgrounds
   * @param {string} query - Search query
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} Matching backgrounds
   */
  async searchBackgrounds(query, filters = {}) {
    await this.init();

    const { category, occasion, limit = 10 } = filters;
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    let results = this.index.backgrounds.filter(bg => {
      // Search in prompt
      const promptMatch = bg.prompt.toLowerCase().includes(queryLower);

      // Search in tags
      const tagMatch = bg.tags.some(tag =>
        queryWords.some(word => tag.includes(word) || word.includes(tag))
      );

      // Search in occasion
      const occasionMatch = bg.occasion && bg.occasion.toLowerCase().includes(queryLower);

      // Apply category filter
      if (category && bg.category !== category) return false;

      // Apply occasion filter
      if (occasion && bg.occasion !== occasion) return false;

      return promptMatch || tagMatch || occasionMatch;
    });

    // Sort by relevance (exact matches first) and date
    results.sort((a, b) => {
      const aExact = a.prompt.toLowerCase() === queryLower ? 1 : 0;
      const bExact = b.prompt.toLowerCase() === queryLower ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Limit results
    results = results.slice(0, limit);

    // Load full metadata for each result
    const fullResults = await Promise.all(
      results.map(async (bg) => {
        try {
          const jsonPath = path.join(this.backgroundsPath, `${bg.filename}.json`);
          const data = await fs.readFile(jsonPath, 'utf-8');
          return JSON.parse(data);
        } catch {
          return bg;
        }
      })
    );

    return fullResults;
  }

  /**
   * Get a background by ID or filename
   * @param {string} identifier - ID or filename
   * @returns {Promise<Object|null>} Background metadata
   */
  async getBackground(identifier) {
    await this.init();

    const bg = this.index.backgrounds.find(
      b => b.id === identifier || b.filename === identifier
    );

    if (!bg) return null;

    try {
      const jsonPath = path.join(this.backgroundsPath, `${bg.filename}.json`);
      const data = await fs.readFile(jsonPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading background:', error);
      return bg;
    }
  }

  /**
   * Get all backgrounds with pagination
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Paginated results
   */
  async getAllBackgrounds(options = {}) {
    await this.init();

    const { page = 1, limit = 20, category, sortBy = 'createdAt', order = 'desc' } = options;

    let backgrounds = [...this.index.backgrounds];

    // Apply category filter
    if (category) {
      backgrounds = backgrounds.filter(bg => bg.category === category);
    }

    // Sort
    backgrounds.sort((a, b) => {
      if (sortBy === 'createdAt') {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return order === 'desc' ? dateB - dateA : dateA - dateB;
      }
      return 0;
    });

    // Paginate
    const total = backgrounds.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    const items = backgrounds.slice(start, end);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Get backgrounds by occasion/festival
   * @param {string} occasion - Occasion name
   * @returns {Promise<Array>} Matching backgrounds
   */
  async getByOccasion(occasion) {
    await this.init();

    const occasionLower = occasion.toLowerCase();
    return this.index.backgrounds.filter(bg =>
      bg.occasion?.toLowerCase() === occasionLower ||
      bg.tags.some(tag => tag.includes(occasionLower))
    );
  }

  /**
   * Delete a background
   * @param {string} identifier - ID or filename
   * @returns {Promise<boolean>} Success status
   */
  async deleteBackground(identifier) {
    await this.init();

    const index = this.index.backgrounds.findIndex(
      b => b.id === identifier || b.filename === identifier
    );

    if (index === -1) return false;

    const bg = this.index.backgrounds[index];

    try {
      // Delete files
      const imagePath = path.join(this.backgroundsPath, `${bg.filename}.png`);
      const jsonPath = path.join(this.backgroundsPath, `${bg.filename}.json`);

      await fs.unlink(imagePath).catch(() => {});
      await fs.unlink(jsonPath).catch(() => {});

      // Remove from index
      this.index.backgrounds.splice(index, 1);
      await this.saveIndex();

      return true;
    } catch (error) {
      console.error('Error deleting background:', error);
      return false;
    }
  }

  /**
   * Get image file path
   * @param {string} filename - Image filename
   * @returns {string} Full path to image
   */
  getImagePath(filename) {
    return path.join(this.backgroundsPath, filename);
  }

  /**
   * Check if a background exists for a query
   * @param {string} query - Search query
   * @returns {Promise<boolean>} Whether matching background exists
   */
  async hasMatchingBackground(query) {
    const results = await this.searchBackgrounds(query, { limit: 1 });
    return results.length > 0;
  }

  /**
   * Get suggestions based on query
   * @param {string} query - Partial query
   * @returns {Promise<Array>} Suggestions
   */
  async getSuggestions(query) {
    await this.init();

    const queryLower = query.toLowerCase();
    const suggestions = new Set();

    // Add matching occasions
    for (const occasion of config.occasions) {
      if (occasion.includes(queryLower)) {
        suggestions.add(occasion);
      }
    }

    // Add matching tags from existing backgrounds
    for (const bg of this.index.backgrounds) {
      for (const tag of bg.tags) {
        if (tag.includes(queryLower)) {
          suggestions.add(tag);
        }
      }
    }

    return Array.from(suggestions).slice(0, 10);
  }
}

module.exports = new StorageService();
