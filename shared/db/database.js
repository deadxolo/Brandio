// SQLite-backed database service.
//
// Replaces the previous JSON-flat-file store (data.json) with a real SQLite
// database using Node's built-in `node:sqlite` (Node >= 22). The PUBLIC API is
// intentionally identical to the old service so no route/service code needs to
// change: nested fields (elements, brand_colors, content, platforms, ...) are
// JSON-encoded into TEXT columns and parsed back on read, and scalar fields
// stay as real columns so existing raw SQL (db.db.prepare(...)) keeps working.
//
// WAL mode is enabled so the four micro-services can read/write the same file
// concurrently and safely (the old JSON store had race conditions / corruption
// risk). The original data.json is left untouched as a backup; run
// `node shared/db/migrate-json-to-sqlite.js` once to import it.

const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Suppress the one-time "SQLite is experimental" ExperimentalWarning so the
// service logs stay clean. Everything else is unaffected.
const _origEmit = process.emit;
process.emit = function (name, data, ...rest) {
  if (
    name === 'warning' &&
    data &&
    data.name === 'ExperimentalWarning' &&
    typeof data.message === 'string' &&
    data.message.includes('SQLite')
  ) {
    return false;
  }
  return _origEmit.call(this, name, data, ...rest);
};

const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'social_manager.db');

// Per-table column definitions.
//   cols : ordered list of real columns
//   json : columns whose value is an object/array (JSON-encoded as TEXT)
//   bool : columns returned as JS booleans (stored as 0/1)
const TABLES = {
  users: {
    cols: ['id', 'email', 'name', 'password_hash', 'avatar', 'created_at', 'updated_at'],
    json: [], bool: []
  },
  businesses: {
    cols: ['id', 'user_id', 'name', 'description', 'logo', 'address', 'phone', 'email',
      'website', 'industry', 'social_links', 'brand_colors', 'fonts', 'is_active',
      'created_at', 'updated_at'],
    json: ['social_links', 'brand_colors', 'fonts'], bool: []
  },
  templates: {
    cols: ['id', 'business_id', 'name', 'description', 'platform', 'content_type', 'width',
      'height', 'elements', 'background_type', 'background_value', 'background_fitMode',
      'background_blur', 'thumbnail', 'placeholders', 'manuallyEdited', 'aiControlled',
      'is_default', 'created_at', 'updated_at'],
    json: ['elements', 'placeholders'], bool: ['manuallyEdited', 'aiControlled']
  },
  posts: {
    cols: ['id', 'business_id', 'template_id', 'title', 'content', 'caption', 'hashtags',
      'platforms', 'image_url', 'status', 'scheduled_at', 'published_at', 'created_at',
      'updated_at'],
    json: ['content', 'platforms'], bool: []
  },
  social_accounts: {
    cols: ['id', 'business_id', 'platform', 'account_id', 'account_name', 'access_token',
      'refresh_token', 'token_expires_at', 'token_encrypted', 'profile_url',
      'profile_picture', 'page_id', 'page_access_token', 'instagram_account_id', 'scopes',
      'is_active', 'created_at', 'updated_at'],
    json: ['scopes'], bool: []
  },
  scheduled_jobs: {
    cols: ['id', 'post_id', 'platform', 'social_account_id', 'scheduled_at', 'status',
      'result', 'attempts', 'created_at', 'updated_at'],
    json: ['result'], bool: []
  },
  assets: {
    cols: ['id', 'business_id', 'name', 'type', 'file_path', 'file_url', 'mime_type',
      'file_size', 'metadata', 'created_at'],
    json: ['metadata'], bool: []
  },
  analytics: {
    cols: ['id', 'post_id', 'platform', 'impressions', 'likes', 'comments', 'shares',
      'saves', 'clicks', 'reach', 'recorded_at'],
    json: [], bool: []
  },
  publishing_logs: {
    cols: ['id', 'post_id', 'job_id', 'platform', 'action', 'status', 'request_data',
      'response_data', 'error_message', 'error_code', 'duration_ms', 'created_at'],
    json: ['request_data', 'response_data'], bool: []
  },
  platform_posts: {
    cols: ['id', 'post_id', 'platform', 'platform_post_id', 'platform_url', 'published_at'],
    json: [], bool: []
  }
};

