const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'social_manager.db');

// Ensure db directory exists
if (!fs.existsSync(__dirname)) {
  fs.mkdirSync(__dirname, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Businesses table
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  logo TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  industry TEXT,
  social_links TEXT, -- JSON: { instagram: '', facebook: '', etc }
  brand_colors TEXT, -- JSON: { primary: '', secondary: '', accent: '' }
  fonts TEXT, -- JSON: { heading: '', body: '' }
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Post Templates table
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  platform TEXT NOT NULL, -- instagram, facebook, etc
  content_type TEXT NOT NULL, -- post, story, reel, etc
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  elements TEXT NOT NULL, -- JSON array of template elements
  background_type TEXT DEFAULT 'color', -- color, image, gradient
  background_value TEXT, -- color code, image url, or gradient config
  thumbnail TEXT,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  template_id TEXT,
  title TEXT,
  content TEXT, -- JSON: rendered content with all elements
  caption TEXT,
  hashtags TEXT,
  platforms TEXT NOT NULL, -- JSON array of target platforms
  image_url TEXT,
  status TEXT DEFAULT 'draft', -- draft, scheduled, published, failed
  scheduled_at DATETIME,
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);

-- Social Accounts table (connected social media accounts)
CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at DATETIME,
  profile_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- Scheduled Jobs table
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  social_account_id TEXT,
  scheduled_at DATETIME NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  result TEXT, -- JSON: result or error message
  attempts INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE SET NULL
);

-- Analytics table
CREATE TABLE IF NOT EXISTS analytics (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Assets table (uploaded images, logos, etc)
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- logo, image, background, font
  file_path TEXT NOT NULL,
  file_url TEXT,
  mime_type TEXT,
  file_size INTEGER,
  metadata TEXT, -- JSON: dimensions, etc
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- Publishing Logs table (audit trail for all publishing attempts)
CREATE TABLE IF NOT EXISTS publishing_logs (
  id TEXT PRIMARY KEY,
  post_id TEXT,
  job_id TEXT,
  platform TEXT NOT NULL,
  action TEXT NOT NULL, -- oauth, upload_media, create_container, publish, refresh_token
  status TEXT NOT NULL, -- started, success, failed
  request_data TEXT, -- JSON: sanitized request info
  response_data TEXT, -- JSON: API response
  error_message TEXT,
  error_code TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
);

-- Platform Post IDs table (tracks external post IDs after publishing)
CREATE TABLE IF NOT EXISTS platform_posts (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_post_id TEXT NOT NULL,
  platform_url TEXT,
  published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_businesses_user ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_business ON templates(business_id);
CREATE INDEX IF NOT EXISTS idx_posts_business ON posts(business_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON scheduled_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_time ON scheduled_jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_publishing_logs_post ON publishing_logs(post_id);
CREATE INDEX IF NOT EXISTS idx_publishing_logs_job ON publishing_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_platform_posts_post ON platform_posts(post_id);
`;

// Execute schema
db.exec(schema);

// Create default user for demo
const userId = 'user_demo_001';
const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);

if (!existingUser) {
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash)
    VALUES (?, ?, ?, ?)
  `).run(userId, 'demo@example.com', 'Demo User', 'demo_hash');

  console.log('Created demo user');
}

console.log('Database initialized successfully at:', DB_PATH);

db.close();
