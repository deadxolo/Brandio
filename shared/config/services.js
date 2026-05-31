// Service configuration for all micro-apps
module.exports = {
  services: {
    manager: {
      name: 'Manager',
      port: 3004,
      baseUrl: 'http://localhost:3004',
      description: 'Business management and dashboard'
    },
    background_engine: {
      name: 'Background Engine',
      port: 3001,
      baseUrl: 'http://localhost:3001',
      description: 'AI-powered background generator'
    },
    post_generator: {
      name: 'Post Generator',
      port: 3002,
      baseUrl: 'http://localhost:3002',
      description: 'Post template editor and creator'
    },
    auto_poster: {
      name: 'Auto Poster',
      port: 3003,
      baseUrl: 'http://localhost:3003',
      description: 'Social media scheduling and posting'
    }
  },

  // Social media platform configurations
  platforms: {
    instagram: {
      name: 'Instagram',
      icon: 'instagram',
      sizes: {
        post: { width: 1080, height: 1080 },
        story: { width: 1080, height: 1920 },
        reel: { width: 1080, height: 1920 }
      }
    },
    facebook: {
      name: 'Facebook',
      icon: 'facebook',
      sizes: {
        post: { width: 1200, height: 630 },
        story: { width: 1080, height: 1920 },
        cover: { width: 820, height: 312 }
      }
    },
    twitter: {
      name: 'Twitter/X',
      icon: 'twitter',
      sizes: {
        post: { width: 1200, height: 675 },
        header: { width: 1500, height: 500 }
      }
    },
    linkedin: {
      name: 'LinkedIn',
      icon: 'linkedin',
      sizes: {
        post: { width: 1200, height: 627 },
        banner: { width: 1584, height: 396 }
      }
    },
    whatsapp: {
      name: 'WhatsApp',
      icon: 'whatsapp',
      sizes: {
        status: { width: 1080, height: 1920 }
      }
    }
  },

  // Database path (shared SQLite)
  database: {
    path: require('path').join(__dirname, '../db/social_manager.db')
  }
};