// Column type hints for table creation (defaults to TEXT).
const INT_COLS = new Set([
  'is_active', 'is_default', 'token_encrypted', 'attempts', 'width', 'height', 'file_size',
  'impressions', 'likes', 'comments', 'shares', 'saves', 'clicks', 'reach', 'duration_ms',
  'manuallyEdited', 'aiControlled'
]);
const REAL_COLS = new Set(['background_blur']);

function columnType(col) {
  if (col === 'id') return 'TEXT PRIMARY KEY';
  if (INT_COLS.has(col)) return 'INTEGER';
  if (REAL_COLS.has(col)) return 'REAL';
  return 'TEXT';
}

const ISO = () => new Date().toISOString();

class DatabaseService {
  constructor() {
    this.conn = new DatabaseSync(DB_PATH);
    this.conn.exec('PRAGMA journal_mode = WAL;');
    this.conn.exec('PRAGMA busy_timeout = 5000;');
    this._createTables();
    this.initDemoUser();
  }

  _createTables() {
    for (const [table, def] of Object.entries(TABLES)) {
      const cols = def.cols.map((c) => `${c} ${columnType(c)}`).join(', ');
      this.conn.exec(`CREATE TABLE IF NOT EXISTS ${table} (${cols});`);
    }
    // Helpful indexes for the most common lookups.
    const idx = [
      'CREATE INDEX IF NOT EXISTS idx_businesses_user ON businesses(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_templates_business ON templates(business_id);',
      'CREATE INDEX IF NOT EXISTS idx_posts_business ON posts(business_id);',
      'CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);',
      'CREATE INDEX IF NOT EXISTS idx_accounts_business ON social_accounts(business_id);',
      'CREATE INDEX IF NOT EXISTS idx_jobs_post ON scheduled_jobs(post_id);',
      'CREATE INDEX IF NOT EXISTS idx_jobs_status ON scheduled_jobs(status);',
      'CREATE INDEX IF NOT EXISTS idx_assets_business ON assets(business_id);',
      'CREATE INDEX IF NOT EXISTS idx_analytics_post ON analytics(post_id);',
      'CREATE INDEX IF NOT EXISTS idx_platform_posts_post ON platform_posts(post_id);'
    ];
    for (const sql of idx) this.conn.exec(sql);
  }

  // ---- low-level helpers -------------------------------------------------

  // Coerce a JS value into something node:sqlite can bind for a given column.
  _encode(table, col, value) {
    const def = TABLES[table];
    if (def.json.includes(col)) {
      return value === undefined || value === null ? null : JSON.stringify(value);
    }
    if (def.bool.includes(col)) {
      return value ? 1 : 0;
    }
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    // Safety net: never let a stray object/array reach the binder for a scalar
    // column (would throw). Encode it as JSON text instead.
    if (value !== null && typeof value === 'object') return JSON.stringify(value);
    return value;
  }

  // Rebuild a JS object (with parsed JSON / booleans) from a raw DB row.
  _decodeRow(table, row) {
    if (!row) return row;
    const def = TABLES[table];
    const out = {};
    for (const col of def.cols) {
      let v = row[col];
      if (def.json.includes(col)) {
        v = v === null || v === undefined ? null : safeParse(v);
      } else if (def.bool.includes(col)) {
        v = !!v;
      }
      out[col] = v;
    }
    return out;
  }

  // INSERT (or REPLACE) a full object keyed by the table's columns.
  _write(table, obj, replace = false) {
    const def = TABLES[table];
    const verb = replace ? 'INSERT OR REPLACE INTO' : 'INSERT INTO';
    const placeholders = def.cols.map(() => '?').join(', ');
    const values = def.cols.map((c) => this._encode(table, c, obj[c]));
    this.conn
      .prepare(`${verb} ${table} (${def.cols.join(', ')}) VALUES (${placeholders})`)
      .run(...values);
    return obj;
  }

  _get(table, id) {
    const row = this.conn.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    return this._decodeRow(table, row);
  }

