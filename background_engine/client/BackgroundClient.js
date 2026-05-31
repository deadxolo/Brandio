/**
 * Background Engine Client SDK
 * Use this client in auto_poster, manager, and post_generator to interact with the background engine
 */

class BackgroundClient {
  /**
   * Create a new BackgroundClient instance
   * @param {Object} options - Client options
   * @param {string} options.baseUrl - Base URL of the background engine API
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3001';
  }

  /**
   * Make an API request
   * @private
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
  }

  /**
   * Get a background for a query (finds existing or generates new)
   * @param {string} query - What kind of background needed
   * @param {Object} options - Options
   * @returns {Promise<Object>} Background data
   */
  async getBackground(query, options = {}) {
    const { category, style, occasion, preferExisting = true, autoGenerate = true } = options;

    return this.request('/api/integration/get-background', {
      method: 'POST',
      body: { query, category, style, occasion, preferExisting, autoGenerate }
    });
  }

  /**
   * Generate a new background
   * @param {string} prompt - Background description
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated background
   */
  async generate(prompt, options = {}) {
    const { category, style, occasion, forceNew = true } = options;

    return this.request('/api/backgrounds/generate', {
      method: 'POST',
      body: { prompt, category, style, occasion, forceNew }
    });
  }

  /**
   * Search for existing backgrounds
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async search(query, options = {}) {
    const { category, occasion, limit = 10 } = options;
    const params = new URLSearchParams({ q: query, limit });
    if (category) params.append('category', category);
    if (occasion) params.append('occasion', occasion);

    return this.request(`/api/backgrounds/search?${params}`);
  }

  /**
   * Get all backgrounds with pagination
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Paginated backgrounds
   */
  async list(options = {}) {
    const { page = 1, limit = 20, category, sortBy, order } = options;
    const params = new URLSearchParams({ page, limit });
    if (category) params.append('category', category);
    if (sortBy) params.append('sortBy', sortBy);
    if (order) params.append('order', order);

    return this.request(`/api/backgrounds/list?${params}`);
  }

  /**
   * Get a background by ID
   * @param {string} id - Background ID or filename
   * @returns {Promise<Object>} Background data
   */
  async getById(id) {
    return this.request(`/api/backgrounds/${id}`);
  }

  /**
   * Get backgrounds for a specific occasion
   * @param {string} occasion - Occasion name
   * @returns {Promise<Object>} Backgrounds for occasion
   */
  async getByOccasion(occasion) {
    return this.request(`/api/backgrounds/occasion/${encodeURIComponent(occasion)}`);
  }

  /**
   * Get backgrounds for multiple queries at once
   * @param {Array<Object>} queries - Array of query objects
   * @returns {Promise<Object>} Batch results
   */
  async batchBackgrounds(queries) {
    return this.request('/api/integration/batch-backgrounds', {
      method: 'POST',
      body: { queries }
    });
  }

  /**
   * Get best background for post content
   * @param {string} postContent - The post text
   * @param {Object} options - Options
   * @returns {Promise<Object>} Matched backgrounds
   */
  async forPost(postContent, options = {}) {
    const { platform, mood, category } = options;

    return this.request('/api/integration/for-post', {
      method: 'POST',
      body: { postContent, platform, mood, category }
    });
  }

  /**
   * Get festivals/occasions for today
   * @returns {Promise<Object>} Today's festivals and backgrounds
   */
  async getFestivalsToday() {
    return this.request('/api/integration/festivals-today');
  }

  /**
   * Get background engine statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    return this.request('/api/integration/stats');
  }

  /**
   * Check if the background engine is healthy
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    try {
      const result = await this.request('/api/integration/health');
      return result.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Delete a background
   * @param {string} id - Background ID or filename
   * @returns {Promise<Object>} Delete result
   */
  async delete(id) {
    return this.request(`/api/backgrounds/${id}`, { method: 'DELETE' });
  }

  /**
   * Get available categories
   * @returns {Promise<Object>} Categories
   */
  async getCategories() {
    return this.request('/api/backgrounds/meta/categories');
  }

  /**
   * Get available occasions
   * @returns {Promise<Object>} Occasions
   */
  async getOccasions() {
    return this.request('/api/backgrounds/meta/occasions');
  }

  /**
   * Get autocomplete suggestions
   * @param {string} query - Partial query
   * @returns {Promise<Object>} Suggestions
   */
  async getSuggestions(query) {
    return this.request(`/api/backgrounds/suggest/autocomplete?q=${encodeURIComponent(query)}`);
  }

  /**
   * Get prompt improvement suggestions
   * @param {string} prompt - Original prompt
   * @returns {Promise<Object>} Improved prompts
   */
  async improvePrompt(prompt) {
    return this.request('/api/backgrounds/improve-prompt', {
      method: 'POST',
      body: { prompt }
    });
  }

  /**
   * Get the image URL for a background
   * @param {string} filename - Image filename
   * @returns {string} Full image URL
   */
  getImageUrl(filename) {
    return `${this.baseUrl}/api/backgrounds/image/${filename}`;
  }
}

module.exports = BackgroundClient;
