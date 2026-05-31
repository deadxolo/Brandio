const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for asset uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.type || 'image';
    const businessId = req.params.businessId || req.body.business_id || 'general';
    const uploadDir = path.join(__dirname, `../uploads/${type}s/${businessId}`);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${baseName}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
      'font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/font-woff'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Upload asset
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { business_id, name, type = 'image' } = req.body;

    if (!business_id) {
      return res.status(400).json({ success: false, error: 'Business ID is required' });
    }

    // Move file to correct business folder if it was saved to 'general'
    const uploadsDir = path.join(__dirname, '../uploads');
    const correctDir = path.join(uploadsDir, `${type}s`, business_id);
    let finalPath = req.file.path;
    let finalFilename = req.file.filename;

    // Check if file was saved to wrong location (general folder)
    if (req.file.path.includes('/general/')) {
      // Create correct directory
      if (!fs.existsSync(correctDir)) {
        fs.mkdirSync(correctDir, { recursive: true });
      }
      // Move file to correct location
      const newPath = path.join(correctDir, req.file.filename);
      fs.renameSync(req.file.path, newPath);
      finalPath = newPath;
    }

    // Get image dimensions if it's an image
    let metadata = {};
    if (type === 'image' || type === 'background') {
      metadata = {
        originalName: req.file.originalname
      };
    }

    const asset = db.createAsset({
      business_id,
      name: name || req.file.originalname,
      type,
      file_path: finalPath,
      file_url: `/uploads/${type}s/${business_id}/${finalFilename}`,
      mime_type: req.file.mimetype,
      file_size: req.file.size,
      metadata
    });

    res.status(201).json({
      success: true,
      message: 'Asset uploaded successfully',
      asset
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get assets by business
router.get('/:businessId', (req, res) => {
  try {
    const { type } = req.query;
    const assets = db.getAssetsByBusiness(req.params.businessId, type || null);

    res.json({
      success: true,
      assets,
      count: assets.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single asset
router.get('/item/:id', (req, res) => {
  try {
    const asset = db.getAsset(req.params.id);

    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    res.json({
      success: true,
      asset
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete asset
router.delete('/:id', (req, res) => {
  try {
    const asset = db.getAsset(req.params.id);

    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    // Delete file from disk
    if (asset.file_path && fs.existsSync(asset.file_path)) {
      fs.unlinkSync(asset.file_path);
    }

    db.deleteAsset(req.params.id);

    res.json({
      success: true,
      message: 'Asset deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
