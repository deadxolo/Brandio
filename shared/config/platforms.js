// Platform-specific configurations for social media publishing

module.exports = {
  // Meta (Facebook & Instagram)
  meta: {
    name: 'Meta',
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    redirectUri: process.env.META_REDIRECT_URI || 'https://e16b643fcc41.ngrok-free.app/api/oauth/meta/callback',
    scopes: [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'business_management'
    ],
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    graphApiUrl: 'https://graph.facebook.com/v18.0',
    mediaRequirements: {
      instagram: {
        maxSize: 8 * 1024 * 1024, // 8MB
        formats: ['image/jpeg', 'image/png'],
        aspectRatios: { min: 0.8, max: 1.91 }, // 4:5 to 1.91:1
        dimensions: { minWidth: 320, maxWidth: 1440 }
      },
      facebook: {
        maxSize: 4 * 1024 * 1024, // 4MB
        formats: ['image/jpeg', 'image/png', 'image/gif'],
        dimensions: { recommended: { width: 1200, height: 630 } }
      }
    },
    rateLimits: {
      instagram: { posts: 25, period: '24h' },
      facebook: { posts: 200, period: '1h' }
    }
  },

  // Twitter/X
  twitter: {
    name: 'Twitter/X',
    clientId: process.env.TWITTER_CLIENT_ID || '',
    clientSecret: process.env.TWITTER_CLIENT_SECRET || '',
    redirectUri: process.env.TWITTER_REDIRECT_URI || 'https://e16b643fcc41.ngrok-free.app/api/oauth/twitter/callback',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    apiUrl: 'https://api.twitter.com/2',
    uploadUrl: 'https://upload.twitter.com/1.1',
    mediaRequirements: {
      maxSize: 5 * 1024 * 1024, // 5MB for images
      formats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxImages: 4,
      dimensions: { recommended: { width: 1200, height: 675 } }
    },
    rateLimits: {
      tweets: 300, period: '3h'
    },
    characterLimits: {
      tweet: 280,
      imageAlt: 1000
    }
  },

  // LinkedIn
  linkedin: {
    name: 'LinkedIn',
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || 'https://e16b643fcc41.ngrok-free.app/api/oauth/linkedin/callback',
    scopes: ['openid', 'profile', 'w_member_social'],
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    apiUrl: 'https://api.linkedin.com/v2',
    mediaRequirements: {
      maxSize: 5 * 1024 * 1024, // 5MB
      formats: ['image/jpeg', 'image/png', 'image/gif'],
      dimensions: { recommended: { width: 1200, height: 627 } }
    },
    characterLimits: {
      post: 3000
    }
  },

  // WhatsApp Business (placeholder for future)
  whatsapp: {
    name: 'WhatsApp',
    enabled: false, // Requires WhatsApp Business API
    note: 'WhatsApp Business API requires Meta Business verification'
  },

  // Publishing statuses
  publishingStatuses: {
    DRAFT: 'draft',
    READY: 'ready',
    PUBLISHING: 'publishing',
    PUBLISHED: 'published',
    FAILED: 'failed',
    PARTIAL: 'partial', // Some platforms succeeded, some failed
    SCHEDULED: 'scheduled'
  },

  // Job statuses
  jobStatuses: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    UPLOADING_MEDIA: 'uploading_media',
    CREATING_CONTAINER: 'creating_container',
    PUBLISHING: 'publishing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRY_PENDING: 'retry_pending'
  },

  // Error types for retry logic
  retryableErrors: [
    'RATE_LIMIT_EXCEEDED',
    'TIMEOUT',
    'NETWORK_ERROR',
    'SERVER_ERROR',
    'TEMPORARY_FAILURE'
  ],

  permanentErrors: [
    'INVALID_TOKEN',
    'EXPIRED_TOKEN',
    'CONTENT_POLICY_VIOLATION',
    'ACCOUNT_SUSPENDED',
    'INVALID_MEDIA',
    'PERMISSION_DENIED'
  ],

  // Helper functions
  getPlatformConfig(platform) {
    const configs = {
      instagram: this.meta,
      facebook: this.meta,
      twitter: this.twitter,
      linkedin: this.linkedin,
      whatsapp: this.whatsapp
    };
    return configs[platform] || null;
  },

  isConfigured(platform) {
    const config = this.getPlatformConfig(platform);
    if (!config) return false;

    switch (platform) {
      case 'instagram':
      case 'facebook':
        return !!(config.appId && config.appSecret);
      case 'twitter':
        return !!(config.clientId && config.clientSecret);
      case 'linkedin':
        return !!(config.clientId && config.clientSecret);
      default:
        return false;
    }
  },

  getMediaRequirements(platform) {
    const config = this.getPlatformConfig(platform);
    if (!config || !config.mediaRequirements) return null;

    if (platform === 'instagram' || platform === 'facebook') {
      return config.mediaRequirements[platform];
    }
    return config.mediaRequirements;
  },

  validateMedia(buffer, platform) {
    const requirements = this.getMediaRequirements(platform);
    if (!requirements) return { valid: true };

    const errors = [];

    // Check size
    if (buffer.length > requirements.maxSize) {
      errors.push(`File size exceeds ${requirements.maxSize / (1024 * 1024)}MB limit`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};
