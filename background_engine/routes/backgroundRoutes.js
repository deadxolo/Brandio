const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const geminiService = require('../services/geminiService');
const storageService = require('../services/storageService');
const config = require('../config/config');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.storage.backgroundsPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = req.body.name || 'uploaded_background';
    const sanitized = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
    const filename = `${sanitized}_${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG, and WebP are allowed.'));
    }
  }
});

/**
 * @route POST /api/backgrounds/generate
 * @desc Generate a new background using Gemini AI
 * @body { prompt, category, style, width, height, forceNew }
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      prompt,
      category = 'general',
      style = 'vibrant',
      width = config.image.defaultWidth,
      height = config.image.defaultHeight,
      forceNew = false,
      occasion = ''
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    // Check for existing backgrounds if not forcing new generation
    if (!forceNew) {
      const existing = await storageService.searchBackgrounds(prompt, { limit: 5 });
      if (existing.length > 0) {
        return res.json({
          success: true,
          type: 'existing',
          message: 'Found existing backgrounds matching your query',
          suggestions: existing,
          generateNewUrl: '/api/backgrounds/generate',
          generateNewBody: { ...req.body, forceNew: true }
        });
      }
    }

    // Generate new background with Gemini
    const result = await geminiService.generateBackground(prompt, {
      width,
      height,
      style,
      category
    });

    // Save the generated background
    const saved = await storageService.saveBackground({
      imageData: result.imageData,
      prompt,
      description: result.description,
      metadata: result.metadata,
      category,
      occasion: occasion || detectOccasion(prompt),
      tags: []
    });

    res.json({
      success: true,
      type: 'generated',
      message: 'New background generated successfully',
      background: saved
    });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/backgrounds/upload
 * @desc Upload a background image from gallery
 * @body { name, category, occasion, description, tags } + file
 */
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    const {
      name = 'Uploaded Background',
      category = 'general',
      occasion = '',
      description = '',
      tags = ''
    } = req.body;

    const filename = path.basename(req.file.filename, path.extname(req.file.filename));
    const imagePath = req.file.filename;

    // Read the uploaded file to get base64 for metadata
    const imageBuffer = await fs.readFile(req.file.path);

    // Create metadata JSON
    const backgroundMeta = {
      id: uuidv4(),
      filename,
      imagePath,
      prompt: name,
      description: description || name,
      category,
      occasion,
      tags: tags ? tags.split(',').map(t => t.trim().toLowerCase()) : [],
      metadata: {
        width: 0, // Could use sharp to get dimensions
        height: 0,
        mimeType: req.file.mimetype,
        size: req.file.size,
        createdAt: new Date().toISOString(),
        source: 'upload'
      },
      location: {
        absolute: req.file.path,
        relative: `./backgrounds/${imagePath}`,
        url: `/api/backgrounds/image/${imagePath}`
      }
    };

    // Save JSON metadata
    const jsonPath = path.join(config.storage.backgroundsPath, `${filename}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(backgroundMeta, null, 2));

    // Add to index
    await storageService.init();
    storageService.index.backgrounds.push({
      id: backgroundMeta.id,
      filename,
      imagePath, // Include full filename with extension
      prompt: name,
      category,
      occasion,
      tags: backgroundMeta.tags,
      createdAt: backgroundMeta.metadata.createdAt
    });
    await storageService.saveIndex();

    console.log(`Background uploaded: ${filename}`);

    res.json({
      success: true,
      message: 'Background uploaded successfully',
      background: backgroundMeta
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/backgrounds/search
 * @desc Search for existing backgrounds
 * @query { q, category, occasion, limit }
 */
router.get('/search', async (req, res) => {
  try {
    const { q, category, occasion, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required'
      });
    }

    const results = await storageService.searchBackgrounds(q, {
      category,
      occasion,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      query: q,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/backgrounds/list
 * @desc Get all backgrounds with pagination
 * @query { page, limit, category, sortBy, order }
 */
router.get('/list', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    const result = await storageService.getAllBackgrounds({
      page: parseInt(page),
      limit: parseInt(limit),
      category,
      sortBy,
      order
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/backgrounds/:id
 * @desc Get a specific background by ID or filename
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const background = await storageService.getBackground(id);

    if (!background) {
      return res.status(404).json({
        success: false,
        error: 'Background not found'
      });
    }

    res.json({
      success: true,
      background
    });
  } catch (error) {
    console.error('Get background error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/backgrounds/image/:filename
 * @desc Serve background image file
 */
router.get('/image/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const imagePath = path.resolve(storageService.getImagePath(filename));

    res.sendFile(imagePath, (err) => {
      if (err) {
        res.status(404).json({
          success: false,
          error: 'Image not found'
        });
      }
    });
  } catch (error) {
    console.error('Image serve error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/backgrounds/occasion/:occasion
 * @desc Get backgrounds by occasion/festival
 */
router.get('/occasion/:occasion', async (req, res) => {
  try {
    const { occasion } = req.params;
    const backgrounds = await storageService.getByOccasion(occasion);

    res.json({
      success: true,
      occasion,
      count: backgrounds.length,
      backgrounds
    });
  } catch (error) {
    console.error('Occasion fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/backgrounds/cleanup
 * @desc Clean up orphaned background metadata (JSON files without corresponding images)
 */
router.post('/cleanup', async (req, res) => {
  try {
    const fsSync = require('fs');
    const backgroundsPath = config.storage.backgroundsPath;
    const files = await fs.readdir(backgroundsPath);

    let cleanedCount = 0;
    const cleanedFiles = [];

    for (const file of files) {
      if (file.endsWith('.json') && file !== 'backgrounds_index.json') {
        const jsonPath = path.join(backgroundsPath, file);
        const jsonContent = JSON.parse(await fs.readFile(jsonPath, 'utf8'));

        // Check if the referenced image exists
        if (jsonContent.imagePath) {
          const imagePath = path.join(backgroundsPath, jsonContent.imagePath);
          if (!fsSync.existsSync(imagePath)) {
            // Image doesn't exist, remove the orphaned JSON
            await fs.unlink(jsonPath);
            cleanedFiles.push(file);
            cleanedCount++;
            console.log(`Cleaned up orphaned metadata: ${file}`);
          }
        }
      }
    }

    // Also update the index to remove orphaned entries
    await storageService.init();
    const beforeCount = storageService.index.backgrounds.length;
    storageService.index.backgrounds = storageService.index.backgrounds.filter(bg => {
      if (bg.imagePath) {
        const imagePath = path.join(backgroundsPath, bg.imagePath);
        return fsSync.existsSync(imagePath);
      }
      return true;
    });
    await storageService.saveIndex();
    const indexCleaned = beforeCount - storageService.index.backgrounds.length;

    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} orphaned metadata files and ${indexCleaned} index entries`,
      cleanedCount,
      indexCleaned,
      cleanedFiles
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/backgrounds/:id
 * @desc Delete a background
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await storageService.deleteBackground(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Background not found'
      });
    }

    res.json({
      success: true,
      message: 'Background deleted successfully'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/backgrounds/suggestions
 * @desc Get autocomplete suggestions
 * @query { q }
 */
router.get('/suggest/autocomplete', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({
        success: true,
        suggestions: []
      });
    }

    const suggestions = await storageService.getSuggestions(q);

    res.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/backgrounds/analyze
 * @desc Analyze an existing image and generate metadata
 * @body { imagePath }
 */
router.post('/analyze', async (req, res) => {
  try {
    const { imagePath } = req.body;

    if (!imagePath) {
      return res.status(400).json({
        success: false,
        error: 'Image path is required'
      });
    }

    const analysis = await geminiService.analyzeBackground(imagePath);

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/backgrounds/improve-prompt
 * @desc Get improved prompt suggestions
 * @body { prompt }
 */
router.post('/improve-prompt', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    const suggestions = await geminiService.suggestPromptImprovements(prompt);

    res.json({
      success: true,
      original: prompt,
      suggestions
    });
  } catch (error) {
    console.error('Improve prompt error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/backgrounds/categories
 * @desc Get available categories
 */
router.get('/meta/categories', async (req, res) => {
  res.json({
    success: true,
    categories: config.categories
  });
});

/**
 * @route GET /api/backgrounds/occasions
 * @desc Get available occasions
 */
router.get('/meta/occasions', async (req, res) => {
  res.json({
    success: true,
    occasions: config.occasions
  });
});

/**
 * @route POST /api/backgrounds/text-to-template
 * @desc Generate template elements from text description using Gemini
 * @body { description, width, height, platform, contentType }
 */
router.post('/text-to-template', async (req, res) => {
  try {
    const {
      description,
      width = 1080,
      height = 1080,
      platform = 'instagram',
      contentType = 'post'
    } = req.body;

    if (!description) {
      return res.status(400).json({
        success: false,
        error: 'Description is required'
      });
    }

    const result = await geminiService.generateTemplateFromText(description, {
      width,
      height,
      platform,
      contentType
    });

    // LOG: Elements being sent back to client
    console.log('=== TEXT-TO-TEMPLATE RESPONSE ===');
    console.log('Canvas:', width, 'x', height);
    console.log('Number of elements:', result.elements?.length || 0);
    if (result.elements) {
      result.elements.forEach((el, i) => {
        console.log(`Element ${i} [${el.type}]:`, {
          x: el.x,
          y: el.y,
          width: el.width,
          text: el.text?.substring(0, 30),
          hasNestedPosition: !!el.position,
          hasNestedSize: !!el.size
        });
      });
    }

    res.json({
      success: true,
      message: 'Template generated successfully',
      ...result
    });
  } catch (error) {
    console.error('Text-to-template error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/backgrounds/generate-complete-template
 * @desc Generate a complete template with background and elements using AI
 * @body { prompt, width, height, platform, contentType, generateBackground, headline, subtext, colorPreference, audience, additionalDetails, style }
 */
router.post('/generate-complete-template', async (req, res) => {
  try {
    const {
      prompt,
      width = 1080,
      height = 1080,
      platform = 'instagram',
      contentType = 'post',
      generateBackground = true,
      headline = '',
      subtext = '',
      colorPreference = '',
      audience = '',
      additionalDetails = '',
      style = 'vibrant',
      businessInfo = {}
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    // Build enhanced prompt from all fields
    let enhancedPrompt = prompt;
    if (headline) enhancedPrompt += `\nHeadline text to include: "${headline}"`;
    if (subtext) enhancedPrompt += `\nSubtext/tagline to include: "${subtext}"`;
    if (colorPreference) enhancedPrompt += `\nColor preference: ${colorPreference}`;
    if (audience) enhancedPrompt += `\nTarget audience: ${audience}`;
    if (additionalDetails) enhancedPrompt += `\nAdditional details: ${additionalDetails}`;
    enhancedPrompt += `\nStyle: ${style}`;

    // Add business info to the prompt
    if (businessInfo && businessInfo.name) {
      enhancedPrompt += `\n\nBUSINESS INFORMATION (use these exact values for static elements):`;
      enhancedPrompt += `\n- Business Name: "${businessInfo.name}"`;
      if (businessInfo.phone) enhancedPrompt += `\n- Phone: "${businessInfo.phone}"`;
      if (businessInfo.email) enhancedPrompt += `\n- Email: "${businessInfo.email}"`;
      if (businessInfo.website) enhancedPrompt += `\n- Website: "${businessInfo.website}"`;
      if (businessInfo.address) enhancedPrompt += `\n- Address: "${businessInfo.address}"`;
      if (businessInfo.brand_colors?.primary) enhancedPrompt += `\n- Brand Primary Color: "${businessInfo.brand_colors.primary}"`;
      if (businessInfo.brand_colors?.secondary) enhancedPrompt += `\n- Brand Secondary Color: "${businessInfo.brand_colors.secondary}"`;
    }

    console.log('Generating complete template for:', enhancedPrompt);
    console.log('BusinessInfo from request:', JSON.stringify(businessInfo, null, 2));

    const result = await geminiService.generateCompleteTemplate(enhancedPrompt, {
      width,
      height,
      platform,
      contentType,
      generateBackground,
      style,
      businessInfo  // Pass business info for element population
    });

    // If background was generated, save it or return gradient
    let savedBackground = null;
    let backgroundResult = null;

    if (result.background) {
      if (result.background.imageData && result.background.imageData.base64) {
        // Real image was generated
        try {
          savedBackground = await storageService.saveBackground({
            imageData: result.background.imageData,
            prompt: result.backgroundPrompt || enhancedPrompt,
            description: result.background.description || result.backgroundPrompt,
            category: platform,
            occasion: detectOccasion(enhancedPrompt),
            metadata: {
              width,
              height,
              style,
              mimeType: result.background.imageData.mimeType || 'image/png'
            }
          });
          backgroundResult = {
            type: 'image',
            id: savedBackground.id,
            url: savedBackground.location.url,
            filename: savedBackground.filename
          };
        } catch (saveError) {
          console.error('Failed to save background:', saveError);
        }
      } else if (result.background.type === 'gradient' && result.background.gradient) {
        // Gradient fallback
        backgroundResult = {
          type: 'gradient',
          gradient: result.background.gradient
        };
      }
    }

    res.json({
      success: true,
      message: 'Complete template generated successfully',
      templateName: result.templateName,
      elements: result.elements,
      placeholders: result.placeholders || {},
      backgroundPrompt: result.backgroundPrompt,
      backgroundStyle: result.backgroundStyle,
      background: backgroundResult,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Complete template generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/backgrounds/edit-template-ai
 * @desc Edit an existing template using AI instructions
 * @body { template, instruction }
 */
router.post('/edit-template-ai', async (req, res) => {
  try {
    const { template, instruction } = req.body;

    if (!template || !instruction) {
      return res.status(400).json({
        success: false,
        error: 'Template and instruction are required'
      });
    }

    console.log('AI editing template with instruction:', instruction);

    const result = await geminiService.editTemplateWithAI(template, instruction);

    // If a new background is needed, generate and save it
    let newBackground = null;
    if (result.newBackgroundPrompt) {
      try {
        const bgResult = await geminiService.generateBackground(
          result.newBackgroundPrompt,
          {
            width: template.width || 1080,
            height: template.height || 1080,
            style: 'vibrant',
            category: 'general'
          }
        );

        if (bgResult && bgResult.imageData) {
          const savedBg = await storageService.saveBackground(
            bgResult.imageData.base64,
            {
              prompt: result.newBackgroundPrompt,
              description: bgResult.description,
              category: 'ai-edited',
              mimeType: bgResult.imageData.mimeType
            }
          );

          newBackground = {
            id: savedBg.id,
            url: savedBg.location.url,
            filename: savedBg.filename
          };
        }
      } catch (bgError) {
        console.error('Failed to generate new background:', bgError);
      }
    }

    res.json({
      success: true,
      message: 'Template edited successfully',
      elements: result.elements,
      background: result.background,
      changes: result.changes || [],
      newBackground: newBackground
    });
  } catch (error) {
    console.error('AI template editing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper function to detect occasion from prompt
 */
function detectOccasion(prompt) {
  const promptLower = prompt.toLowerCase();
  for (const occasion of config.occasions) {
    if (promptLower.includes(occasion)) {
      return occasion;
    }
  }
  return '';
}

module.exports = router;
