const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'data.json');

// Initial database structure
const initialData = {
  users: [],
  businesses: [],
  templates: [],
  posts: [],
  social_accounts: [],
  scheduled_jobs: [],
  assets: [],
  analytics: [],
  publishing_logs: [],
  platform_posts: []
};

class DatabaseService {
  constructor() {
    this.data = this.load();
    this.initDemoUser();
  }

  load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const content = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading database:', error);
    }
    return { ...initialData };
  }

  // Reload data from disk to get latest changes from other processes
  reload() {
    this.data = this.load();
  }

  save() {
    try {
      // Reload before saving to merge with any changes from other processes
      const latestData = this.load();

      // Merge our in-memory changes with disk data
      // For arrays, we need to handle additions/updates properly
      // IMPORTANT: in-memory data is authoritative for deletions
      for (const key of Object.keys(this.data)) {
        if (Array.isArray(this.data[key]) && Array.isArray(latestData[key])) {
          // Get IDs that exist in our in-memory data (these are the valid/non-deleted items)
          const memoryIds = new Set(this.data[key].map(item => item.id));

          // Start with our in-memory items (this preserves deletions)
          const resultMap = new Map(this.data[key].map(item => [item.id, item]));

          // Add any NEW items from disk that don't exist in memory yet
          // (items created by other processes)
          for (const diskItem of latestData[key]) {
            if (!resultMap.has(diskItem.id) && !this._deletedIds?.has(diskItem.id)) {
              // This is a new item from another process, add it
              resultMap.set(diskItem.id, diskItem);
            }
          }

          // Convert back to array
          this.data[key] = Array.from(resultMap.values());
        }
      }

      // Clear deleted IDs tracking after successful save
      this._deletedIds = new Set();

      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving database:', error);
    }
  }

  initDemoUser() {
    const userId = 'user_demo_001';
    if (!this.data.users.find(u => u.id === userId)) {
      this.data.users.push({
        id: userId,
        email: 'demo@example.com',
        name: 'Demo User',
        created_at: new Date().toISOString()
      });
      this.save();
    }
  }

  // User methods
  getUser(userId) {
    return this.data.users.find(u => u.id === userId);
  }

  getUserByEmail(email) {
    return this.data.users.find(u => u.email === email);
  }

  // Business methods
  getBusinessesByUser(userId) {
    this.reload(); // Get latest from disk
    return this.data.businesses.filter(b => b.user_id === userId && b.is_active)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  createBusiness(data) {
    this.reload(); // Get latest before adding
    const business = {
      id: uuidv4(),
      user_id: data.user_id,
      name: data.name,
      description: data.description || null,
      logo: data.logo || null,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      website: data.website || null,
      industry: data.industry || null,
      social_links: data.social_links || {},
      brand_colors: data.brand_colors || { primary: '#3B82F6', secondary: '#1E40AF', accent: '#F59E0B' },
      fonts: data.fonts || { heading: 'Inter', body: 'Inter' },
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.data.businesses.push(business);
    this.save();
    return business;
  }

  getBusiness(id) {
    this.reload(); // Get latest from disk
    return this.data.businesses.find(b => b.id === id && b.is_active);
  }

  updateBusiness(id, data) {
    this.reload(); // Get latest before updating
    const index = this.data.businesses.findIndex(b => b.id === id);
    if (index === -1) return null;

    const business = this.data.businesses[index];
    Object.assign(business, data, { updated_at: new Date().toISOString() });
    this.save();
    return business;
  }

  deleteBusiness(id) {
    const index = this.data.businesses.findIndex(b => b.id === id);
    if (index !== -1) {
      this.data.businesses[index].is_active = 0;
      this.data.businesses[index].updated_at = new Date().toISOString();
      this.save();
    }
  }

  // Template methods
  createTemplate(data) {
    const template = {
      id: uuidv4(),
      business_id: data.business_id,
      name: data.name,
      description: data.description || null,
      platform: data.platform,
      content_type: data.content_type,
      width: data.width || 1080,
      height: data.height || 1080,
      elements: data.elements || [],
      background_type: data.background_type || 'color',
      background_value: data.background_value || '#ffffff',
      background_fitMode: data.background_fitMode || 'cover',
      background_blur: data.background_blur || 0,
      thumbnail: data.thumbnail || null,
      placeholders: data.placeholders || {},
      manuallyEdited: data.manuallyEdited || false,
      aiControlled: data.aiControlled || false,
      is_default: data.is_default ? 1 : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.data.templates.push(template);
    this.save();
    return template;
  }

  getTemplate(id) {
    return this.data.templates.find(t => t.id === id);
  }

  getTemplatesByBusiness(businessId, platform = null) {
    let templates = this.data.templates.filter(t => t.business_id === businessId);
    if (platform) {
      templates = templates.filter(t => t.platform === platform);
    }
    return templates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  updateTemplate(id, data) {
    const index = this.data.templates.findIndex(t => t.id === id);
    if (index === -1) return null;

    Object.assign(this.data.templates[index], data, { updated_at: new Date().toISOString() });
    this.save();
    return this.data.templates[index];
  }

  deleteTemplate(id) {
    const index = this.data.templates.findIndex(t => t.id === id);
    if (index !== -1) {
      this.data.templates.splice(index, 1);
      // Track deleted IDs to prevent them from being restored during merge
      if (!this._deletedIds) this._deletedIds = new Set();
      this._deletedIds.add(id);
      this.save();
    }
  }

  // Post methods
  createPost(data) {
    const post = {
      id: uuidv4(),
      business_id: data.business_id,
      template_id: data.template_id || null,
      title: data.title || null,
      content: data.content || {},
      caption: data.caption || null,
      hashtags: data.hashtags || null,
      platforms: data.platforms || [],
      image_url: data.image_url || null,
      status: data.status || 'draft',
      scheduled_at: data.scheduled_at || null,
      published_at: data.published_at || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.data.posts.push(post);
    this.save();
    return post;
  }

  getPost(id) {
    return this.data.posts.find(p => p.id === id);
  }

  getPostsByBusiness(businessId, status = null, limit = 50) {
    let posts = this.data.posts.filter(p => p.business_id === businessId);
    if (status) {
      posts = posts.filter(p => p.status === status);
    }
    return posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
  }

  getScheduledPosts(fromTime = null) {
    const from = fromTime || new Date().toISOString();
    return this.data.posts
      .filter(p => p.status === 'scheduled' && p.scheduled_at >= from)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  }

  updatePost(id, data) {
    const index = this.data.posts.findIndex(p => p.id === id);
    if (index === -1) return null;

    Object.assign(this.data.posts[index], data, { updated_at: new Date().toISOString() });
    this.save();
    return this.data.posts[index];
  }

  deletePost(id) {
    const index = this.data.posts.findIndex(p => p.id === id);
    if (index !== -1) {
      this.data.posts.splice(index, 1);
      // Track deleted IDs to prevent them from being restored during merge
      if (!this._deletedIds) this._deletedIds = new Set();
      this._deletedIds.add(id);
      this.save();
    }
  }

  // Social Account methods
  createSocialAccount(data) {
    const account = {
      id: uuidv4(),
      business_id: data.business_id,
      platform: data.platform,
      account_id: data.account_id,
      account_name: data.account_name || null,
      access_token: data.access_token || null,
      refresh_token: data.refresh_token || null,
      token_expires_at: data.token_expires_at || null,
      token_encrypted: data.token_encrypted || 0,
      profile_url: data.profile_url || null,
      profile_picture: data.profile_picture || null,
      // Meta-specific fields
      page_id: data.page_id || null,
      page_access_token: data.page_access_token || null,
      instagram_account_id: data.instagram_account_id || null,
      // Metadata
      scopes: data.scopes || [],
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.data.social_accounts.push(account);
    this.save();
    return account;
  }

  getSocialAccount(id) {
    return this.data.social_accounts.find(a => a.id === id);
  }

  getSocialAccountsByBusiness(businessId) {
    return this.data.social_accounts.filter(a => a.business_id === businessId && a.is_active);
  }

  updateSocialAccount(id, data) {
    const index = this.data.social_accounts.findIndex(a => a.id === id);
    if (index === -1) return null;

    Object.assign(this.data.social_accounts[index], data, { updated_at: new Date().toISOString() });
    this.save();
    return this.data.social_accounts[index];
  }

  deleteSocialAccount(id) {
    const index = this.data.social_accounts.findIndex(a => a.id === id);
    if (index !== -1) {
      this.data.social_accounts.splice(index, 1);
      if (!this._deletedIds) this._deletedIds = new Set();
      this._deletedIds.add(id);
      this.save();
    }
  }

  // Scheduled Jobs methods
  createScheduledJob(data) {
    const job = {
      id: uuidv4(),
      post_id: data.post_id,
      platform: data.platform,
      social_account_id: data.social_account_id || null,
      scheduled_at: data.scheduled_at,
      status: data.status || 'pending',
      result: null,
      attempts: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.data.scheduled_jobs.push(job);
    this.save();
    return job;
  }

  getScheduledJob(id) {
    return this.data.scheduled_jobs.find(j => j.id === id);
  }

  getPendingJobs(limit = 100) {
    const now = new Date().toISOString();
    return this.data.scheduled_jobs
      .filter(j => j.status === 'pending' && j.scheduled_at <= now)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .slice(0, limit);
  }

  updateScheduledJob(id, data) {
    const index = this.data.scheduled_jobs.findIndex(j => j.id === id);
    if (index === -1) return null;

    Object.assign(this.data.scheduled_jobs[index], data, { updated_at: new Date().toISOString() });
    this.save();
    return this.data.scheduled_jobs[index];
  }

  // Asset methods
  createAsset(data) {
    const asset = {
      id: uuidv4(),
      business_id: data.business_id,
      name: data.name,
      type: data.type,
      file_path: data.file_path,
      file_url: data.file_url || null,
      mime_type: data.mime_type || null,
      file_size: data.file_size || null,
      metadata: data.metadata || {},
      created_at: new Date().toISOString()
    };

    this.data.assets.push(asset);
    this.save();
    return asset;
  }

  getAsset(id) {
    return this.data.assets.find(a => a.id === id);
  }

  getAssetsByBusiness(businessId, type = null) {
    let assets = this.data.assets.filter(a => a.business_id === businessId);
    if (type) {
      assets = assets.filter(a => a.type === type);
    }
    return assets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  deleteAsset(id) {
    const index = this.data.assets.findIndex(a => a.id === id);
    if (index !== -1) {
      this.data.assets.splice(index, 1);
      if (!this._deletedIds) this._deletedIds = new Set();
      this._deletedIds.add(id);
      this.save();
    }
  }

  // Analytics
  recordAnalytics(data) {
    const record = {
      id: uuidv4(),
      post_id: data.post_id,
      platform: data.platform,
      impressions: data.impressions || 0,
      likes: data.likes || 0,
      comments: data.comments || 0,
      shares: data.shares || 0,
      saves: data.saves || 0,
      clicks: data.clicks || 0,
      reach: data.reach || 0,
      recorded_at: new Date().toISOString()
    };

    this.data.analytics.push(record);
    this.save();
    return record;
  }

  getAnalyticsByPost(postId) {
    return this.data.analytics
      .filter(a => a.post_id === postId)
      .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
  }

  // Publishing Logs methods
  createPublishingLog(data) {
    const log = {
      id: uuidv4(),
      post_id: data.post_id || null,
      job_id: data.job_id || null,
      platform: data.platform,
      action: data.action,
      status: data.status,
      request_data: data.request_data || null,
      response_data: data.response_data || null,
      error_message: data.error_message || null,
      error_code: data.error_code || null,
      duration_ms: data.duration_ms || null,
      created_at: new Date().toISOString()
    };

    if (!this.data.publishing_logs) {
      this.data.publishing_logs = [];
    }
    this.data.publishing_logs.push(log);
    this.save();
    return log;
  }

  getPublishingLogsByPost(postId, limit = 100) {
    if (!this.data.publishing_logs) return [];
    return this.data.publishing_logs
      .filter(l => l.post_id === postId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }

  getPublishingLogsByJob(jobId) {
    if (!this.data.publishing_logs) return [];
    return this.data.publishing_logs
      .filter(l => l.job_id === jobId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  getRecentPublishingLogs(limit = 50) {
    if (!this.data.publishing_logs) return [];
    return this.data.publishing_logs
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }

  // Platform Posts methods (tracks published post IDs on external platforms)
  createPlatformPost(data) {
    const platformPost = {
      id: uuidv4(),
      post_id: data.post_id,
      platform: data.platform,
      platform_post_id: data.platform_post_id,
      platform_url: data.platform_url || null,
      published_at: new Date().toISOString()
    };

    if (!this.data.platform_posts) {
      this.data.platform_posts = [];
    }
    this.data.platform_posts.push(platformPost);
    this.save();
    return platformPost;
  }

  getPlatformPostsByPost(postId) {
    if (!this.data.platform_posts) return [];
    return this.data.platform_posts.filter(p => p.post_id === postId);
  }

  getPlatformPost(postId, platform) {
    if (!this.data.platform_posts) return null;
    return this.data.platform_posts.find(p => p.post_id === postId && p.platform === platform);
  }

  // Enhanced Social Account methods
  getSocialAccountByPlatform(businessId, platform) {
    return this.data.social_accounts.find(
      a => a.business_id === businessId && a.platform === platform && a.is_active
    );
  }

  getSocialAccountByAccountId(businessId, platform, accountId) {
    return this.data.social_accounts.find(
      a => a.business_id === businessId && a.platform === platform && a.account_id === accountId && a.is_active
    );
  }

  getSocialAccountsByPlatform(businessId, platform) {
    return this.data.social_accounts.filter(
      a => a.business_id === businessId && a.platform === platform && a.is_active
    );
  }

  getActiveSocialAccounts(businessId) {
    return this.data.social_accounts.filter(
      a => a.business_id === businessId && a.is_active
    );
  }

  // Get jobs by post ID
  getJobsByPost(postId) {
    return this.data.scheduled_jobs.filter(j => j.post_id === postId);
  }

  // Get publishing status for a post
  getPostPublishingStatus(postId) {
    const jobs = this.getJobsByPost(postId);
    const platformPosts = this.getPlatformPostsByPost(postId);

    const status = {
      jobs: jobs.map(j => ({
        id: j.id,
        platform: j.platform,
        status: j.status,
        result: j.result,
        attempts: j.attempts
      })),
      published: platformPosts.map(p => ({
        platform: p.platform,
        platform_post_id: p.platform_post_id,
        platform_url: p.platform_url,
        published_at: p.published_at
      }))
    };

    // Calculate overall status
    const pendingCount = jobs.filter(j => ['pending', 'processing'].includes(j.status)).length;
    const completedCount = jobs.filter(j => j.status === 'completed').length;
    const failedCount = jobs.filter(j => j.status === 'failed').length;

    if (pendingCount > 0) {
      status.overall = 'publishing';
    } else if (failedCount > 0 && completedCount > 0) {
      status.overall = 'partial';
    } else if (failedCount > 0) {
      status.overall = 'failed';
    } else if (completedCount > 0) {
      status.overall = 'published';
    } else {
      status.overall = 'pending';
    }

    return status;
  }

  // Dashboard stats
  getDashboardStats(businessId) {
    const posts = this.data.posts.filter(p => p.business_id === businessId);
    const templates = this.data.templates.filter(t => t.business_id === businessId);
    const socialAccounts = this.data.social_accounts.filter(a => a.business_id === businessId && a.is_active);

    return {
      totalPosts: posts.length,
      scheduledPosts: posts.filter(p => p.status === 'scheduled').length,
      publishedPosts: posts.filter(p => p.status === 'published').length,
      templates: templates.length,
      socialAccounts: socialAccounts.length
    };
  }

  // Direct database access for raw queries (compatibility)
  get db() {
    return {
      prepare: (sql) => ({
        get: (...params) => this.executeQuery(sql, params, 'get'),
        all: (...params) => this.executeQuery(sql, params, 'all'),
        run: (...params) => this.executeQuery(sql, params, 'run')
      })
    };
  }

  executeQuery(sql, params, type) {
    // Simple query simulation for backwards compatibility
    // This handles basic queries used in the app
    console.log('Simulated query:', sql.substring(0, 50) + '...');

    if (sql.includes('FROM posts')) {
      if (type === 'get') return this.data.posts.find(p => p.business_id === params[0]);
      return this.data.posts.filter(p => p.business_id === params[0]);
    }
    if (sql.includes('FROM social_accounts')) {
      if (type === 'get') return this.data.social_accounts.find(a => a.business_id === params[0] && a.platform === params[1]);
      return this.data.social_accounts.filter(a => a.business_id === params[0]);
    }
    if (sql.includes('FROM scheduled_jobs')) {
      return this.data.scheduled_jobs.filter(j => j.post_id === params[0]);
    }

    return type === 'all' ? [] : null;
  }
}

// Export singleton instance
module.exports = new DatabaseService();