  _all(table) {
    const rows = this.conn.prepare(`SELECT * FROM ${table}`).all();
    return rows.map((r) => this._decodeRow(table, r));
  }

  // Partial update: merge `data` into the existing row and rewrite it.
  _update(table, id, data) {
    const current = this._get(table, id);
    if (!current) return null;
    const merged = { ...current, ...data };
    this._write(table, merged, true);
    return this._get(table, id);
  }

  _delete(table, id) {
    this.conn.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  }

  // Bulk import used by the migration script (single transaction).
  bulkImport(data) {
    const summary = [];
    this.conn.exec('BEGIN');
    try {
      for (const table of Object.keys(TABLES)) {
        const rows = Array.isArray(data[table]) ? data[table] : [];
        for (const row of rows) this._write(table, row, true);
        summary.push([table, rows.length]);
      }
      this.conn.exec('COMMIT');
    } catch (err) {
      this.conn.exec('ROLLBACK');
      throw err;
    }
    return summary;
  }

  // Kept for API compatibility; SQLite reads/writes are always live.
  reload() {}
  save() {}

  initDemoUser() {
    const userId = 'user_demo_001';
    if (!this._get('users', userId)) {
      this._write('users', {
        id: userId,
        email: 'demo@example.com',
        name: 'Demo User',
        password_hash: null,
        avatar: null,
        created_at: ISO(),
        updated_at: ISO()
      });
    }
  }

  // ---- User methods ------------------------------------------------------
  getUser(userId) {
    return this._get('users', userId);
  }

