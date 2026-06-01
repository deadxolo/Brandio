const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const requireBusinessOwnership = require('../../shared/middleware/ownership');
const { validateBody } = require('../../shared/middleware/validate');
const { v4: uuidv4 } = require('uuid');

// Enforce business ownership for authenticated users (lenient: skips service/dev calls)
router.param('businessId', requireBusinessOwnership.param(db));
router.use(requireBusinessOwnership(db));

// Get templates for a business
router.get('/:businessId', (req, res) => {
  try {
    const { platform } = req.query;
    const templates = db.getTemplatesByBusiness(req.params.businessId, platform || null);

    res.json({
      success: true,
      templates,
      count: templates.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single template
router.get('/item/:id', (req, res) => {
  try {
    const template = db.getTemplate(req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create template
router.post('/', validateBody({
  business_id: { required: true, type: 'string' },
  name: { required: true, type: 'string', maxLength: 200 },
  platform: { required: true, type: 'string' }
}), (req, res) => {
  try {
    const {
      business_id,
      name,
      description,
      platform,
      content_type,
      width,
      height,
      elements,
      background_type,
      background_value,
      placeholders,
      thumbnail
    } = req.body;

    if (!business_id || !name || !platform) {
      return res.status(400).json({
        success: false,
        error: 'business_id, name, and platform are required'
      });
    }

    const template = db.createTemplate({
      business_id,
      name,
      description,
      platform,
      content_type: content_type || 'post',
      width: width || 1080,
      height: height || 1080,
      elements: elements || [],
      background_type: background_type || 'color',
      background_value: background_value || '#ffffff',
      placeholders: placeholders || {},
      thumbnail: thumbnail || null
    });

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      template
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update template
router.put('/:id', (req, res) => {
  try {
    const existing = db.getTemplate(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const template = db.updateTemplate(req.params.id, req.body);

    res.json({
      success: true,
      message: 'Template updated successfully',
      template
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete template
router.delete('/:id', (req, res) => {
  try {
    const existing = db.getTemplate(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    db.deleteTemplate(req.params.id);

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Duplicate template
router.post('/:id/duplicate', (req, res) => {
  try {
    const existing = db.getTemplate(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const template = db.createTemplate({
      business_id: existing.business_id,
      name: `${existing.name} (Copy)`,
      description: existing.description,
      platform: existing.platform,
      content_type: existing.content_type,
      width: existing.width,
      height: existing.height,
      elements: existing.elements,
      background_type: existing.background_type,
      background_value: existing.background_value,
      placeholders: existing.placeholders || {},
      thumbnail: existing.thumbnail || null
    });

    res.status(201).json({
      success: true,
      message: 'Template duplicated successfully',
      template
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get placeholders for a template
router.get('/:id/placeholders', (req, res) => {
  try {
    const template = db.getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({
      success: true,
      placeholders: template.placeholders || {},
      count: Object.keys(template.placeholders || {}).length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get default elements for a template type
router.get('/defaults/:platform/:contentType', (req, res) => {
  const { platform, contentType } = req.params;

  // Default element configurations based on platform and content type
  const defaults = {
    instagram: {
      post: {
        width: 1080,
        height: 1080,
        elements: [
          {
            id: 'logo',
            type: 'image',
            name: 'Logo',
            x: 40,
            y: 40,
            width: 80,
            height: 80,
            locked: false,
            visible: true,
            placeholder: true
          },
          {
            id: 'main_text',
            type: 'text',
            name: 'Main Text',
            x: 540,
            y: 480,
            width: 900,
            text: 'Your Message Here',
            fontSize: 64,
            fontFamily: 'Inter',
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            locked: false,
            visible: true
          },
          {
            id: 'subtitle',
            type: 'text',
            name: 'Subtitle',
            x: 540,
            y: 560,
            width: 800,
            text: 'Add your subtitle',
            fontSize: 32,
            fontFamily: 'Inter',
            fontWeight: 'normal',
            color: '#ffffff',
            textAlign: 'center',
            locked: false,
            visible: true
          },
          {
            id: 'cta',
            type: 'text',
            name: 'Call to Action',
            x: 540,
            y: 950,
            width: 400,
            text: 'www.example.com',
            fontSize: 24,
            fontFamily: 'Inter',
            fontWeight: 'normal',
            color: '#ffffff',
            textAlign: 'center',
            locked: false,
            visible: true
          }
        ]
      },
      story: {
        width: 1080,
        height: 1920,
        elements: [
          {
            id: 'logo',
            type: 'image',
            name: 'Logo',
            x: 40,
            y: 80,
            width: 100,
            height: 100,
            locked: false,
            visible: true,
            placeholder: true
          },
          {
            id: 'main_text',
            type: 'text',
            name: 'Main Text',
            x: 540,
            y: 960,
            width: 900,
            text: 'Your Story Message',
            fontSize: 72,
            fontFamily: 'Inter',
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            locked: false,
            visible: true
          }
        ]
      }
    },
    facebook: {
      post: {
        width: 1200,
        height: 630,
        elements: [
          {
            id: 'logo',
            type: 'image',
            name: 'Logo',
            x: 40,
            y: 40,
            width: 80,
            height: 80,
            locked: false,
            visible: true,
            placeholder: true
          },
          {
            id: 'main_text',
            type: 'text',
            name: 'Main Text',
            x: 600,
            y: 280,
            width: 1000,
            text: 'Your Facebook Post',
            fontSize: 56,
            fontFamily: 'Inter',
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            locked: false,
            visible: true
          },
          {
            id: 'subtitle',
            type: 'text',
            name: 'Subtitle',
            x: 600,
            y: 360,
            width: 800,
            text: 'Add your message here',
            fontSize: 28,
            fontFamily: 'Inter',
            fontWeight: 'normal',
            color: '#ffffff',
            textAlign: 'center',
            locked: false,
            visible: true
          }
        ]
      }
    },
    twitter: {
      post: {
        width: 1200,
        height: 675,
        elements: [
          {
            id: 'main_text',
            type: 'text',
            name: 'Main Text',
            x: 600,
            y: 300,
            width: 1000,
            text: 'Your Tweet Message',
            fontSize: 48,
            fontFamily: 'Inter',
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            locked: false,
            visible: true
          }
        ]
      }
    },
    linkedin: {
      post: {
        width: 1200,
        height: 627,
        elements: [
          {
            id: 'logo',
            type: 'image',
            name: 'Logo',
            x: 40,
            y: 40,
            width: 100,
            height: 100,
            locked: false,
            visible: true,
            placeholder: true
          },
          {
            id: 'main_text',
            type: 'text',
            name: 'Main Text',
            x: 600,
            y: 280,
            width: 1000,
            text: 'Professional Content',
            fontSize: 52,
            fontFamily: 'Inter',
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            locked: false,
            visible: true
          }
        ]
      }
    },
    whatsapp: {
      status: {
        width: 1080,
        height: 1920,
        elements: [
          {
            id: 'main_text',
            type: 'text',
            name: 'Main Text',
            x: 540,
            y: 960,
            width: 900,
            text: 'WhatsApp Status',
            fontSize: 64,
            fontFamily: 'Inter',
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            locked: false,
            visible: true
          }
        ]
      }
    }
  };

  const platformDefaults = defaults[platform];
  if (!platformDefaults) {
    return res.status(404).json({
      success: false,
      error: 'Platform not found'
    });
  }

  const contentDefaults = platformDefaults[contentType];
  if (!contentDefaults) {
    return res.status(404).json({
      success: false,
      error: 'Content type not found for this platform'
    });
  }

  res.json({
    success: true,
    defaults: contentDefaults
  });
});

module.exports = router;
