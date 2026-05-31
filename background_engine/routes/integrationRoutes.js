const express = require('express');
const router = express.Router();
const storageService = require('../services/storageService');
const geminiService = require('../services/geminiService');
const config = require('../config/config');

/**
 * Integration API for auto_poster, manager, and post_generator
 * These endpoints are designed for seamless integration with other services
 */

/**
 * @route POST /api/integration/get-background
 * @desc Smart endpoint that returns existing or generates new background
 * @body { query, category, preferExisting, autoGenerate }
 *
 * This is the main endpoint for other services to use
 */
router.post('/get-background', async (req, res) => {
  try {
    const {
      query,
      category = 'general',
      preferExisting = true,
      autoGenerate = true,
      style = 'vibrant',
      occasion = ''
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    // First, try to find existing backgrounds
    if (preferExisting) {
      const existing = await storageService.searchBackgrounds(query, {
        category,
        limit: 5
      });

      if (existing.length > 0) {
        // Return the best match
        return res.json({
          success: true,
          source: 'existing',
          background: existing[0],
          alternatives: existing.slice(1),
          message: 'Found existing background'
        });
      }
    }

    // If no existing and autoGenerate is enabled, create new
    if (autoGenerate) {
      const result = await geminiService.generateBackground(query, {
        style,
        category
      });

      const saved = await storageService.saveBackground({
        imageData: result.imageData,
        prompt: query,
        description: result.description,
        metadata: result.metadata,
        category,
        occasion: occasion || detectOccasion(query),
        tags: []
      });

      return res.json({
        success: true,
        source: 'generated',
        background: saved,
        alternatives: [],
        message: 'Generated new background'
      });
    }

    // No existing backgrounds and autoGenerate is disabled
    res.json({
      success: false,
      source: 'none',
      message: 'No matching backgrounds found',
      suggestions: await storageService.getSuggestions(query)
    });
  } catch (error) {
    console.error('Integration get-background error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/integration/batch-backgrounds
 * @desc Get backgrounds for multiple queries at once
 * @body { queries: [{ query, category, occasion }] }
 *
 * Useful for post_generator when creating multiple posts
 */
router.post('/batch-backgrounds', async (req, res) => {
  try {
    const { queries, preferExisting = true } = req.body;

    if (!queries || !Array.isArray(queries)) {
      return res.status(400).json({
        success: false,
        error: 'Queries array is required'
      });
    }

    const results = await Promise.all(
      queries.map(async (item) => {
        const { query, category = 'general', occasion = '' } = item;

        // Search for existing
        const existing = await storageService.searchBackgrounds(query, {
          category,
          limit: 1
        });

        if (existing.length > 0) {
          return {
            query,
            source: 'existing',
            background: existing[0]
          };
        }

        return {
          query,
          source: 'not_found',
          background: null,
          needsGeneration: true
        };
      })
    );

    res.json({
      success: true,
      results,
      summary: {
        total: results.length,
        found: results.filter(r => r.source === 'existing').length,
        needsGeneration: results.filter(r => r.needsGeneration).length
      }
    });
  } catch (error) {
    console.error('Batch backgrounds error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/integration/festivals-today
 * @desc Get backgrounds for today's festivals/occasions
 *
 * Useful for auto_poster to get relevant backgrounds
 */
router.get('/festivals-today', async (req, res) => {
  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Define some common festival dates (simplified)
    const festivalCalendar = {
      '1-1': 'new year',
      '1-26': 'republic day',
      '2-14': 'valentine',
      '3-8': 'international women day',
      '5-1': 'labor day',
      '6-21': 'international yoga day',
      '8-15': 'independence day',
      '10-2': 'gandhi jayanti',
      '10-31': 'halloween',
      '11-14': 'children day',
      '12-25': 'christmas',
      '12-31': 'new year eve'
    };

    const dateKey = `${month}-${day}`;
    const todayFestival = festivalCalendar[dateKey];

    let backgrounds = [];
    let festivals = [];

    if (todayFestival) {
      festivals.push(todayFestival);
      backgrounds = await storageService.getByOccasion(todayFestival);
    }

    res.json({
      success: true,
      date: today.toISOString().split('T')[0],
      festivals,
      backgrounds,
      hasBackgrounds: backgrounds.length > 0
    });
  } catch (error) {
    console.error('Festivals today error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/integration/for-post
 * @desc Get best background for a social media post
 * @body { postContent, platform, mood, category }
 *
 * Analyzes post content and suggests best background
 */
router.post('/for-post', async (req, res) => {
  try {
    const {
      postContent,
      platform = 'instagram',
      mood = 'positive',
      category = 'general'
    } = req.body;

    if (!postContent) {
      return res.status(400).json({
        success: false,
        error: 'Post content is required'
      });
    }

    // Extract keywords from post content
    const keywords = extractKeywords(postContent);

    // Search for matching backgrounds
    let backgrounds = [];
    for (const keyword of keywords) {
      const results = await storageService.searchBackgrounds(keyword, {
        category,
        limit: 3
      });
      backgrounds.push(...results);
    }

    // Remove duplicates
    const uniqueBackgrounds = Array.from(
      new Map(backgrounds.map(bg => [bg.id, bg])).values()
    );

    if (uniqueBackgrounds.length === 0) {
      // Suggest a generic background or generation
      return res.json({
        success: true,
        source: 'suggestion',
        backgrounds: [],
        suggestion: {
          generatePrompt: `${mood} ${category} background for ${platform}`,
          message: 'No matching backgrounds found. Consider generating a new one.'
        }
      });
    }

    res.json({
      success: true,
      source: 'matched',
      backgrounds: uniqueBackgrounds.slice(0, 5),
      recommendation: uniqueBackgrounds[0],
      extractedKeywords: keywords
    });
  } catch (error) {
    console.error('For post error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/integration/stats
 * @desc Get background engine statistics
 *
 * Useful for manager dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    const allBackgrounds = await storageService.getAllBackgrounds({ limit: 1000 });

    // Calculate stats
    const categoryStats = {};
    const occasionStats = {};

    for (const bg of allBackgrounds.items) {
      // Count by category
      const cat = bg.category || 'general';
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;

      // Count by occasion
      if (bg.occasion) {
        occasionStats[bg.occasion] = (occasionStats[bg.occasion] || 0) + 1;
      }
    }

    res.json({
      success: true,
      stats: {
        totalBackgrounds: allBackgrounds.pagination.total,
        byCategory: categoryStats,
        byOccasion: occasionStats,
        availableCategories: config.categories,
        availableOccasions: config.occasions
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/integration/generate-complete-template
 * @desc Generate a complete template with AI (background + elements)
 * @body { prompt, platform, width, height, style, headline, subtext, colorPreference, audience }
 *
 * Main endpoint for AI-powered template generation from prompt
 */
router.post('/generate-complete-template', async (req, res) => {
  try {
    const {
      prompt,
      platform = 'instagram',
      contentType = 'post',
      width = 1080,
      height = 1080,
      style = 'vibrant',
      headline = '',
      subtext = '',
      colorPreference = '',
      audience = '',
      additionalDetails = '',
      generateBackground = true,
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
    if (headline) enhancedPrompt += `\nHeadline text: "${headline}"`;
    if (subtext) enhancedPrompt += `\nSubtext/tagline: "${subtext}"`;
    if (colorPreference) enhancedPrompt += `\nColor preference: ${colorPreference}`;
    if (audience) enhancedPrompt += `\nTarget audience: ${audience}`;
    if (additionalDetails) enhancedPrompt += `\nAdditional details: ${additionalDetails}`;

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

    // Generate complete template using Gemini
    const result = await geminiService.generateCompleteTemplate(enhancedPrompt, {
      width,
      height,
      platform,
      contentType,
      generateBackground
    });

    if (!result.success) {
      throw new Error('Template generation failed');
    }

    // Handle background - either saved image or gradient fallback
    let backgroundResult = { type: 'color', value: '#1a1a2e' };

    if (result.background) {
      if (result.background.imageData && result.background.imageData.base64) {
        // Real image was generated - save it
        try {
          const savedBackground = await storageService.saveBackground({
            imageData: result.background.imageData,
            prompt: result.backgroundPrompt || enhancedPrompt,
            description: result.background.description || result.backgroundPrompt,
            metadata: {
              width,
              height,
              style: result.backgroundStyle || style,
              mimeType: result.background.imageData.mimeType || 'image/png'
            },
            category: platform,
            occasion: detectOccasion(prompt),
            tags: []
          });
          backgroundResult = {
            type: 'image',
            value: savedBackground.location.url
          };
        } catch (saveErr) {
          console.error('Failed to save background:', saveErr);
        }
      } else if (result.background.type === 'gradient' && result.background.gradient) {
        // Gradient fallback
        backgroundResult = {
          type: 'gradient',
          value: JSON.stringify(result.background.gradient)
        };
      }
    }

    res.json({
      success: true,
      template: {
        name: result.templateName,
        elements: result.elements,
        placeholders: result.placeholders || {},
        background: backgroundResult,
        metadata: {
          ...result.metadata,
          style: result.backgroundStyle || style,
          prompt: enhancedPrompt
        }
      },
      message: 'Template generated successfully'
    });
  } catch (error) {
    console.error('Generate complete template error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/integration/generate-elements-only
 * @desc Generate only template elements (no background) from prompt
 * @body { prompt, platform, width, height }
 */
router.post('/generate-elements-only', async (req, res) => {
  try {
    const {
      prompt,
      platform = 'instagram',
      contentType = 'post',
      width = 1080,
      height = 1080
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    const result = await geminiService.generateTemplateFromText(prompt, {
      width,
      height,
      platform,
      contentType
    });

    res.json({
      success: true,
      elements: result.elements,
      suggestedBackground: result.suggestedBackground,
      templateName: result.templateName
    });
  } catch (error) {
    console.error('Generate elements error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/integration/edit-template-ai
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

    const result = await geminiService.editTemplateWithAI(template, instruction);

    // If new background is needed, generate it
    let newBackground = null;
    if (result.newBackgroundPrompt) {
      try {
        const bgResult = await geminiService.generateBackground(result.newBackgroundPrompt, {
          width: template.width || 1080,
          height: template.height || 1080,
          style: 'vibrant'
        });

        newBackground = await storageService.saveBackground({
          imageData: bgResult.imageData,
          prompt: result.newBackgroundPrompt,
          description: bgResult.description,
          metadata: bgResult.metadata,
          category: 'general',
          tags: []
        });
      } catch (bgError) {
        console.error('Background generation failed during edit:', bgError);
      }
    }

    res.json({
      success: true,
      elements: result.elements,
      background: result.background?.value !== 'unchanged' ? result.background : null,
      newBackground: newBackground ? {
        type: 'image',
        value: newBackground.location.url
      } : null,
      changes: result.changes
    });
  } catch (error) {
    console.error('Edit template AI error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/integration/health
 * @desc Health check endpoint for service monitoring
 */
router.get('/health', async (req, res) => {
  try {
    await storageService.init();

    res.json({
      success: true,
      status: 'healthy',
      service: 'background_engine',
      timestamp: new Date().toISOString(),
      geminiConfigured: !!config.gemini.apiKey
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * Helper function to extract keywords from text
 */
function extractKeywords(text) {
  const words = text.toLowerCase().split(/\s+/);
  const keywords = [];

  // Check for occasions
  for (const occasion of config.occasions) {
    if (text.toLowerCase().includes(occasion)) {
      keywords.push(occasion);
    }
  }

  // Check for categories
  for (const category of config.categories) {
    if (text.toLowerCase().includes(category)) {
      keywords.push(category);
    }
  }

  // Add common mood words
  const moodWords = ['happy', 'festive', 'professional', 'creative', 'elegant', 'modern', 'traditional'];
  for (const mood of moodWords) {
    if (words.includes(mood)) {
      keywords.push(mood);
    }
  }

  return [...new Set(keywords)];
}

/**
 * Helper function to detect occasion
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
