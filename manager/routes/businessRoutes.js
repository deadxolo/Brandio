const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/logos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and SVG are allowed.'));
    }
  }
});

// Demo user ID (in production, this would come from auth)
const DEMO_USER_ID = 'user_demo_001';

// Get all businesses for current user
router.get('/', (req, res) => {
  try {
    const businesses = db.getBusinessesByUser(DEMO_USER_ID);
    res.json({
      success: true,
      businesses,
      count: businesses.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new business
router.post('/', upload.single('logo'), (req, res) => {
  try {
    const { name, description, address, phone, email, website, industry } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Business name is required' });
    }

    // Parse JSON fields if they're strings
    let social_links = req.body.social_links;
    let brand_colors = req.body.brand_colors;
    let fonts = req.body.fonts;

    if (typeof social_links === 'string') {
      try { social_links = JSON.parse(social_links); } catch { social_links = {}; }
    }
    if (typeof brand_colors === 'string') {
      try { brand_colors = JSON.parse(brand_colors); } catch { brand_colors = {}; }
    }
    if (typeof fonts === 'string') {
      try { fonts = JSON.parse(fonts); } catch { fonts = {}; }
    }

    const businessData = {
      user_id: DEMO_USER_ID,
      name,
      description: description || null,
      logo: req.file ? `/uploads/logos/${req.file.filename}` : null,
      address: address || null,
      phone: phone || null,
      email: email || null,
      website: website || null,
      industry: industry || null,
      social_links: social_links || {},
      brand_colors: brand_colors || { primary: '#3B82F6', secondary: '#1E40AF', accent: '#F59E0B' },
      fonts: fonts || { heading: 'Inter', body: 'Inter' }
    };

    const business = db.createBusiness(businessData);

    res.status(201).json({
      success: true,
      message: 'Business created successfully',
      business
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single business
router.get('/:id', (req, res) => {
  try {
    const business = db.getBusiness(req.params.id);

    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    // Get additional stats
    const stats = db.getDashboardStats(req.params.id);
    const socialAccounts = db.getSocialAccountsByBusiness(req.params.id);

    res.json({
      success: true,
      business,
      stats,
      socialAccounts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update business
router.put('/:id', upload.single('logo'), (req, res) => {
  try {
    const existing = db.getBusiness(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    const updateData = { ...req.body };

    // Parse JSON fields if they're strings
    if (typeof updateData.social_links === 'string') {
      try { updateData.social_links = JSON.parse(updateData.social_links); } catch { delete updateData.social_links; }
    }
    if (typeof updateData.brand_colors === 'string') {
      try { updateData.brand_colors = JSON.parse(updateData.brand_colors); } catch { delete updateData.brand_colors; }
    }
    if (typeof updateData.fonts === 'string') {
      try { updateData.fonts = JSON.parse(updateData.fonts); } catch { delete updateData.fonts; }
    }

    // Handle logo upload
    if (req.file) {
      updateData.logo = `/uploads/logos/${req.file.filename}`;

      // Delete old logo if exists
      if (existing.logo) {
        const oldLogoPath = path.join(__dirname, '..', existing.logo);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }
    }

    const business = db.updateBusiness(req.params.id, updateData);

    res.json({
      success: true,
      message: 'Business updated successfully',
      business
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete business (soft delete)
router.delete('/:id', (req, res) => {
  try {
    const existing = db.getBusiness(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    db.deleteBusiness(req.params.id);

    res.json({
      success: true,
      message: 'Business deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update brand settings
router.put('/:id/brand', (req, res) => {
  try {
    const existing = db.getBusiness(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    const { brand_colors, fonts } = req.body;
    const updateData = {};

    if (brand_colors) updateData.brand_colors = brand_colors;
    if (fonts) updateData.fonts = fonts;

    const business = db.updateBusiness(req.params.id, updateData);

    res.json({
      success: true,
      message: 'Brand settings updated',
      business
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update social links
router.put('/:id/social-links', (req, res) => {
  try {
    const existing = db.getBusiness(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    const { social_links } = req.body;
    const business = db.updateBusiness(req.params.id, { social_links });

    res.json({
      success: true,
      message: 'Social links updated',
      business
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
