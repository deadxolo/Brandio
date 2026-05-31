const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../../shared/db/database');
const servicesConfig = require('../../shared/config/services');

// Helper function to filter out posts with missing images
function filterPostsWithValidImages(posts) {
  return posts.filter(post => {
    if (post.image_url && post.image_url.startsWith('/uploads/')) {
      const filepath = path.join(__dirname, '..', post.image_url);
      return fs.existsSync(filepath);
    }
    return true; // Keep posts without images or with external URLs
  });
}

const DEMO_USER_ID = 'user_demo_001';

// Get dashboard overview for all businesses
router.get('/overview', async (req, res) => {
  try {
    const businesses = db.getBusinessesByUser(DEMO_USER_ID);

    // Aggregate stats across all businesses
    let totalStats = {
      totalBusinesses: businesses.length,
      totalPosts: 0,
      scheduledPosts: 0,
      publishedPosts: 0,
      totalTemplates: 0,
      totalSocialAccounts: 0
    };

    const businessStats = businesses.map(business => {
      const stats = db.getDashboardStats(business.id);
      totalStats.totalPosts += stats.totalPosts;
      totalStats.scheduledPosts += stats.scheduledPosts;
      totalStats.publishedPosts += stats.publishedPosts;
      totalStats.totalTemplates += stats.templates;
      totalStats.totalSocialAccounts += stats.socialAccounts;

      return {
        id: business.id,
        name: business.name,
        logo: business.logo,
        ...stats
      };
    });

    res.json({
      success: true,
      overview: totalStats,
      businesses: businessStats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get stats for specific business
router.get('/stats/:businessId', (req, res) => {
  try {
    const business = db.getBusiness(req.params.businessId);
    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    const stats = db.getDashboardStats(req.params.businessId);
    const allRecentPosts = db.getPostsByBusiness(req.params.businessId, null, 10);
    const recentPosts = filterPostsWithValidImages(allRecentPosts).slice(0, 5);
    const templates = db.getTemplatesByBusiness(req.params.businessId).slice(0, 5);
    const socialAccounts = db.getSocialAccountsByBusiness(req.params.businessId);

    res.json({
      success: true,
      business: {
        id: business.id,
        name: business.name,
        logo: business.logo
      },
      stats,
      recentPosts,
      recentTemplates: templates,
      socialAccounts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check health of all services
router.get('/services/health', async (req, res) => {
  const services = servicesConfig.services;
  const healthResults = {};

  for (const [key, service] of Object.entries(services)) {
    try {
      if (key === 'manager') {
        healthResults[key] = { status: 'healthy', name: service.name };
        continue;
      }

      const response = await axios.get(`${service.baseUrl}/api`, { timeout: 3000 });
      healthResults[key] = {
        status: 'healthy',
        name: service.name,
        version: response.data.version || 'unknown'
      };
    } catch (error) {
      healthResults[key] = {
        status: 'unhealthy',
        name: service.name,
        error: error.code || error.message
      };
    }
  }

  const allHealthy = Object.values(healthResults).every(s => s.status === 'healthy');

  res.json({
    success: true,
    allHealthy,
    services: healthResults
  });
});

// Get activity feed
router.get('/activity/:businessId', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const allPosts = db.getPostsByBusiness(req.params.businessId, null, parseInt(limit) + 10);
    const posts = filterPostsWithValidImages(allPosts).slice(0, parseInt(limit));

    // Create activity items from posts
    const activities = posts.map(post => ({
      id: post.id,
      type: post.status === 'published' ? 'post_published' :
            post.status === 'scheduled' ? 'post_scheduled' :
            post.status === 'draft' ? 'post_created' : 'post_updated',
      title: post.title || 'Untitled Post',
      platforms: post.platforms,
      timestamp: post.published_at || post.scheduled_at || post.created_at,
      imageUrl: post.image_url
    }));

    res.json({
      success: true,
      activities
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
