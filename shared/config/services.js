// Service configuration for all micro-apps
// Ports may be overridden by environment variables so the same code runs in
// local dev (defaults below) and on Cloud Run / Docker (PORT for the manager).
const MANAGER_PORT = parseInt(process.env.PORT || process.env.MANAGER_PORT || '3004', 10);
const BG_ENGINE_PORT = parseInt(process.env.BG_ENGINE_PORT || '3001', 10);
const POST_GEN_PORT = parseInt(process.env.POST_GEN_PORT || '3002', 10);
const AUTO_POSTER_PORT = parseInt(process.env.AUTO_POSTER_PORT || '3003', 10);

module.exports = {
  services: {
    manager: {
      name: 'Manager',
      port: MANAGER_PORT,
      baseUrl: `http://localhost:${MANAGER_PORT}`,
      description: 'Business management and dashboard'
    },
    background_engine: {
      name: 'Background Engine',
      port: BG_ENGINE_PORT,
      baseUrl: `http://localhost:${BG_ENGINE_PORT}`,
      description: 'AI-powered background generator'
    },
    post_generator: {
      name: 'Post Generator',
      port: POST_GEN_PORT,
      baseUrl: `http://localhost:${POST_GEN_PORT}`,
      description: 'Post template editor and creator'
    },
    auto_poster: {
      name: 'Auto Poster',
      port: AUTO_POSTER_PORT,
      baseUrl: `http://localhost:${AUTO_POSTER_PORT}`,
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
