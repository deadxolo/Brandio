// Publish Routes - API endpoints for publishing posts to social media
const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const publishingService = require('../services/publishingService');
const platformsConfig = require('../../shared/config/platforms');

// Active SSE connections for real-time updates
const sseConnections = new Map();

// ==================== Publish Endpoints ====================

// Publish post immediately
router.post('/now', async (req, res) => {
  try {
    const { post_id, platforms, social_account_ids, caption, hashtags } = req.body;

    if (!post_id) {
      return res.status(400).json({
        success: false,
        error: 'post_id is required'
      });
    }

    // Reload database to get latest posts from other services
    db.reload();

    const post = db.getPost(post_id);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    // Validate post status - don't override scheduled or published posts
    if (post.status === 'published') {
      return res.status(400).json({
        success: false,
        error: 'Post is already published'
      });
    }

    if (post.status === 'scheduled') {
      return res.status(400).json({
        success: false,
        error: 'Post is scheduled. Please cancel the schedule first or wait for the scheduled time.'
      });
    }

    // Update post with caption/hashtags if provided
    if (caption !== undefined || hashtags !== undefined) {
      db.updatePost(post_id, {
        caption: caption !== undefined ? caption : post.caption,
        hashtags: hashtags !== undefined ? hashtags : post.hashtags,
        status: 'publishing'
      });
    } else {
      db.updatePost(post_id, { status: 'publishing' });
    }

    // Determine which platforms to publish to
    const targetPlatforms = platforms || post.platforms || [];
    if (targetPlatforms.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No target platforms specified'
      });
    }

    // Start publishing with specific account IDs
    const results = await publishingService.publishPost(post_id, targetPlatforms, {
      immediate: true,
      social_account_ids: social_account_ids || []
    });

    // Notify any SSE listeners
    notifySSEClients(post_id, {
      type: 'publish_complete',
      results
    });

    res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('[PublishRoutes] Publish now error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Schedule post for later
router.post('/schedule', async (req, res) => {
  try {
    const { post_id, platforms, social_account_ids, scheduled_at, caption, hashtags } = req.body;

    if (!post_id || !scheduled_at) {
      return res.status(400).json({
        success: false,
        error: 'post_id and scheduled_at are required'
      });
    }

    // Validate scheduled time is in the future
    const scheduleTime = new Date(scheduled_at);
    if (scheduleTime <= new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Scheduled time must be in the future'
      });
    }

    // Reload database to get latest posts from other services
    db.reload();

    const post = db.getPost(post_id);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    // Validate post status - don't override published posts
    if (post.status === 'published') {
      return res.status(400).json({
        success: false,
        error: 'Post is already published and cannot be scheduled'
      });
    }

    // If already scheduled, update the schedule time
    if (post.status === 'scheduled') {
      // Clear existing pending jobs for this post
      const existingJobs = db.getJobsByPost(post_id);
      existingJobs.forEach(job => {
        if (job.status === 'pending') {
          db.updateScheduledJob(job.id, { status: 'cancelled' });
        }
      });
    }

    // Update post
    db.updatePost(post_id, {
      caption: caption !== undefined ? caption : post.caption,
      hashtags: hashtags !== undefined ? hashtags : post.hashtags,
      scheduled_at: scheduled_at,
      status: 'scheduled'
    });

    // Create scheduled jobs with specific account IDs
    const targetPlatforms = platforms || post.platforms || [];
    const results = await publishingService.publishPost(post_id, targetPlatforms, {
      immediate: false,
      scheduledAt: scheduled_at,
      social_account_ids: social_account_ids || []
    });

    res.json({
      success: true,
      message: 'Post scheduled successfully',
      scheduled_at,
      jobs: results.jobs
    });

  } catch (error) {
    console.error('[PublishRoutes] Schedule error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get publishing status for a post
router.get('/status/:postId', (req, res) => {
  try {
    const { postId } = req.params;

    const post = db.getPost(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    const status = publishingService.getPublishingStatus(postId);

    res.json({
      success: true,
      post: {
        id: post.id,
        status: post.status,
        scheduled_at: post.scheduled_at,
        published_at: post.published_at
      },
      publishing: status
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get publishing logs for a post
router.get('/logs/:postId', (req, res) => {
  try {
    const { postId } = req.params;
    const { limit } = req.query;

    const logs = publishingService.getPublishingLogs(postId);

    res.json({
      success: true,
      logs: logs.slice(0, parseInt(limit) || 50)
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Validate post for platforms before publishing
router.post('/validate', async (req, res) => {
  try {
    const { post_id, platforms } = req.body;

    const post = db.getPost(post_id);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    const targetPlatforms = platforms || post.platforms || [];
    const validations = {};

    for (const platform of targetPlatforms) {
      // Check if platform is configured
      const isConfigured = platformsConfig.isConfigured(platform);

      // Check if account is connected
      const account = db.getSocialAccountByPlatform(post.business_id, platform);
      const hasAccount = !!account;

      // Validate post content
      let contentValidation = { valid: true, errors: [] };
      if (publishingService.validatePostForPlatform) {
        contentValidation = await publishingService.validatePostForPlatform(post, platform);
      }

      validations[platform] = {
        configured: isConfigured,
        connected: hasAccount,
        accountName: account?.account_name || null,
        content: contentValidation,
        ready: isConfigured && hasAccount && contentValidation.valid
      };
    }

    const allReady = Object.values(validations).every(v => v.ready);

    res.json({
      success: true,
      validations,
      allReady,
      readyCount: Object.values(validations).filter(v => v.ready).length,
      totalCount: targetPlatforms.length
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get rate limit status for a platform
router.get('/limits/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { business_id } = req.query;

    const account = db.getSocialAccountByPlatform(business_id || 'default', platform);
    if (!account) {
      return res.json({
        success: true,
        platform,
        connected: false,
        limits: null
      });
    }

    // Get rate limit info from platform config
    const config = platformsConfig.getPlatformConfig(platform);
    const limits = config?.rateLimits || null;

    // In production, you'd also check actual usage from the platform API
    res.json({
      success: true,
      platform,
      connected: true,
      limits,
      usage: null // Would be populated from platform API
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cancel a scheduled job
router.post('/cancel/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;

    const result = publishingService.cancelJob(jobId);

    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Retry a failed job
router.post('/retry/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const result = await publishingService.retryJob(jobId);

    res.json({
      success: true,
      result
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== SSE Endpoint for Real-time Updates ====================

router.get('/status/:postId/stream', (req, res) => {
  const { postId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial status
  const status = publishingService.getPublishingStatus(postId);
  res.write(`data: ${JSON.stringify({ type: 'status', data: status })}\n\n`);

  // Store connection
  if (!sseConnections.has(postId)) {
    sseConnections.set(postId, new Set());
  }
  sseConnections.get(postId).add(res);

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(heartbeat);
    const connections = sseConnections.get(postId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        sseConnections.delete(postId);
      }
    }
  });
});

// Helper to notify SSE clients
function notifySSEClients(postId, data) {
  const connections = sseConnections.get(postId);
  if (connections) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    connections.forEach(res => {
      try {
        res.write(message);
      } catch (e) {
        // Connection might be closed
      }
    });
  }
}

// Get scheduler status - shows pending jobs
router.get('/scheduler/status', (req, res) => {
  try {
    db.reload();
    const pendingJobs = db.getPendingJobs(100);
    const allJobs = db.data.scheduled_jobs || [];

    res.json({
      success: true,
      scheduler: {
        running: true,
        checkInterval: '1 minute',
        pendingJobsCount: pendingJobs.length,
        pendingJobs: pendingJobs.map(j => ({
          id: j.id,
          post_id: j.post_id,
          platform: j.platform,
          scheduled_at: j.scheduled_at,
          status: j.status
        })),
        totalJobs: allJobs.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manually trigger scheduler to process pending jobs
router.post('/scheduler/run', async (req, res) => {
  try {
    const schedulerService = require('../services/schedulerService');
    const result = await schedulerService.processScheduledPosts();

    res.json({
      success: true,
      message: 'Scheduler run completed',
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export the notify function for use by publishing service
router.notifySSEClients = notifySSEClients;

module.exports = router;
