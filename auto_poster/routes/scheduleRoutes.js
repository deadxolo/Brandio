const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const { v4: uuidv4 } = require('uuid');

// Get scheduled posts for a business
router.get('/:businessId', (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const posts = db.getPostsByBusiness(req.params.businessId, status || 'scheduled', parseInt(limit));

    res.json({
      success: true,
      posts,
      count: posts.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all scheduled posts (upcoming)
router.get('/', (req, res) => {
  try {
    const posts = db.getScheduledPosts();

    res.json({
      success: true,
      posts,
      count: posts.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single scheduled post
router.get('/item/:id', (req, res) => {
  try {
    const post = db.getPost(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Get associated jobs
    const jobs = db.db.prepare(`
      SELECT * FROM scheduled_jobs WHERE post_id = ?
    `).all(req.params.id);

    res.json({
      success: true,
      post,
      jobs
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Schedule a post (create scheduled jobs)
router.post('/', (req, res) => {
  try {
    const { post_id, platforms, scheduled_at } = req.body;

    if (!post_id || !scheduled_at) {
      return res.status(400).json({
        success: false,
        error: 'post_id and scheduled_at are required'
      });
    }

    const post = db.getPost(post_id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Get platforms to schedule for
    const targetPlatforms = platforms || post.platforms;

    // Create scheduled jobs for each platform
    const jobs = [];
    targetPlatforms.forEach(platform => {
      // Find social account for this platform
      const account = db.db.prepare(`
        SELECT * FROM social_accounts
        WHERE business_id = ? AND platform = ? AND is_active = 1
      `).get(post.business_id, platform);

      const job = db.createScheduledJob({
        post_id,
        platform,
        social_account_id: account?.id || null,
        scheduled_at,
        status: 'pending'
      });

      jobs.push(job);
    });

    // Update post status
    db.updatePost(post_id, {
      status: 'scheduled',
      scheduled_at
    });

    res.status(201).json({
      success: true,
      message: 'Post scheduled successfully',
      jobs,
      scheduledAt: scheduled_at
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reschedule a post
router.post('/:id/reschedule', (req, res) => {
  try {
    const { scheduled_at } = req.body;

    if (!scheduled_at) {
      return res.status(400).json({
        success: false,
        error: 'scheduled_at is required'
      });
    }

    const post = db.getPost(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Update post
    db.updatePost(req.params.id, {
      scheduled_at,
      status: 'scheduled'
    });

    // Update pending jobs
    db.db.prepare(`
      UPDATE scheduled_jobs
      SET scheduled_at = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP
      WHERE post_id = ? AND status IN ('pending', 'failed')
    `).run(scheduled_at, req.params.id);

    res.json({
      success: true,
      message: 'Post rescheduled successfully',
      scheduledAt: scheduled_at
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel scheduled post
router.post('/:id/cancel', (req, res) => {
  try {
    const post = db.getPost(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Update post status back to draft
    db.updatePost(req.params.id, {
      status: 'draft',
      scheduled_at: null
    });

    // Delete pending jobs
    db.db.prepare(`
      DELETE FROM scheduled_jobs WHERE post_id = ? AND status = 'pending'
    `).run(req.params.id);

    res.json({
      success: true,
      message: 'Schedule cancelled'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete scheduled post
router.delete('/:id', (req, res) => {
  try {
    const post = db.getPost(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Delete jobs first
    db.db.prepare('DELETE FROM scheduled_jobs WHERE post_id = ?').run(req.params.id);

    // Delete post
    db.deletePost(req.params.id);

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get schedule statistics
router.get('/stats/:businessId', (req, res) => {
  try {
    const pending = db.db.prepare(`
      SELECT COUNT(*) as count FROM posts
      WHERE business_id = ? AND status = 'scheduled'
    `).get(req.params.businessId);

    const published = db.db.prepare(`
      SELECT COUNT(*) as count FROM posts
      WHERE business_id = ? AND status = 'published'
    `).get(req.params.businessId);

    const failed = db.db.prepare(`
      SELECT COUNT(*) as count FROM posts
      WHERE business_id = ? AND status = 'failed'
    `).get(req.params.businessId);

    const upcoming = db.db.prepare(`
      SELECT * FROM posts
      WHERE business_id = ? AND status = 'scheduled'
      ORDER BY scheduled_at ASC
      LIMIT 5
    `).all(req.params.businessId).map(p => ({
      ...p,
      platforms: JSON.parse(p.platforms || '[]')
    }));

    res.json({
      success: true,
      stats: {
        pending: pending.count,
        published: published.count,
        failed: failed.count
      },
      upcoming
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
