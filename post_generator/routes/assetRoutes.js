const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'images');
const BACKGROUND_ENGINE_URL = 'http://localhost:3001';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = file.originalname.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filename = `${name}_${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Ensure uploads directory exists
async function ensureUploadsDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create uploads directory:', err);
  }
}
ensureUploadsDir();

/**
 * @route GET /api/assets/list
 * @desc List all local assets + background engine backgrounds
 * @query { category, limit, page }
 */
router.get('/list', async (req, res) => {
  try {
    const { category = 'all', limit = 30, page = 1 } = req.query;
    const assets = [];

    // Get local uploads
    try {
      const files = await fs.readdir(UPLOADS_DIR);
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));

      for (const file of imageFiles) {
        const stat = await fs.stat(path.join(UPLOADS_DIR, file));
        assets.push({
          id: file,
          name: file.replace(/\.[^.]+$/, '').replace(/_\d+$/, '').replace(/_/g, ' '),
          url: `/uploads/images/${file}`,
          thumbnail: `/uploads/images/${file}`,
          source: 'local',
          category: 'uploads',
          createdAt: stat.mtime.toISOString()
        });
      }
    } catch (err) {
      console.log('No local uploads or error reading:', err.message);
    }

    // Get backgrounds from background_engine
    try {
      const params = new URLSearchParams({ limit: limit, page: page });
      if (category && category !== 'all' && category !== 'uploads') {
        params.append('category', category);
      }

      console.log(`Fetching from background engine: ${BACKGROUND_ENGINE_URL}/api/backgrounds/list?${params}`);
      const bgResponse = await fetch(`${BACKGROUND_ENGINE_URL}/api/backgrounds/list?${params}`);
      const bgData = await bgResponse.json();
      console.log('Background engine response:', bgData.success, 'count:', bgData.backgrounds?.length || 0);

      if (bgData.success && bgData.backgrounds) {
        for (const bg of bgData.backgrounds) {
          // Ensure URLs are fully qualified with background engine host
          let imageUrl = bg.location?.url || `${BACKGROUND_ENGINE_URL}/api/backgrounds/image/${bg.imagePath}`;
          if (imageUrl.startsWith('/')) {
            imageUrl = `${BACKGROUND_ENGINE_URL}${imageUrl}`;
          }

          assets.push({
            id: bg.id || bg.filename,
            name: bg.prompt || bg.description || bg.filename,
            url: imageUrl,
            thumbnail: imageUrl,
            source: 'background_engine',
            category: bg.category || 'general',
            occasion: bg.occasion,
            createdAt: bg.createdAt
          });
        }
      }
    } catch (err) {
      console.error('Background engine error:', err.message);
    }

    // Sort by date (newest first)
    assets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Filter by category if needed
    let filteredAssets = assets;
    if (category && category !== 'all') {
      if (category === 'uploads') {
        filteredAssets = assets.filter(a => a.source === 'local');
      } else {
        filteredAssets = assets.filter(a => a.category === category || a.source === 'local');
      }
    }

    // Paginate
    const startIdx = (parseInt(page) - 1) * parseInt(limit);
    const paginatedAssets = filteredAssets.slice(startIdx, startIdx + parseInt(limit));

    res.json({
      success: true,
      assets: paginatedAssets,
      total: filteredAssets.length,
      page: parseInt(page),
      limit: parseInt(limit),
      hasMore: startIdx + paginatedAssets.length < filteredAssets.length
    });
  } catch (error) {
    console.error('List assets error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/assets/search
 * @desc Search assets from local + background engine
 * @query { q, limit }
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ success: false, error: 'Search query (q) is required' });
    }

    const searchTerm = q.toLowerCase();
    const results = [];

    // Search local uploads by filename
    try {
      const files = await fs.readdir(UPLOADS_DIR);
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));

      for (const file of imageFiles) {
        if (file.toLowerCase().includes(searchTerm)) {
          const stat = await fs.stat(path.join(UPLOADS_DIR, file));
          results.push({
            id: file,
            name: file.replace(/\.[^.]+$/, '').replace(/_\d+$/, '').replace(/_/g, ' '),
            url: `/uploads/images/${file}`,
            thumbnail: `/uploads/images/${file}`,
            source: 'local',
            category: 'uploads',
            createdAt: stat.mtime.toISOString()
          });
        }
      }
    } catch (err) {
      console.log('Error searching local uploads:', err.message);
    }

    // Search background_engine
    try {
      const bgResponse = await fetch(`${BACKGROUND_ENGINE_URL}/api/backgrounds/search?q=${encodeURIComponent(q)}&limit=${limit}`);
      const bgData = await bgResponse.json();

      if (bgData.success && bgData.results) {
        for (const bg of bgData.results) {
          // Ensure URLs are fully qualified with background engine host
          let imageUrl = bg.location?.url || `${BACKGROUND_ENGINE_URL}/api/backgrounds/image/${bg.imagePath}`;
          if (imageUrl.startsWith('/')) {
            imageUrl = `${BACKGROUND_ENGINE_URL}${imageUrl}`;
          }

          results.push({
            id: bg.id || bg.filename,
            name: bg.prompt || bg.description || bg.filename,
            url: imageUrl,
            thumbnail: imageUrl,
            source: 'background_engine',
            category: bg.category || 'general',
            occasion: bg.occasion,
            createdAt: bg.createdAt
          });
        }
      }
    } catch (err) {
      console.log('Background engine search not available:', err.message);
    }

    // Sort by relevance (exact matches first) then by date
    results.sort((a, b) => {
      const aExact = a.name.toLowerCase().includes(searchTerm) ? 1 : 0;
      const bExact = b.name.toLowerCase().includes(searchTerm) ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({
      success: true,
      query: q,
      results: results.slice(0, parseInt(limit)),
      total: results.length
    });
  } catch (error) {
    console.error('Search assets error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route POST /api/assets/upload
 * @desc Upload a new asset
 */
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    const asset = {
      id: req.file.filename,
      name: req.body.name || req.file.originalname.replace(/\.[^.]+$/, ''),
      url: `/uploads/images/${req.file.filename}`,
      thumbnail: `/uploads/images/${req.file.filename}`,
      source: 'local',
      category: req.body.category || 'uploads',
      createdAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Asset uploaded successfully',
      asset
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route DELETE /api/assets/:id
 * @desc Delete a local asset
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(UPLOADS_DIR, id);

    // Security check - ensure file is in uploads directory
    if (!filePath.startsWith(UPLOADS_DIR)) {
      return res.status(403).json({ success: false, error: 'Invalid file path' });
    }

    await fs.unlink(filePath);

    res.json({
      success: true,
      message: 'Asset deleted successfully'
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    console.error('Delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