  getUserByEmail(email) {
    if (!email) return undefined;
    const row = this.conn
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email);
    return this._decodeRow('users', row);
  }

  createUser({ email, name, password_hash, avatar = null }) {
    const user = {
      id: `user_${uuidv4()}`,
      email,
      name,
      password_hash,
      avatar,
      created_at: ISO(),
      updated_at: ISO()
    };
    this._write('users', user);
    return user;
  }

  updateUser(id, data) {
    return this._update('users', id, { ...data, updated_at: ISO() });
  }

  countUsers() {
    const row = this.conn.prepare('SELECT COUNT(*) AS count FROM users').get();
    return row ? row.count : 0;
  }

  // Reassign all businesses owned by one user to another (used to hand the
  // pre-existing demo data to the first real account on signup).
  reassignBusinesses(fromUserId, toUserId) {
    const owned = this._all('businesses').filter((b) => b.user_id === fromUserId);
    for (const b of owned) {
      this._update('businesses', b.id, { user_id: toUserId, updated_at: ISO() });
    }
    return owned.length;
  }

  // Does the given user own the given business? (for per-user isolation)
  userOwnsBusiness(userId, businessId) {
    const b = this._get('businesses', businessId);
    return !!(b && b.user_id === userId);
  }

  // ---- Business methods --------------------------------------------------
  getBusinessesByUser(userId) {
    return this._all('businesses')
      .filter((b) => b.user_id === userId && b.is_active)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  createBusiness(data) {
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
      created_at: ISO(),
      updated_at: ISO()
    };
    this._write('businesses', business);
    return business;
  }

  getBusiness(id) {
    const b = this._get('businesses', id);
    return b && b.is_active ? b : undefined;
  }

  updateBusiness(id, data) {
    return this._update('businesses', id, { ...data, updated_at: ISO() });
  }

  deleteBusiness(id) {
    this._update('businesses', id, { is_active: 0, updated_at: ISO() });
  }

  // ---- Template methods --------------------------------------------------
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
      created_at: ISO(),
      updated_at: ISO()
    };
    this._write('templates', template);
    return template;
  }

  getTemplate(id) {
    return this._get('templates', id);
  }

  getTemplatesByBusiness(businessId, platform = null) {
    let templates = this._all('templates').filter((t) => t.business_id === businessId);
    if (platform) {
      templates = templates.filter((t) => t.platform === platform);
    }
    return templates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  updateTemplate(id, data) {
    return this._update('templates', id, { ...data, updated_at: ISO() });
  }

  deleteTemplate(id) {
    this._delete('templates', id);
  }

  // ---- Post methods ------------------------------------------------------
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
      created_at: ISO(),
      updated_at: ISO()
    };
    this._write('posts', post);
    return post;
  }

  getPost(id) {
    return this._get('posts', id);
  }

  getPostsByBusiness(businessId, status = null, limit = 50) {
    let posts = this._all('posts').filter((p) => p.business_id === businessId);
    if (status) {
      posts = posts.filter((p) => p.status === status);
    }
    return posts
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }

  getScheduledPosts(fromTime = null) {
    const from = fromTime || ISO();
    return this._all('posts')
      .filter((p) => p.status === 'scheduled' && p.scheduled_at >= from)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  }

  updatePost(id, data) {
    return this._update('posts', id, { ...data, updated_at: ISO() });
  }

  deletePost(id) {
    this._delete('posts', id);
  }

  // ---- Social Account methods -------------------------------------------
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
      page_id: data.page_id || null,
      page_access_token: data.page_access_token || null,
      instagram_account_id: data.instagram_account_id || null,
      scopes: data.scopes || [],
      is_active: 1,
      created_at: ISO(),
      updated_at: ISO()
    };
    this._write('social_accounts', account);
    return account;
  }

  getSocialAccount(id) {
    return this._get('social_accounts', id);
  }

  getSocialAccountsByBusiness(businessId) {
    return this._all('social_accounts').filter((a) => a.business_id === businessId && a.is_active);
  }

  updateSocialAccount(id, data) {
    return this._update('social_accounts', id, { ...data, updated_at: ISO() });
  }

  deleteSocialAccount(id) {
    this._delete('social_accounts', id);
  }

  // ---- Scheduled Jobs methods -------------------------------------------
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
      created_at: ISO(),
      updated_at: ISO()
    };
    this._write('scheduled_jobs', job);
    return job;
  }

  getScheduledJob(id) {
    return this._get('scheduled_jobs', id);
  }

  getPendingJobs(limit = 100) {
    const now = ISO();
    return this._all('scheduled_jobs')
      .filter((j) => j.status === 'pending' && j.scheduled_at <= now)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .slice(0, limit);
  }

  updateScheduledJob(id, data) {
    return this._update('scheduled_jobs', id, { ...data, updated_at: ISO() });
  }

  // ---- Asset methods -----------------------------------------------------
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
      created_at: ISO()
    };
    this._write('assets', asset);
    return asset;
  }

  getAsset(id) {
    return this._get('assets', id);
  }

  getAssetsByBusiness(businessId, type = null) {
    let assets = this._all('assets').filter((a) => a.business_id === businessId);
    if (type) {
      assets = assets.filter((a) => a.type === type);
    }
    return assets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  deleteAsset(id) {
    this._delete('assets', id);
  }

  // ---- Analytics ---------------------------------------------------------
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
      recorded_at: ISO()
    };
    this._write('analytics', record);
    return record;
  }

  getAnalyticsByPost(postId) {
    return this._all('analytics')
      .filter((a) => a.post_id === postId)
      .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
  }

  // Most recent analytics snapshot for a post (or null).
  getLatestAnalyticsByPost(postId) {
    return this.getAnalyticsByPost(postId)[0] || null;
  }

  // All analytics rows for every post belonging to a business.
  getAnalyticsByBusiness(businessId) {
    const postIds = new Set(
      this._all('posts').filter((p) => p.business_id === businessId).map((p) => p.id)
    );
    return this._all('analytics')
      .filter((a) => postIds.has(a.post_id))
      .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
  }

  // All external/published platform posts for a business (for analytics refresh).
  getPlatformPostsByBusiness(businessId) {
    const postIds = new Set(
      this._all('posts').filter((p) => p.business_id === businessId).map((p) => p.id)
    );
    return this._all('platform_posts').filter((pp) => postIds.has(pp.post_id));
  }

  // ---- Publishing Logs methods ------------------------------------------
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
      created_at: ISO()
    };
    this._write('publishing_logs', log);
    return log;
  }

  getPublishingLogsByPost(postId, limit = 100) {
    return this._all('publishing_logs')
      .filter((l) => l.post_id === postId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }

  getPublishingLogsByJob(jobId) {
    return this._all('publishing_logs')
      .filter((l) => l.job_id === jobId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  getRecentPublishingLogs(limit = 50) {
    return this._all('publishing_logs')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }

  // ---- Platform Posts methods -------------------------------------------
  createPlatformPost(data) {
    const platformPost = {
      id: uuidv4(),
      post_id: data.post_id,
      platform: data.platform,
      platform_post_id: data.platform_post_id,
      platform_url: data.platform_url || null,
      published_at: ISO()
    };
    this._write('platform_posts', platformPost);
    return platformPost;
  }

  getPlatformPostsByPost(postId) {
    return this._all('platform_posts').filter((p) => p.post_id === postId);
  }

  getPlatformPost(postId, platform) {
    return this._all('platform_posts').find((p) => p.post_id === postId && p.platform === platform) || null;
  }

  // ---- Enhanced Social Account methods ----------------------------------
  getSocialAccountByPlatform(businessId, platform) {
    return this._all('social_accounts').find(
      (a) => a.business_id === businessId && a.platform === platform && a.is_active
    );
  }

  getSocialAccountByAccountId(businessId, platform, accountId) {
    return this._all('social_accounts').find(
      (a) => a.business_id === businessId && a.platform === platform && a.account_id === accountId && a.is_active
    );
  }

  getSocialAccountsByPlatform(businessId, platform) {
    return this._all('social_accounts').filter(
      (a) => a.business_id === businessId && a.platform === platform && a.is_active
    );
  }

  getActiveSocialAccounts(businessId) {
    return this._all('social_accounts').filter((a) => a.business_id === businessId && a.is_active);
  }

  // ---- Jobs / status helpers --------------------------------------------
  getJobsByPost(postId) {
    return this._all('scheduled_jobs').filter((j) => j.post_id === postId);
  }

  getPostPublishingStatus(postId) {
    const jobs = this.getJobsByPost(postId);
    const platformPosts = this.getPlatformPostsByPost(postId);

    const status = {
      jobs: jobs.map((j) => ({
        id: j.id,
        platform: j.platform,
        status: j.status,
        result: j.result,
        attempts: j.attempts
      })),
      published: platformPosts.map((p) => ({
        platform: p.platform,
        platform_post_id: p.platform_post_id,
        platform_url: p.platform_url,
        published_at: p.published_at
      }))
    };

    const pendingCount = jobs.filter((j) => ['pending', 'processing'].includes(j.status)).length;
    const completedCount = jobs.filter((j) => j.status === 'completed').length;
    const failedCount = jobs.filter((j) => j.status === 'failed').length;

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

  // ---- Dashboard stats ---------------------------------------------------
  getDashboardStats(businessId) {
    const posts = this._all('posts').filter((p) => p.business_id === businessId);
    const templates = this._all('templates').filter((t) => t.business_id === businessId);
    const socialAccounts = this._all('social_accounts').filter(
      (a) => a.business_id === businessId && a.is_active
    );

    return {
      totalPosts: posts.length,
      scheduledPosts: posts.filter((p) => p.status === 'scheduled').length,
      publishedPosts: posts.filter((p) => p.status === 'published').length,
      templates: templates.length,
      socialAccounts: socialAccounts.length
    };
  }

  // ---- Raw query access (real SQLite) -----------------------------------
  // Exposes the underlying connection's prepared statements. JSON/TEXT columns
  // that hold encoded objects are auto-parsed in results so callers see the
  // same shapes the old in-memory shim produced.
  get db() {
    const conn = this.conn;
    return {
      prepare(sql) {
        const stmt = conn.prepare(sql);
        return {
          get: (...params) => autoParseRow(stmt.get(...params)),
          all: (...params) => stmt.all(...params).map(autoParseRow),
          run: (...params) => stmt.run(...params)
        };
      },
      exec: (sql) => conn.exec(sql)
    };
  }
}

function safeParse(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// For raw SELECT * results: parse any string value that looks like encoded JSON.
function autoParseRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
      try {
        out[k] = JSON.parse(v);
        continue;
      } catch {
        /* keep original string */
      }
    }
    out[k] = v;
  }
  return out;
}

// Export singleton instance (same as before).
module.exports = new DatabaseService();
