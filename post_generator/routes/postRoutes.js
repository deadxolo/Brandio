const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const requireBusinessOwnership = require('../../shared/middleware/ownership');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Enforce business ownership for authenticated users (lenient: skips service/dev calls)
router.param('businessId', requireBusinessOwnership.param(db));
router.use(requireBusinessOwnership(db));

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `post_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Get posts for a business
router.get('/:businessId', (req, res) => {
  try {
    const { status, limit } = req.query;
    const posts = db.getPostsByBusiness(
      req.params.businessId,
      status || null,
      parseInt(limit) || 50
    );

    res.json({
      success: true,
      posts,
      count: posts.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single post
router.get('/item/:id', (req, res) => {
  try {
    const post = db.getPost(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Get template if exists
    let template = null;
    if (post.template_id) {
      template = db.getTemplate(post.template_id);
    }

    res.json({
      success: true,
      post,
      template
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create post
router.post('/', upload.single('image'), (req, res) => {
  try {
    const {
      business_id,
      template_id,
      title,
      content,
      caption,
      hashtags,
      platforms,
      status,
      scheduled_at
    } = req.body;

    if (!business_id) {
      return res.status(400).json({
        success: false,
        error: 'business_id is required'
      });
    }

    // Parse JSON fields
    let parsedContent = content;
    let parsedPlatforms = platforms;

    if (typeof content === 'string') {
      try { parsedContent = JSON.parse(content); } catch { parsedContent = {}; }
    }
    if (typeof platforms === 'string') {
      try { parsedPlatforms = JSON.parse(platforms); } catch { parsedPlatforms = []; }
    }

    const post = db.createPost({
      business_id,
      template_id: template_id || null,
      title,
      content: parsedContent || {},
      caption,
      hashtags,
      platforms: parsedPlatforms || ['instagram'],
      image_url: req.file ? `/uploads/images/${req.file.filename}` : null,
      status: status || 'draft',
      scheduled_at: scheduled_at || null
    });

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update post
router.put('/:id', upload.single('image'), (req, res) => {
  try {
    const existing = db.getPost(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const updateData = { ...req.body };

    // Parse JSON fields
    if (typeof updateData.content === 'string') {
      try { updateData.content = JSON.parse(updateData.content); } catch { delete updateData.content; }
    }
    if (typeof updateData.platforms === 'string') {
      try { updateData.platforms = JSON.parse(updateData.platforms); } catch { delete updateData.platforms; }
    }

    // Handle image upload
    if (req.file) {
      updateData.image_url = `/uploads/images/${req.file.filename}`;

      // Delete old image if exists
      if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '..', existing.image_url);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
    }

    const post = db.updatePost(req.params.id, updateData);

    res.json({
      success: true,
      message: 'Post updated successfully',
      post
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete post
router.delete('/:id', (req, res) => {
  try {
    const existing = db.getPost(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Delete associated image if exists
    if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, '..', existing.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    db.deletePost(req.params.id);

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update post status
router.patch('/:id/status', (req, res) => {
  try {
    const { status, scheduled_at } = req.body;

    if (!['draft', 'scheduled', 'published', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const existing = db.getPost(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const updateData = { status };

    if (status === 'scheduled' && scheduled_at) {
      updateData.scheduled_at = scheduled_at;
    }

    if (status === 'published') {
      updateData.published_at = new Date().toISOString();
    }

    const post = db.updatePost(req.params.id, updateData);

    res.json({
      success: true,
      message: 'Post status updated',
      post
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Duplicate post
router.post('/:id/duplicate', (req, res) => {
  try {
    const existing = db.getPost(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const post = db.createPost({
      business_id: existing.business_id,
      template_id: existing.template_id,
      title: `${existing.title || 'Untitled'} (Copy)`,
      content: existing.content,
      caption: existing.caption,
      hashtags: existing.hashtags,
      platforms: existing.platforms,
      status: 'draft'
    });

    res.status(201).json({
      success: true,
      message: 'Post duplicated successfully',
      post
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
