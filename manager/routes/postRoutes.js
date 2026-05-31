const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const fs = require('fs');
const path = require('path');

// Get all posts for a business
router.get('/:businessId', (req, res) => {
  try {
    // Reload to get latest data from other services
    db.reload();
    const { status, limit = 50 } = req.query;
    let posts = db.getPostsByBusiness(req.params.businessId, status, parseInt(limit));

    // Filter out posts with missing image files
    posts = posts.filter(post => {
      if (post.image_url && post.image_url.startsWith('/uploads/')) {
        const filepath = path.join(__dirname, '..', post.image_url);
        return fs.existsSync(filepath);
      }
      return true; // Keep posts without images or with external URLs
    });

    res.json({
      success: true,
      posts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single post
router.get('/item/:id', (req, res) => {
  try {
    db.reload();
    const post = db.getPost(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.json({
      success: true,
      post
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create post
router.post('/', (req, res) => {
  try {
    const { business_id, template_id, title, content, caption, hashtags, platforms, image, data, platform, status } = req.body;

    // If image is base64, save it to disk
    let image_url = null;
    if (image && image.startsWith('data:image')) {
      const uploadsDir = path.join(__dirname, '../uploads/posts');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
      const filepath = path.join(uploadsDir, filename);

      fs.writeFileSync(filepath, buffer);
      image_url = `/uploads/posts/${filename}`;
    }

    const post = db.createPost({
      business_id,
      template_id,
      title: title || `Post ${new Date().toLocaleDateString()}`,
      content: content || data || {},
      caption,
      hashtags,
      platforms: platforms || (platform ? [platform] : ['instagram']),
      image_url,
      status: status || 'draft'
    });

    res.json({
      success: true,
      post
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update post
router.put('/:id', (req, res) => {
  try {
    const { title, caption, hashtags, platforms, status, scheduled_at } = req.body;

    const post = db.updatePost(req.params.id, {
      title,
      caption,
      hashtags,
      platforms,
      status,
      scheduled_at
    });

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.json({
      success: true,
      post
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get post image by post ID (returns image binary)
router.get('/image/:id', (req, res) => {
  try {
    const post = db.getPost(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (!post.image_url) {
      return res.status(404).json({ success: false, error: 'Post has no image' });
    }

    const filepath = path.join(__dirname, '..', post.image_url);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, error: 'Image file not found' });
    }

    // Determine content type
    const ext = path.extname(filepath).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'image/png');
    res.sendFile(filepath);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete post
router.delete('/:id', (req, res) => {
  try {
    // Reload database to ensure we have the latest state
    db.reload();

    const post = db.getPost(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Delete associated image file if exists
    if (post.image_url && post.image_url.startsWith('/uploads/')) {
      const filepath = path.join(__dirname, '..', post.image_url);
      if (fs.existsSync(filepath)) {
        try {
          fs.unlinkSync(filepath);
        } catch (e) {
          console.warn('Could not delete image file:', e.message);
        }
      }
    }

    db.deletePost(req.params.id);

    res.json({
      success: true,
      message: 'Post deleted'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cleanup orphaned posts (posts with missing images)
router.post('/cleanup', (req, res) => {
  try {
    db.reload();
    const allPosts = db.data.posts || [];
    let deletedCount = 0;
    const deletedIds = [];

    for (const post of allPosts) {
      if (post.image_url && post.image_url.startsWith('/uploads/')) {
        const filepath = path.join(__dirname, '..', post.image_url);
        if (!fs.existsSync(filepath)) {
          // Image is missing, delete the post
          db.deletePost(post.id);
          deletedIds.push(post.id);
          deletedCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} orphaned posts`,
      deletedCount,
      deletedIds
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
