const config = require('../config/config');
const fs = require('fs').promises;
const path = require('path');

// GoogleGenAI will be loaded dynamically (ES Module)
let GoogleGenAI = null;

class GeminiService {
  constructor() {
    this.ai = null;
    this.apiKey = null;
    this.initPromise = this.initializeWithKey(config.gemini.apiKey);
  }

  /**
   * Initialize or re-initialize with an API key
   * @param {string} apiKey - The Gemini API key
   */
  async initializeWithKey(apiKey) {
    if (!apiKey) {
      console.warn('Warning: GEMINI_API_KEY not set. AI generation will not work.');
      this.ai = null;
      this.apiKey = null;
      return;
    }

    // Dynamically import the ES Module
    if (!GoogleGenAI) {
      const module = await import('@google/genai');
      GoogleGenAI = module.GoogleGenAI;
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.apiKey = apiKey;
  }

  /**
   * Ensure the service is initialized before use
   */
  async ensureInitialized() {
    await this.initPromise;
  }

  /**
   * Update the API key dynamically
   * @param {string} newApiKey - New API key to use
   */
  async updateApiKey(newApiKey) {
    console.log('Updating Gemini API key...');
    await this.initializeWithKey(newApiKey);
    if (this.ai) {
      console.log('Gemini API key updated successfully');
    }
  }

  /**
   * Check if API is configured
   * @returns {boolean} Whether API is ready
   */
  isConfigured() {
    return !!this.ai;
  }

  /**
   * Clean and repair JSON string by removing comments and fixing common issues
   * @param {string} jsonStr - Raw JSON string that may contain comments or formatting issues
   * @returns {string} Cleaned JSON string
   */
  cleanJsonString(jsonStr) {
    let cleaned = jsonStr;

    // Step 1: Remove markdown code block markers
    cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    // Step 2: Remove ALL single-line comments (// ...)
    // Do this in multiple passes to catch all variations
    // First pass: comments on their own lines
    cleaned = cleaned.replace(/^\s*\/\/[^\n]*$/gm, '');
    // Second pass: comments after values (before newline)
    cleaned = cleaned.replace(/\/\/[^\n"]*$/gm, '');
    // Third pass: inline comments after commas
    cleaned = cleaned.replace(/,\s*\/\/[^\n]*/g, ',');
    // Fourth pass: any remaining // not in a URL (look for :// vs just //)
    cleaned = cleaned.replace(/([^:])\/\/[^\n]*/g, '$1');

    // Step 3: Remove multi-line comments (/* ... */)
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

    // Step 4: Remove trailing commas before closing brackets/braces
    cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1');

    // Step 5: Clean up multiple consecutive commas (could result from removing comments)
    cleaned = cleaned.replace(/,\s*,+/g, ',');

    // Step 6: Remove empty lines inside arrays/objects that could cause issues
    cleaned = cleaned.replace(/\[\s*,/g, '[');
    cleaned = cleaned.replace(/,\s*\]/g, ']');
    cleaned = cleaned.replace(/\{\s*,/g, '{');
    cleaned = cleaned.replace(/,\s*\}/g, '}');

    // Step 7: Fix unquoted property names (common in AI outputs)
    cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

    // Step 8: Fix single quotes to double quotes (but not inside strings)
    cleaned = cleaned.replace(/:\s*'([^']*)'/g, ': "$1"');

    // Step 9: Remove control characters that break JSON
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // Step 10: Fix newlines and tabs inside string values
    let inString = false;
    let escaped = false;
    let result = '';
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      if (escaped) {
        result += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        result += char;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }
      if (inString) {
        if (char === '\n') {
          result += '\\n';
          continue;
        }
        if (char === '\r') {
          result += '\\r';
          continue;
        }
        if (char === '\t') {
          result += '\\t';
          continue;
        }
      }
      result += char;
    }
    cleaned = result;

    // Step 11: Try to extract just the JSON object if there's extra text
    const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      cleaned = jsonObjectMatch[0];
    }

    // Step 12: Final cleanup - remove any remaining trailing commas
    cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1');

    return cleaned;
  }

  /**
   * Generate a background image using Gemini AI
   * @param {string} prompt - Description of the background to generate
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated image data and metadata
   */
  async generateBackground(prompt, options = {}) {
    await this.ensureInitialized();
    if (!this.ai) {
      throw new Error('Gemini API key not configured');
    }

    const {
      width = config.image.defaultWidth,
      height = config.image.defaultHeight,
      style = 'vibrant',
      category = 'general'
    } = options;

    // Enhanced prompt for better background generation
    const enhancedPrompt = this.enhancePrompt(prompt, { width, height, style, category });

    try {
      // Use new SDK format for image generation
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: enhancedPrompt,
        config: {
          responseModalities: ['Text', 'Image']
        }
      });

      // Extract image and text from response
      let imageData = null;
      let description = '';

      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageData = part.inlineData;
          } else if (part.text) {
            description = part.text;
          }
        }
      }

      if (!imageData) {
        console.log('No image in response, returning gradient fallback');
        return this.generateGradientFallback(prompt, options);
      }

      return {
        success: true,
        imageData: {
          base64: imageData.data,
          mimeType: imageData.mimeType || 'image/png'
        },
        description: description || prompt,
        prompt: prompt,
        enhancedPrompt: enhancedPrompt,
        metadata: {
          width,
          height,
          style,
          category,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Gemini image generation error:', error.message);
      // Fallback to gradient background
      console.log('Falling back to gradient background');
      return this.generateGradientFallback(prompt, options);
    }
  }

  /**
   * Generate a gradient background as fallback
   */
  async generateGradientFallback(prompt, options = {}) {
    const { width = 1080, height = 1080, style = 'vibrant' } = options;

    // Generate colors based on style using AI
    try {
      await this.ensureInitialized();
      const colorResult = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `Based on this prompt: "${prompt}" and style: "${style}", suggest 2 colors for a gradient background.
Return ONLY a JSON object like: {"color1": "#hex1", "color2": "#hex2", "direction": "to bottom right"}
Colors should be visually appealing and match the mood of the prompt.`
      });

      const colorText = colorResult.text;
      const colorMatch = colorText.match(/\{[\s\S]*?\}/);

      if (colorMatch) {
        const colors = JSON.parse(this.cleanJsonString(colorMatch[0]));
        return {
          success: true,
          type: 'gradient',
          gradient: {
            color1: colors.color1 || '#667eea',
            color2: colors.color2 || '#764ba2',
            direction: colors.direction || 'to bottom right'
          },
          description: `Gradient background for: ${prompt}`,
          prompt: prompt,
          metadata: {
            width,
            height,
            style,
            generatedAt: new Date().toISOString(),
            fallback: true
          }
        };
      }
    } catch (e) {
      console.error('Color generation failed:', e.message);
    }

    // Default gradient colors by style
    const gradients = {
      vibrant: { color1: '#667eea', color2: '#764ba2' },
      minimal: { color1: '#f5f7fa', color2: '#c3cfe2' },
      festive: { color1: '#f093fb', color2: '#f5576c' },
      corporate: { color1: '#2c3e50', color2: '#3498db' },
      nature: { color1: '#134e5e', color2: '#71b280' },
      abstract: { color1: '#ff6b6b', color2: '#4ecdc4' }
    };

    const colors = gradients[style] || gradients.vibrant;

    return {
      success: true,
      type: 'gradient',
      gradient: {
        ...colors,
        direction: 'to bottom right'
      },
      description: `Gradient background for: ${prompt}`,
      prompt: prompt,
      metadata: {
        width,
        height,
        style,
        generatedAt: new Date().toISOString(),
        fallback: true
      }
    };
  }

  /**
   * Enhance the user prompt for better image generation
   * @param {string} prompt - Original prompt
   * @param {Object} options - Enhancement options
   * @returns {string} Enhanced prompt
   */
  /**
   * Detect if the prompt requests specific subjects (people, objects, etc.)
   * vs. just a background
   */
  detectSubjectRequest(prompt) {
    const promptLower = prompt.toLowerCase();

    // Keywords that indicate the user wants specific subjects/foreground elements
    const subjectKeywords = [
      // People
      'man', 'woman', 'person', 'people', 'boy', 'girl', 'child', 'baby',
      'couple', 'family', 'portrait', 'model', 'face', 'silhouette of person',
      'businessman', 'businesswoman', 'doctor', 'teacher', 'worker',
      // Animals
      'dog', 'cat', 'animal', 'pet', 'bird', 'horse', 'lion', 'tiger',
      // Objects
      'flower', 'flowers', 'rose', 'bouquet', 'plant', 'tree',
      'car', 'vehicle', 'phone', 'laptop', 'computer', 'product',
      'food', 'fruit', 'cake', 'coffee', 'drink',
      'gift', 'box', 'package', 'bottle', 'jewelry',
      // Actions/Scenes
      'holding', 'giving', 'standing', 'sitting', 'walking', 'running',
      'showing', 'presenting', 'celebrating', 'working',
      // Specific scene types
      'scene with', 'image of', 'picture of', 'photo of', 'illustration of',
      'showing a', 'featuring a', 'with a', 'include a'
    ];

    // Check if any subject keywords are present
    for (const keyword of subjectKeywords) {
      if (promptLower.includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  enhancePrompt(prompt, options = {}) {
    const { width, height, style, category } = options;
    const aspectRatio = width === height ? 'square (1:1)' : width > height ? 'landscape (16:9)' : 'portrait (9:16)';

    // Detect if user wants specific subjects or just a background
    const hasSubjects = this.detectSubjectRequest(prompt);

    const styleDescriptions = {
      vibrant: {
        desc: 'vibrant, saturated colors with high contrast and dynamic energy',
        colors: 'rich, bold color palette with complementary accents',
        mood: 'energetic, eye-catching, modern'
      },
      minimal: {
        desc: 'minimalist design with clean lines and elegant simplicity',
        colors: 'muted, sophisticated color palette with subtle gradients',
        mood: 'calm, sophisticated, premium'
      },
      gradient: {
        desc: 'smooth, flowing gradient transitions with modern aesthetic',
        colors: 'harmonious color blends with soft transitions',
        mood: 'contemporary, sleek, trendy'
      },
      festive: {
        desc: 'celebratory, rich with decorative elements and warm tones',
        colors: 'gold, warm reds, deep purples, festive metallics',
        mood: 'joyful, luxurious, traditional yet modern'
      },
      corporate: {
        desc: 'professional, clean, business-appropriate with subtle elegance',
        colors: 'navy, teal, silver, white with professional tones',
        mood: 'trustworthy, sophisticated, authoritative'
      },
      nature: {
        desc: 'organic elements, natural textures, earthy aesthetic',
        colors: 'greens, earth tones, sky blues, natural palette',
        mood: 'peaceful, refreshing, authentic'
      },
      abstract: {
        desc: 'artistic abstract patterns with creative geometric or fluid shapes',
        colors: 'bold artistic color combinations with visual interest',
        mood: 'creative, unique, artistic'
      },
      celebration: {
        desc: 'achievement-focused with confetti, stars, and celebratory elements',
        colors: 'gold, silver, vibrant accents on rich backgrounds',
        mood: 'triumphant, proud, exciting'
      },
      luxury: {
        desc: 'premium, high-end aesthetic with refined details',
        colors: 'black, gold, deep jewel tones, metallic accents',
        mood: 'exclusive, elegant, prestigious'
      }
    };

    const styleInfo = styleDescriptions[style] || styleDescriptions.vibrant;

    const qualityKeywords = [
      'ultra high definition',
      '8K resolution quality',
      'photorealistic rendering',
      'professional photography grade',
      'cinematic color grading',
      'sharp intricate details',
      'volumetric lighting effects',
      'subtle depth of field',
      'premium visual quality'
    ].join(', ');

    // If user wants specific subjects, use a different prompt strategy
    if (hasSubjects) {
      console.log('Detected subject request - using full image generation mode');
      return `CREATE A PREMIUM QUALITY IMAGE WITH ALL REQUESTED ELEMENTS

USER REQUEST: ${prompt}

IMPORTANT: Generate EXACTLY what the user requested. Include ALL subjects, people, objects, and elements mentioned in the prompt.

CANVAS SPECIFICATIONS:
- Dimensions: ${width}x${height} pixels
- Aspect Ratio: ${aspectRatio}

STYLE DIRECTION:
- Visual Style: ${styleInfo.desc}
- Color Palette: ${styleInfo.colors}
- Mood/Atmosphere: ${styleInfo.mood}

QUALITY REQUIREMENTS:
${qualityKeywords}

COMPOSITION GUIDELINES:
- Place the main subject(s) prominently in the frame
- Use rule of thirds for visual balance
- Create depth with proper foreground, midground, and background
- Ensure all requested elements are clearly visible and well-rendered
- Professional lighting that highlights the subjects

REQUIREMENTS:
- MUST include ALL subjects/objects mentioned in the prompt
- NO text, typography, or letters unless specifically requested
- NO watermarks or logos
- Photorealistic quality with attention to detail
- Proper proportions and realistic rendering of subjects

Generate a stunning, high-quality image that perfectly matches: "${prompt}"`;
    }

    // Background-only mode (original behavior)
    const textOverlayZone = `
TEXT OVERLAY ZONE SPECIFICATIONS:
- Primary safe zone: Center area (approximately ${Math.round(width * 0.4)}x${Math.round(height * 0.35)} pixels)
- Keep this zone slightly darker, lower contrast, and less busy
- Avoid placing bright highlights or intricate patterns in the center
- Create natural visual hierarchy that draws attention to where text will be placed`;

    return `CREATE A PREMIUM QUALITY BACKGROUND IMAGE

THEME/OCCASION: ${prompt}

CANVAS SPECIFICATIONS:
- Dimensions: ${width}x${height} pixels
- Aspect Ratio: ${aspectRatio}
- Platform: ${category} social media

STYLE DIRECTION:
- Visual Style: ${styleInfo.desc}
- Color Palette: ${styleInfo.colors}
- Mood/Atmosphere: ${styleInfo.mood}

QUALITY REQUIREMENTS:
${qualityKeywords}

${textOverlayZone}

COMPOSITION GUIDELINES:
- Use rule of thirds for visual balance
- Create depth with foreground, midground, and background elements
- Apply subtle vignette effect to draw focus inward
- Include atmospheric elements (bokeh, particles, soft glow) for premium feel
- Ensure smooth color transitions without banding

TECHNICAL SPECIFICATIONS:
- Render at highest possible quality
- Professional color grading with balanced exposure
- Subtle film grain for authenticity (optional based on style)
- No compression artifacts
- HDR-quality dynamic range

STRICT REQUIREMENTS:
- NO text, typography, or letters of any kind
- NO watermarks, logos, or branding
- NO human faces or recognizable people (use silhouettes if needed)
- NO copyrighted characters or elements
- Image must work as a background layer for text overlay

Generate a visually stunning, premium-quality background that perfectly captures: "${prompt}"`;
  }

  /**
   * Generate description/metadata for an existing background
   * @param {string} imagePath - Path to the image
   * @returns {Promise<Object>} Generated description and tags
   */
  async analyzeBackground(imagePath) {
    await this.ensureInitialized();
    if (!this.ai) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);

      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64Image
            }
          },
          `Analyze this background image and provide:
1. A brief description (2-3 sentences)
2. Suggested occasions/festivals it would be suitable for
3. Color palette (list main colors)
4. Style category (festive, corporate, nature, abstract, etc.)
5. Keywords for searching (comma-separated)

Return ONLY valid JSON with keys: description, occasions, colors, category, keywords. No markdown, no comments.`
        ],
        config: {
          responseMimeType: 'application/json'
        }
      });

      const text = result.text;

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(this.cleanJsonString(jsonMatch[0]));
      }

      return {
        description: text,
        occasions: [],
        colors: [],
        category: 'general',
        keywords: ''
      };
    } catch (error) {
      console.error('Image analysis error:', error);
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }

  /**
   * Get MIME type from file extension
   * @param {string} filePath - File path
   * @returns {string} MIME type
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    };
    return mimeTypes[ext] || 'image/png';
  }

  /**
   * Extract unique font families from elements and generate Google Fonts data
   * @param {Array} elements - Template elements array
   * @returns {Array} Font family information
   */
  extractFontFamilies(elements) {
    const fontMap = new Map();

    // Google Fonts metadata - available fonts for templates
    const fontMetadata = {
      'Playfair Display': { category: 'serif', availableWeights: [400, 500, 600, 700, 800, 900], usage: 'Headlines, titles' },
      'Montserrat': { category: 'sans-serif', availableWeights: [100, 200, 300, 400, 500, 600, 700, 800, 900], usage: 'Headlines, body' },
      'Poppins': { category: 'sans-serif', availableWeights: [100, 200, 300, 400, 500, 600, 700, 800, 900], usage: 'Body text, UI' },
      'Inter': { category: 'sans-serif', availableWeights: [100, 200, 300, 400, 500, 600, 700, 800, 900], usage: 'Small text, UI' },
      'Lora': { category: 'serif', availableWeights: [400, 500, 600, 700], usage: 'Quotes, messages' },
      'Open Sans': { category: 'sans-serif', availableWeights: [300, 400, 500, 600, 700, 800], usage: 'Body text' },
      'Roboto': { category: 'sans-serif', availableWeights: [100, 300, 400, 500, 700, 900], usage: 'General purpose' },
      'Oswald': { category: 'sans-serif', availableWeights: [200, 300, 400, 500, 600, 700], usage: 'Display, headlines' },
      'Lato': { category: 'sans-serif', availableWeights: [100, 300, 400, 700, 900], usage: 'Body text' },
      'Dancing Script': { category: 'handwriting', availableWeights: [400, 500, 600, 700], usage: 'Decorative, signatures' },
      'Abril Fatface': { category: 'display', availableWeights: [400], usage: 'Display headlines' },
      'Roboto Condensed': { category: 'sans-serif', availableWeights: [300, 400, 700], usage: 'Compact text' },
      'Bebas Neue': { category: 'display', availableWeights: [400], usage: 'Bold headlines' },
      'Raleway': { category: 'sans-serif', availableWeights: [100, 200, 300, 400, 500, 600, 700, 800, 900], usage: 'Elegant text' },
      'Nunito': { category: 'sans-serif', availableWeights: [200, 300, 400, 500, 600, 700, 800, 900], usage: 'Friendly text' },
      'Source Sans Pro': { category: 'sans-serif', availableWeights: [200, 300, 400, 600, 700, 900], usage: 'Professional text' },
      'Merriweather': { category: 'serif', availableWeights: [300, 400, 700, 900], usage: 'Readable serif' },
      'Quicksand': { category: 'sans-serif', availableWeights: [300, 400, 500, 600, 700], usage: 'Modern friendly' }
    };

    if (!elements || !Array.isArray(elements)) {
      return [];
    }

    elements.forEach(el => {
      if (el && el.fontFamily && el.type === 'text') {
        const family = el.fontFamily;
        const weight = parseInt(el.fontWeight) || 400;
        const meta = fontMetadata[family] || { category: 'sans-serif', availableWeights: [400], usage: 'General' };

        if (!fontMap.has(family)) {
          fontMap.set(family, {
            family,
            usedWeights: new Set([weight]),
            category: meta.category,
            usage: meta.usage
          });
        } else {
          const existing = fontMap.get(family);
          existing.usedWeights.add(weight);
        }
      }
    });

    return Array.from(fontMap.values()).map(font => ({
      family: font.family,
      weights: Array.from(font.usedWeights).sort((a, b) => a - b),
      category: font.category,
      usage: font.usage,
      url: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family)}:wght@${Array.from(font.usedWeights).sort((a, b) => a - b).join(';')}&display=swap`
    }));
  }

  /**
   * Generate Google Fonts import URL from font families
   * @param {Array} fontFamilies - Array of font family objects
   * @returns {string} Google Fonts import URL
   */
  generateGoogleFontsImport(fontFamilies) {
    if (!fontFamilies || fontFamilies.length === 0) {
      return "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');";
    }

    const fontParams = fontFamilies.map(font => {
      const weights = font.weights.join(';');
      return `family=${encodeURIComponent(font.family)}:wght@${weights}`;
    }).join('&');

    return `@import url('https://fonts.googleapis.com/css2?${fontParams}&display=swap');`;
  }

  /**
   * Generate template elements from text description
   * @param {string} description - Text description of the template
   * @param {Object} options - Canvas options (width, height, platform)
   * @returns {Promise<Object>} Generated elements array
   */
  async generateTemplateFromText(description, options = {}) {
    await this.ensureInitialized();
    if (!this.ai) {
      throw new Error('Gemini API key not configured');
    }

    const {
      width = 1080,
      height = 1080,
      platform = 'instagram',
      contentType = 'post'
    } = options;

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro',
        config: {
          temperature: 1.4,
          topP: 0.95,
          responseMimeType: 'application/json'
        },
        contents: `
You are a CREATIVE social media designer. Create a UNIQUE, visually interesting template layout.
IMPORTANT: Return ONLY valid JSON. No comments, no markdown code blocks, no explanations.

DESCRIPTION: "${description}"

CANVAS SPECIFICATIONS:
- Width: ${width}px
- Height: ${height}px
- Platform: ${platform}
- Content type: ${contentType}
- Safe margins: 60px from edges

GOOGLE FONTS AVAILABLE (use these exact names):
Headlines/Titles:
- "Playfair Display" (weights: 400, 500, 600, 700, 800, 900) - Elegant serif, great for headlines
- "Montserrat" (weights: 100-900) - Modern sans-serif, versatile
- "Oswald" (weights: 200-700) - Bold condensed, high impact

Body/Subheadlines:
- "Poppins" (weights: 100-900) - Clean geometric sans-serif
- "Open Sans" (weights: 300-800) - Highly readable
- "Lato" (weights: 100-900) - Friendly sans-serif

Accent/Decorative:
- "Lora" (weights: 400-700, italic) - Elegant serif for quotes
- "Roboto" (weights: 100-900) - Clean, modern
- "Inter" (weights: 100-900) - Optimized for screens, small text

ELEMENT STRUCTURE - Each element MUST have all these fields:
{
  "id": "unique_string",
  "type": "text" | "shape" | "image",
  "name": "Human Readable Name",
  "x": number (center X position in pixels),
  "y": number (center Y position in pixels - between 80 and ${height - 80}),
  "width": number (MAXIMUM ${width - 120} pixels to leave margins),
  "height": number (for shapes/images),
  "zIndex": number (REQUIRED! Controls layering - see below)
}

🔢 Z-INDEX LAYERING (SET FOR EVERY ELEMENT):
- zIndex 1-9: Background shapes, decorative elements (BACK)
- zIndex 10-19: Secondary shapes, frames, borders
- zIndex 20-29: Images (photos, product images)
- zIndex 30-39: Main text (headlines, body text)
- zIndex 40-49: Secondary text (details, subtitles)
- zIndex 50-59: Business branding (logo, name, contact) - ALWAYS ON TOP

⚠️ CRITICAL POSITIONING RULES:
- For ALL center-aligned text: x MUST be exactly ${Math.round(width/2)}
- For y positions: MINIMUM ${Math.round(height * 0.1)}, MAXIMUM ${Math.round(height * 0.95)}
- For width: MAXIMUM ${width - 120} (leaves 60px margin each side)
- NEVER use x=50 or other arbitrary small values for centered text!

TEXT ELEMENT TYPOGRAPHY (precise specifications):
{
  "text": "Content here",
  "fontSize": number (recommended ranges below),
  "fontFamily": "Exact Google Font Name",
  "fontWeight": "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900",
  "fontStyle": "normal" | "italic",
  "color": "#HEXCOLOR",
  "textAlign": "left" | "center" | "right",
  "lineHeight": number (1.0-2.0, default 1.2),
  "letterSpacing": number (0-10, in pixels),
  "textTransform": "none" | "uppercase" | "lowercase" | "capitalize",
  "textShadow": "offsetX offsetY blur color" (e.g., "0 2px 4px rgba(0,0,0,0.3)"),
  "backgroundColor": "#HEXCOLOR" (for text box background),
  "backgroundOpacity": number (0-100),
  "borderColor": "#HEXCOLOR",
  "borderWidth": number (0-10),
  "borderRadius": number (0-50),
  "padding": number (0-50)
}

🎯 CRITICAL: YOU CONTROL FONT SIZES AND ELEMENT POSITIONS
Your font size and position decisions will be PRESERVED EXACTLY as you specify them.
Choose optimal values for the design - they will NOT be overridden by the system.

FONT SIZE GUIDELINES FOR ${width}x${height} CANVAS (in PIXELS):
- Main Headline: ${Math.round(width * 0.06)}-${Math.round(width * 0.09)}px (64-96px for 1080px canvas)
- Subheadline: ${Math.round(width * 0.028)}-${Math.round(width * 0.04)}px (30-43px for 1080px canvas)
- Body Text: ${Math.round(width * 0.02)}-${Math.round(width * 0.028)}px (22-30px for 1080px canvas)
- Small Text/Labels: ${Math.round(width * 0.014)}-${Math.round(width * 0.02)}px (15-22px for 1080px canvas)
- Contact Info: ${Math.round(width * 0.014)}-${Math.round(width * 0.018)}px (15-20px for 1080px canvas)
- Business Name: ${Math.round(width * 0.035)}-${Math.round(width * 0.05)}px (38-54px minimum for prominence)

Choose SPECIFIC font sizes based on:
1. Visual hierarchy - headlines should dominate, details should be subtle
2. Readability at the canvas size
3. Balance with other elements
4. Design aesthetics and the template's purpose

SHAPE ELEMENT PROPERTIES:
{
  "shapeType": "rect" | "circle" | "line",
  "fill": "#HEXCOLOR" or "transparent",
  "stroke": "#HEXCOLOR" or "transparent",
  "strokeWidth": number (0-20),
  "borderRadius": number (0-100, for rect only),
  "opacity": number (0-100)
}

IMAGE PLACEHOLDER PROPERTIES:
\
{
  "borderRadius": number (0=square, 50=rounded, 100+=circle),
  "objectFit": "cover" | "contain",
  "border": "width style color" (e.g., "3px solid #FFD700")
}

📐 TEMPLATE SIZE: ${width}x${height}px (${width === height ? 'SQUARE POST' : height > width ? 'VERTICAL STORY' : 'HORIZONTAL'})
═══════════════════════════════════════════════════════════════════════════════

${width === height ? `SQUARE POST LAYOUT:
- Balanced format - elements can be centered or asymmetric
- Top zone (headline): y = ${Math.round(height * 0.12)} to ${Math.round(height * 0.22)}
- Middle zone (main content): y = ${Math.round(height * 0.30)} to ${Math.round(height * 0.60)}
- Lower zone (details): y = ${Math.round(height * 0.65)} to ${Math.round(height * 0.75)}
- Bottom zone (branding): y = ${Math.round(height * 0.78)} to ${Math.round(height * 0.95)}
` : height > width ? `VERTICAL STORY LAYOUT:
- Tall format - spread elements vertically with breathing room
- Top zone (headline): y = ${Math.round(height * 0.06)} to ${Math.round(height * 0.15)}
- Upper zone: y = ${Math.round(height * 0.18)} to ${Math.round(height * 0.35)}
- Center zone (main content): y = ${Math.round(height * 0.38)} to ${Math.round(height * 0.58)}
- Lower zone: y = ${Math.round(height * 0.62)} to ${Math.round(height * 0.75)}
- Bottom zone (branding): y = ${Math.round(height * 0.80)} to ${Math.round(height * 0.95)}
- MORE VERTICAL SPACE - spread elements out beautifully!` : `HORIZONTAL LAYOUT:
- Wide format - use left-right flow
- Left zone: x = ${Math.round(width * 0.12)} to ${Math.round(width * 0.35)}
- Center zone: x = ${Math.round(width * 0.38)} to ${Math.round(width * 0.62)}
- Right zone: x = ${Math.round(width * 0.65)} to ${Math.round(width * 0.88)}
`}

POSITIONING RULES:
- Center X for centered elements: ${Math.round(width/2)}
- Safe margins: 60px from all edges
- MAXIMUM element width: ${width - 120}px

Recommended widths:
- Headline: ${Math.round(width * 0.8)}px
- Body text: ${Math.round(width * 0.75)}px
- Contact info: ${Math.round(width * 0.85)}px

VISUAL HIERARCHY:
1. Most important element (headline) - largest, most prominent position
2. Secondary info (name, achievement) - medium size, supporting position
3. Supporting details - smaller, complementary
4. Branding (logo, business name) - consistent placement, bottom area
5. Contact info - smallest, footer area

REQUIRED JSON OUTPUT:
{
  "elements": [...array of elements with ALL properties...],
  "suggestedBackground": {
    "type": "color" | "gradient",
    "value": "#hex" | {"start": "#hex", "end": "#hex", "direction": "to bottom right"}
  },
  "colorPalette": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#hex",
    "textLight": "#hex",
    "textDark": "#hex"
  },
  "googleFontsImport": "@import url('https://fonts.googleapis.com/css2?family=Font1:wght@400;700&family=Font2:wght@300;500&display=swap');",
  "templateName": "Descriptive Template Name"
}

All elements also need: rotation: 0, visible: true, locked: false, dynamicProperties: {}
`
      });

      const text = result.text;

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // Clean JSON by removing comments (// and /* */) before parsing
        const cleanedJson = this.cleanJsonString(jsonMatch[0]);
        const parsed = JSON.parse(cleanedJson);

        // Validate and ensure all elements have required properties
        if (parsed.elements && Array.isArray(parsed.elements)) {
          parsed.elements = parsed.elements.map((el, index) => {
            // Calculate element width and position
            const elWidth = el.width || (el.type === 'image' ? 200 : 400);
            const elHeight = el.height || (el.type === 'shape' ? 100 : el.type === 'image' ? 200 : undefined);

            // For centered text, always use canvas center
            let posX = el.x || width / 2;
            if (el.type === 'text' && (!el.textAlign || el.textAlign === 'center')) {
              posX = Math.round(width / 2);
            }

            // Clamp position to safe bounds
            const safeMargin = 60;
            const minX = safeMargin + (elWidth / 2);
            const maxX = width - safeMargin - (elWidth / 2);
            posX = Math.min(Math.max(posX, minX), maxX);

            const posY = Math.min(Math.max(el.y || height / 2, safeMargin), height - safeMargin);

            // Get border radius (support both number and per-corner)
            const br = el.borderRadius || 0;
            const brNum = typeof br === 'number' ? br : 0;

            // Get padding (support both number and per-side)
            const pad = el.padding || 0;
            const padNum = typeof pad === 'number' ? pad : 0;

            // Calculate font size percent for responsive scaling
            const fontSize = el.fontSize || 48;
            const fontSizePercent = el.fontSizePercent || ((fontSize / width) * 100);

            return {
              id: el.id || `${el.type || 'text'}_${Date.now()}_${index}`,
              type: el.type || 'text',
              name: el.name || `Element ${index + 1}`,
              x: posX,
              y: posY,
              width: elWidth,
              height: elHeight,
              text: el.text || el.content || '',
              src: el.src || '',
              fontSize: fontSize,
              fontSizePercent: fontSizePercent,
              fontFamily: el.fontFamily || 'Inter',
              fontWeight: String(el.fontWeight || '600'),
              fontStyle: el.fontStyle || 'normal',
              color: el.color || '#ffffff',
              textAlign: el.textAlign || 'center',
              lineHeight: el.lineHeight || 1.2,
              letterSpacing: el.letterSpacing || 0,
              textTransform: el.textTransform || 'none',
              textShadow: el.textShadow || '',
              backgroundColor: el.backgroundColor || '#000000',
              backgroundOpacity: el.backgroundOpacity || 0,
              backgroundBlur: el.backgroundBlur || 0,
              borderRadius: brNum,
              borderRadiusTopLeft: el.borderRadiusTopLeft || brNum,
              borderRadiusTopRight: el.borderRadiusTopRight || brNum,
              borderRadiusBottomLeft: el.borderRadiusBottomLeft || brNum,
              borderRadiusBottomRight: el.borderRadiusBottomRight || brNum,
              padding: padNum,
              paddingTop: el.paddingTop || padNum,
              paddingRight: el.paddingRight || padNum,
              paddingBottom: el.paddingBottom || padNum,
              paddingLeft: el.paddingLeft || padNum,
              borderColor: el.borderColor || '#000000',
              borderWidth: el.borderWidth || 0,
              shapeType: el.shapeType || 'rect',
              fill: el.fill || '#e94560',
              stroke: el.stroke || 'transparent',
              strokeWidth: el.strokeWidth || 0,
              opacity: el.opacity !== undefined ? el.opacity : 100,
              rotation: el.rotation || 0,
              visible: true,
              locked: el.locked || false,
              zIndex: el.zIndex || (10 + index),
              isPlaceholder: el.isPlaceholder || false,
              placeholderKey: el.placeholderKey || null,
              dynamicProperties: el.dynamicProperties || {},
              aiControlled: true  // Mark as AI-controlled to preserve font size and positions
            };
          });
        }

        return {
          success: true,
          aiControlled: true,  // Template-level flag
          ...parsed
        };
      }

      throw new Error('Invalid JSON response from AI');
    } catch (error) {
      console.error('Template generation error:', error);

      // If JSON parsing failed, try a simpler retry with stricter instructions
      if (error.message.includes('JSON') || error.message.includes('token') || error.message.includes('position')) {
        console.log('Retrying with simplified prompt...');
        try {
          const retryResult = await this.ai.models.generateContent({
            model: 'gemini-2.5-pro',
            config: {
              temperature: 0.7,
              topP: 0.9,
              responseMimeType: 'application/json'
            },
            contents: `Create a simple social media template. Return ONLY a valid JSON object with NO comments.

Description: "${description}"
Canvas: ${width}x${height}px

Return this exact JSON structure (fill in appropriate values):
{
  "elements": [
    {
      "id": "headline_1",
      "type": "text",
      "name": "Main Headline",
      "x": ${Math.round(width/2)},
      "y": ${Math.round(height * 0.2)},
      "width": ${Math.round(width * 0.8)},
      "text": "Your headline here",
      "fontSize": 64,
      "fontFamily": "Playfair Display",
      "fontWeight": "700",
      "color": "#ffffff",
      "textAlign": "center",
      "zIndex": 30
    },
    {
      "id": "subtext_1",
      "type": "text",
      "name": "Subtitle",
      "x": ${Math.round(width/2)},
      "y": ${Math.round(height * 0.35)},
      "width": ${Math.round(width * 0.75)},
      "text": "Supporting text here",
      "fontSize": 28,
      "fontFamily": "Poppins",
      "fontWeight": "400",
      "color": "#ffffff",
      "textAlign": "center",
      "zIndex": 31
    }
  ],
  "suggestedBackground": {
    "type": "gradient",
    "value": {"start": "#667eea", "end": "#764ba2", "direction": "to bottom right"}
  },
  "colorPalette": {
    "primary": "#667eea",
    "secondary": "#764ba2",
    "accent": "#FFD700",
    "background": "#1a1a2e",
    "textLight": "#ffffff",
    "textDark": "#1a1a2e"
  },
  "templateName": "Simple Template"
}

CRITICAL: Output ONLY the JSON. No markdown, no comments, no explanations.`
          });

          const retryText = retryResult.text;
          const retryJsonMatch = retryText.match(/\{[\s\S]*\}/);
          if (retryJsonMatch) {
            const retryCleanedJson = this.cleanJsonString(retryJsonMatch[0]);
            const retryParsed = JSON.parse(retryCleanedJson);

            if (retryParsed.elements && Array.isArray(retryParsed.elements)) {
              retryParsed.elements = retryParsed.elements.map((el, index) => ({
                id: el.id || `element_${index}`,
                type: el.type || 'text',
                name: el.name || `Element ${index + 1}`,
                x: el.x || width / 2,
                y: el.y || height / 2,
                width: el.width || 400,
                height: el.height,
                text: el.text || '',
                fontSize: el.fontSize || 48,
                fontFamily: el.fontFamily || 'Inter',
                fontWeight: String(el.fontWeight || '400'),
                fontStyle: el.fontStyle || 'normal',
                color: el.color || '#ffffff',
                textAlign: el.textAlign || 'center',
                lineHeight: el.lineHeight || 1.2,
                letterSpacing: el.letterSpacing || 0,
                textTransform: el.textTransform || 'none',
                textShadow: el.textShadow || '',
                backgroundColor: el.backgroundColor || '#000000',
                backgroundOpacity: el.backgroundOpacity || 0,
                backgroundBlur: el.backgroundBlur || 0,
                borderRadius: el.borderRadius || 0,
                padding: el.padding || 0,
                borderColor: el.borderColor || '#000000',
                borderWidth: el.borderWidth || 0,
                shapeType: el.shapeType || 'rect',
                fill: el.fill || '#e94560',
                stroke: el.stroke || 'transparent',
                strokeWidth: el.strokeWidth || 0,
                opacity: el.opacity !== undefined ? el.opacity : 100,
                rotation: el.rotation || 0,
                visible: true,
                locked: false,
                zIndex: el.zIndex || (10 + index),
                dynamicProperties: el.dynamicProperties || {},
                aiControlled: true
              }));
            }

            console.log('Retry successful');
            return {
              success: true,
              aiControlled: true,
              ...retryParsed
            };
          }
        } catch (retryError) {
          console.error('Retry also failed:', retryError.message);
        }
      }

      throw new Error(`Failed to generate template: ${error.message}`);
    }
  }

  /**
   * Generate a complete template with background image and elements
   * IMPROVED: Only generates elements specified in prompt, generates background first,
   * then positions elements based on background analysis
   * @param {string} prompt - Description of what the user wants
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Complete template with background and elements
   */
  async generateCompleteTemplate(prompt, options = {}) {
    await this.ensureInitialized();
    if (!this.ai) {
      throw new Error('Gemini API key not configured');
    }

    const {
      width = 1080,
      height = 1080,
      platform = 'instagram',
      contentType = 'post',
      businessInfo = {},  // Business profile data
      generateBackground = true,
      style = 'vibrant'
    } = options;

    // Minimum font size: 10pt (~11px for 1080px canvas, 1% of canvas width)
    const MIN_FONT_SIZE = Math.max(11, Math.round(width * 0.01));

    // Log business info for debugging
    console.log('Business Info received:', JSON.stringify({
      name: businessInfo.name,
      phone: businessInfo.phone,
      email: businessInfo.email,
      website: businessInfo.website,
      address: businessInfo.address,
      logo: businessInfo.logo ? 'present' : 'missing',
      logoUrl: businessInfo.logoUrl ? 'present' : 'missing'
    }, null, 2));

    try {
      // Convert prompt to lowercase early for keyword detection throughout the function
      const promptLower = prompt.toLowerCase();

      // Use latest Gemini model for text generation with HIGH creativity settings
      const modelName = 'gemini-2.5-pro';
      console.log(`Using model: ${modelName} for template generation`);

      // Model config for creative outputs with JSON response mode
      const modelConfig = {
        temperature: 1.5,  // Higher = more creative (max 2.0)
        topP: 0.95,
        topK: 64,
        responseMimeType: 'application/json'
      };

      // STEP 1: Creative Design Concept - Let AI be truly creative
      console.log('Step 1: Getting creative design inspiration...');

      // Generate a random design direction to ensure variety
      const designDirections = [
        'bold and dramatic with huge typography',
        'elegant and minimal with lots of white space',
        'playful and colorful with geometric shapes',
        'luxurious with gold accents and dark backgrounds',
        'modern gradient style with glassmorphism',
        'vintage retro with warm colors',
        'neon futuristic with glowing effects',
        'organic and natural with soft curves',
        'corporate professional with clean lines',
        'artistic and abstract with overlapping shapes'
      ];
      const randomDirection = designDirections[Math.floor(Math.random() * designDirections.length)];

      const analysisResult = await this.ai.models.generateContent({
        model: modelName,
        config: modelConfig,
        contents: `
You are a TOP CREATIVE DESIGNER known for UNIQUE, AWARD-WINNING social media designs.

CLIENT WANTS: "${prompt}"

Your design direction for THIS post: ${randomDirection}

Create a COMPLETELY UNIQUE design concept. NO BORING TEMPLATES!

Think about:
- What unexpected layout would make people STOP scrolling?
- What creative use of typography would be memorable?
- What color combination would be striking?
- What decorative elements would add personality?

BE BOLD. BE DIFFERENT. Each design should feel FRESH and UNIQUE.

Consider these CREATIVE approaches:
1. SPLIT LAYOUT: Divide canvas diagonally or vertically with contrasting colors
2. OVERSIZED TEXT: One word so big it bleeds off the edges
3. STACKED LAYOUT: Elements stacked with varying alignments
4. FRAMED DESIGN: Content inside a creative border/frame
5. FLOATING ELEMENTS: Scattered elements with intentional whitespace
6. GRADIENT MESH: Complex multi-color gradients as background
7. PATTERN OVERLAY: Geometric patterns adding texture
8. ASYMMETRIC BALANCE: Off-center but visually balanced
9. LAYERED DEPTH: Elements overlapping with shadows
10. MINIMALIST IMPACT: Very few elements, maximum impact

Return JSON with your CREATIVE vision:
{
  "creativeConcept": "Describe your unique design idea in detail (be specific and creative!)",
  "layoutStyle": "split|oversized|stacked|framed|floating|asymmetric|layered|minimal|diagonal|mosaic",
  "colorScheme": {
    "background": "#hex or gradient description",
    "primary": "#hex (main color)",
    "secondary": "#hex",
    "accent": "#hex (pop color)",
    "text": "#hex"
  },
  "typographyStyle": "bold-sans|elegant-serif|playful-mixed|modern-geometric|vintage-display",
  "decorativeIdeas": ["specific decorative elements to add"],
  "uniqueFeature": "What makes THIS design special and different?",
  "moodKeywords": ["3-4 mood words"]
}
`
      });

      const analysisText = analysisResult.text;
      const analysisMatch = analysisText.match(/\{[\s\S]*\}/);
      let designConcept = {
        creativeConcept: 'Bold modern design with striking typography',
        layoutStyle: 'asymmetric',
        colorScheme: { background: '#1a1a2e', primary: '#e94560', secondary: '#0f3460', accent: '#f1c40f', text: '#ffffff' },
        typographyStyle: 'bold-sans',
        decorativeIdeas: ['accent lines', 'geometric shapes'],
        uniqueFeature: 'Dynamic asymmetric layout',
        moodKeywords: ['bold', 'modern', 'striking']
      };

      if (analysisMatch) {
        try {
          const parsed = JSON.parse(this.cleanJsonString(analysisMatch[0]));
          designConcept = { ...designConcept, ...parsed };
          console.log('🎨 Creative Concept:', designConcept.creativeConcept);
          console.log('🖼️ Layout Style:', designConcept.layoutStyle);
          console.log('✨ Unique Feature:', designConcept.uniqueFeature);
          console.log('🎨 Colors:', JSON.stringify(designConcept.colorScheme));
        } catch (e) {
          console.log('Could not parse design concept, using defaults');
        }
      }

      console.log('Creative Vision:', JSON.stringify(designConcept, null, 2));

      // STEP 2: Generate creative background based on design concept
      let backgroundData = null;
      let backgroundAnalysis = null;

      if (generateBackground) {
        console.log('Step 2: Generating creative background...');

        const colorScheme = designConcept.colorScheme || {};
        const bgColors = [colorScheme.primary, colorScheme.secondary, colorScheme.accent].filter(Boolean).join(', ') || 'vibrant gradient';
        const moodWords = (designConcept.moodKeywords || ['modern', 'bold']).join(', ');

        const backgroundPrompt = `Create an AMAZING, UNIQUE social media background.

CREATIVE VISION: ${designConcept.creativeConcept}
MOOD: ${moodWords}
COLORS: ${bgColors}
BACKGROUND STYLE: ${colorScheme.background || 'dramatic gradient'}

Make this background STUNNING and UNIQUE:
- NOT a boring solid color or simple gradient
- Add visual DEPTH and INTEREST
- Consider: abstract shapes, light rays, bokeh, particles, textures, patterns
- Make it look like a $10,000 design agency created it
- The background should COMPLEMENT the ${designConcept.layoutStyle} layout style

TECHNICAL:
- ${width}x${height} pixels, 8K quality
- Keep some areas clear for text
- No text, no watermarks, no faces
- Premium, polished finish`;

        // Determine background style from design concept
        const bgStyle = designConcept.layoutStyle === 'minimal' ? 'minimal' :
                       designConcept.colorScheme?.background?.includes('gradient') ? 'gradient' :
                       designConcept.moodKeywords?.includes('festive') ? 'festive' :
                       designConcept.moodKeywords?.includes('luxury') ? 'luxury' : style;

        try {
          backgroundData = await this.generateBackground(backgroundPrompt, {
            width,
            height,
            style: bgStyle,
            category: platform
          });

          // STEP 3: Analyze generated background for optimal element positioning
          if (backgroundData && backgroundData.imageData) {
            console.log('Step 3: Analyzing background for smart element positioning...');
            const bgAnalysisResult = await this.ai.models.generateContent({
              model: modelName,
              config: modelConfig,
              contents: [
                {
                  inlineData: {
                    mimeType: backgroundData.imageData.mimeType || 'image/png',
                    data: backgroundData.imageData.base64
                  }
                },
                `You are a design expert. Analyze this background image and suggest EXACT positions for elements.

Canvas size: ${width}x${height}px

Analyze:
1. Where are the DARK areas (good for light text)?
2. Where are the LIGHT areas (good for dark text)?
3. Where is the CLEAR/EMPTY space (good for main content)?
4. Where are the BUSY/DETAILED areas (avoid placing text)?

Return ONLY valid JSON with SPECIFIC pixel positions:
{
  "dominantColors": ["#hex1", "#hex2"],
  "bestTextColor": "#FFFFFF or #000000",
  "clearAreas": [
    {"zone": "top-center", "yRange": [${Math.round(height*0.1)}, ${Math.round(height*0.3)}], "suitable": "headlines"},
    {"zone": "center", "yRange": [${Math.round(height*0.35)}, ${Math.round(height*0.6)}], "suitable": "main content"},
    {"zone": "bottom", "yRange": [${Math.round(height*0.7)}, ${Math.round(height*0.95)}], "suitable": "branding"}
  ],
  "suggestedLayout": {
    "headline": {"y": number, "textColor": "#hex"},
    "subheadline": {"y": number, "textColor": "#hex"},
    "mainContent": {"y": number, "textColor": "#hex"},
    "businessLogo": {"y": number, "size": number},
    "businessName": {"y": number, "fontSize": number, "textColor": "#hex"},
    "businessAddress": {"y": number, "fontSize": number},
    "contactInfo": {"y": number, "fontSize": number}
  },
  "needsTextBackground": true/false,
  "textBackgroundStyle": "dark-overlay/light-overlay/blur/solid"
}`
              ]
            });

            const bgAnalysisText = bgAnalysisResult.text;
            const bgAnalysisMatch = bgAnalysisText.match(/\{[\s\S]*\}/);
            if (bgAnalysisMatch) {
              try {
                backgroundAnalysis = JSON.parse(this.cleanJsonString(bgAnalysisMatch[0]));
                console.log('Background analysis:', JSON.stringify(backgroundAnalysis, null, 2));
              } catch (e) {
                console.log('Could not parse background analysis');
              }
            }
          }
        } catch (bgError) {
          console.error('Background generation failed:', bgError.message);
        }
      }

      // STEP 4: Generate template with elements positioned based on background
      console.log('Step 4: Generating template with smart element positioning...');

      const textColor = backgroundAnalysis?.bestTextColor || designConcept.colorScheme?.text || '#FFFFFF';
      const colors = designConcept.colorScheme || { primary: '#e94560', secondary: '#0f3460', accent: '#f1c40f', text: '#ffffff' };

      // Get suggested positions from background analysis
      const suggestedLayout = backgroundAnalysis?.suggestedLayout || {};
      const needsTextBg = backgroundAnalysis?.needsTextBackground || false;
      const textBgStyle = backgroundAnalysis?.textBackgroundStyle || 'none';

      const structureResult = await this.ai.models.generateContent({
        model: modelName,
        config: modelConfig,
        contents: `
You are a PROFESSIONAL CREATIVE DESIGNER. Create a social media post with elements positioned BASED ON THE BACKGROUND.

═══════════════════════════════════════════════════════════════════════════════
CLIENT REQUEST: "${prompt}"
═══════════════════════════════════════════════════════════════════════════════

CANVAS: ${width}x${height}px (${width === height ? 'SQUARE POST' : height > width ? 'VERTICAL STORY' : 'HORIZONTAL'})

═══════════════════════════════════════════════════════════════════════════════
📐 TEMPLATE SIZE-SPECIFIC POSITIONING GUIDE
═══════════════════════════════════════════════════════════════════════════════
${width === height ? `
SQUARE POST (${width}x${height}):
- This is a balanced square format - use centered or asymmetric layouts
- Main content area: y = ${Math.round(height * 0.25)} to ${Math.round(height * 0.65)}
- Business branding zone: y = ${Math.round(height * 0.75)} to ${Math.round(height * 0.95)}
- Safe margins: 60px from all edges
- Center X for centered elements: ${Math.round(width / 2)}
` : height > width ? `
VERTICAL STORY (${width}x${height}):
- Tall format - stack elements vertically with breathing room
- Top zone (headlines): y = ${Math.round(height * 0.08)} to ${Math.round(height * 0.20)}
- Upper-mid zone (main content): y = ${Math.round(height * 0.25)} to ${Math.round(height * 0.45)}
- Center zone (images/features): y = ${Math.round(height * 0.45)} to ${Math.round(height * 0.65)}
- Lower zone (details): y = ${Math.round(height * 0.68)} to ${Math.round(height * 0.78)}
- Bottom zone (branding): y = ${Math.round(height * 0.82)} to ${Math.round(height * 0.95)}
- More vertical space available - spread elements out!
` : `
HORIZONTAL FORMAT (${width}x${height}):
- Wide format - use left-right layouts or strong horizontal flow
- Left zone: x = ${Math.round(width * 0.15)} to ${Math.round(width * 0.40)}
- Center zone: x = ${Math.round(width * 0.40)} to ${Math.round(width * 0.60)}
- Right zone: x = ${Math.round(width * 0.60)} to ${Math.round(width * 0.85)}
`}

${backgroundAnalysis ? `
🎯 BACKGROUND ANALYSIS - POSITION ELEMENTS HERE:
═══════════════════════════════════════════════════════════════════════════════
SUGGESTED LAYOUT FROM BACKGROUND:
${JSON.stringify(suggestedLayout, null, 2)}

Text Color: ${textColor}
${needsTextBg ? `⚠️ Background is busy - ADD text background with ${textBgStyle} style` : 'Background is clear - text can be placed directly'}
` : `
Use these optimal positions for ${width}x${height}:
- Headline: y=${Math.round(height * 0.18)}, centered at x=${Math.round(width/2)}
- Subheadline: y=${Math.round(height * 0.28)}
- Main content/image: y=${Math.round(height * 0.45)}
- Details: y=${Math.round(height * 0.65)}
- Business logo: y=${Math.round(height * 0.78)}
- Business name: y=${Math.round(height * 0.86)}
- Contact info: y=${Math.round(height * 0.93)}
`}

═══════════════════════════════════════════════════════════════════════════════
🔢 Z-INDEX LAYERING (YOU MUST SET zIndex FOR EACH ELEMENT):
═══════════════════════════════════════════════════════════════════════════════
Layer elements properly from back to front:
- zIndex 1-9: Background shapes, decorative elements (BACK)
- zIndex 10-19: Secondary shapes, frames, borders
- zIndex 20-29: Images (photos, product images)
- zIndex 30-39: Main text (headlines, body text)
- zIndex 40-49: Secondary text (details, subtitles)
- zIndex 50-59: Business branding (logo, name, contact) - ALWAYS ON TOP

IMPORTANT: Higher zIndex = closer to front. Set zIndex explicitly for EVERY element!

DESIGN DIRECTION:
${designConcept.creativeConcept}

COLOR PALETTE:
- Primary: ${colors.primary}
- Secondary: ${colors.secondary}
- Accent: ${colors.accent}
- Text: ${textColor}

═══════════════════════════════════════════════════════════════════════════════
🎨 CREATE A UNIQUE DESIGN - NOT A BORING TEMPLATE!
═══════════════════════════════════════════════════════════════════════════════

Based on your "${designConcept.layoutStyle}" layout style, create something SPECIAL:

${designConcept.layoutStyle === 'split' ? `
SPLIT LAYOUT IDEAS:
- Divide canvas diagonally with shape (rotation: 15-45°)
- Left side: bold color block with headline
- Right side: details and branding
- Or top/bottom split with contrasting sections
` : ''}
${designConcept.layoutStyle === 'oversized' ? `
OVERSIZED TYPOGRAPHY:
- Make the main word HUGE (fontSize: 100-150px)
- Let it bleed off edges or overlap other elements
- Small supporting text creates contrast
` : ''}
${designConcept.layoutStyle === 'asymmetric' ? `
ASYMMETRIC LAYOUT:
- Place headline off-center (x: ${Math.round(width * 0.3)} or ${Math.round(width * 0.7)})
- Balance with shapes or text on opposite side
- Create visual tension that's interesting
` : ''}
${designConcept.layoutStyle === 'layered' ? `
LAYERED DEPTH:
- Add shapes BEHIND text for contrast
- Use shadows and overlapping elements
- Create sense of depth with varying opacity
` : ''}
${designConcept.layoutStyle === 'framed' ? `
FRAMED DESIGN:
- Create a border/frame around content
- Frame can be decorative shapes or lines
- Content sits elegantly inside
` : ''}
${designConcept.layoutStyle === 'diagonal' ? `
DIAGONAL LAYOUT:
- Rotate text elements slightly (-5° to 5°)
- Add diagonal line accents
- Creates dynamic, energetic feel
` : ''}

CONTENT TO CREATE (based on "${prompt}"):
1. MAIN HEADLINE - Eye-catching text based on request
2. SUPPORTING TEXT - Additional details if needed
3. DECORATIVE SHAPES - Add 2-3 shapes for visual interest (set low zIndex: 1-9)

═══════════════════════════════════════════════════════════════════════════════
📝 DYNAMIC PLACEHOLDERS (ADD ONLY IF USER'S REQUEST NEEDS THEM):
═══════════════════════════════════════════════════════════════════════════════
Analyze the user's request "${prompt}" and ONLY add placeholders that are needed:

• If about a PERSON (employee, team member, birthday, welcome, achievement):
  - Add person_photo (image placeholder, circular, zIndex: 25)
  - Add person_name (text with {{person_name}}, zIndex: 35)
  - Add designation if relevant (text with {{designation}}, zIndex: 34)

• If about a COUNTRY/DESTINATION (visa, travel, immigration):
  - Add country placeholder (text with {{country}}, zIndex: 35)

• If about a PRODUCT/SERVICE:
  - Add product_image placeholder if needed (zIndex: 25)

• If about an EVENT:
  - Add event_date, event_time, event_venue placeholders as needed

DO NOT add person placeholders for generic posts like sales, offers, announcements.
ONLY add what the user's request specifically needs!

═══════════════════════════════════════════════════════════════════════════════
🏢 MANDATORY BUSINESS ELEMENTS - YOU MUST CREATE ALL 4:
═══════════════════════════════════════════════════════════════════════════════

1. BUSINESS LOGO (REQUIRED):
{
  "id": "business_logo",
  "type": "image",
  "name": "Business Logo",
  "x": ${Math.round(width/2)},
  "y": ${suggestedLayout.businessLogo?.y || Math.round(height * 0.72)},
  "width": ${suggestedLayout.businessLogo?.size || 90},
  "height": ${suggestedLayout.businessLogo?.size || 90},
  "borderRadius": 0,
  "isPlaceholder": true,
  "placeholderKey": "business_logo"
}

2. BUSINESS NAME (REQUIRED):
{
  "id": "business_name",
  "type": "text",
  "name": "Business Name",
  "x": ${Math.round(width/2)},
  "y": ${suggestedLayout.businessName?.y || Math.round(height * 0.82)},
  "width": ${Math.round(width * 0.8)},
  "text": "{{business_name}}",
  "fontSize": ${suggestedLayout.businessName?.fontSize || Math.round(width * 0.04)},
  "fontFamily": "Montserrat",
  "fontWeight": "700",
  "color": "${suggestedLayout.businessName?.textColor || textColor}",
  "textAlign": "center",
  "isPlaceholder": true,
  "placeholderKey": "business_name"
}

3. BUSINESS ADDRESS (REQUIRED):
{
  "id": "business_address",
  "type": "text",
  "name": "Business Address",
  "x": ${Math.round(width/2)},
  "y": ${suggestedLayout.businessAddress?.y || Math.round(height * 0.89)},
  "width": ${Math.round(width * 0.85)},
  "text": "{{business_address}}",
  "fontSize": ${suggestedLayout.businessAddress?.fontSize || Math.round(width * 0.018)},
  "fontFamily": "Inter",
  "fontWeight": "400",
  "color": "${textColor}",
  "textAlign": "center",
  "isPlaceholder": true,
  "placeholderKey": "business_address"
}

4. CONTACT INFO (REQUIRED):
{
  "id": "contact_info",
  "type": "text",
  "name": "Contact Information",
  "x": ${Math.round(width/2)},
  "y": ${suggestedLayout.contactInfo?.y || Math.round(height * 0.94)},
  "width": ${Math.round(width * 0.9)},
  "text": "{{contact_info}}",
  "fontSize": ${suggestedLayout.contactInfo?.fontSize || Math.round(width * 0.016)},
  "fontFamily": "Inter",
  "fontWeight": "400",
  "color": "${textColor}",
  "textAlign": "center",
  "isPlaceholder": true,
  "placeholderKey": "contact_info"
}

⚠️ COPY THESE 4 ELEMENTS EXACTLY INTO YOUR RESPONSE!

CREATIVE POSITIONING - Don't just center everything!
- Try: left-aligned headline at x=${Math.round(width * 0.25)} with textAlign "left"
- Or: right-aligned at x=${Math.round(width * 0.75)} with textAlign "right"
- Or: staggered elements at different x positions
- Mix sizes dramatically: huge + tiny creates interest

ADD DECORATIVE SHAPES (2-5 elements):
- Accent lines: thin rectangles (width: 100-300, height: 3-8)
- Circles: for badges, bullets, or decoration
- Rectangles: for color blocks, frames, or highlights
- Use colors: ${colors.primary}, ${colors.secondary}, ${colors.accent}
- Vary opacity: 30%, 50%, 70%, 100%

═══════════════════════════════════════════════════════════════════════════════
📝 AVAILABLE GOOGLE FONTS (use ONLY these exact names):
═══════════════════════════════════════════════════════════════════════════════

DISPLAY/HEADLINES (bold, attention-grabbing):
• "Oswald" - Bold condensed, high impact (weights: 200-700)
• "Playfair Display" - Elegant serif (weights: 400-900)
• "Abril Fatface" - Display headlines (weight: 400 only)
• "Bebas Neue" - Ultra bold display (weight: 400 only)
• "Montserrat" - Modern versatile (weights: 100-900)

BODY/READABLE (clean, professional):
• "Inter" - Screen-optimized (weights: 100-900)
• "Poppins" - Geometric clean (weights: 100-900)
• "Open Sans" - Highly readable (weights: 300-800)
• "Lato" - Friendly sans (weights: 100-900)
• "Roboto" - Android default (weights: 100-900)
• "Raleway" - Elegant thin-bold (weights: 100-900)
• "Nunito" - Rounded friendly (weights: 200-900)
• "Source Sans Pro" - Professional (weights: 200-900)
• "Quicksand" - Modern rounded (weights: 300-700)

SERIF/ELEGANT:
• "Lora" - Elegant serif (weights: 400-700)
• "Merriweather" - Readable serif (weights: 300-900)

DECORATIVE:
• "Dancing Script" - Handwriting (weights: 400-700)

PICK 2 FONTS THAT CONTRAST (e.g., Oswald + Inter, Playfair Display + Poppins)

🎯 FONT WEIGHT GUIDE - USE VARIETY!
═══════════════════════════════════════════════════════════════════════════════
You MUST choose appropriate font weights for each text element:
- Headlines: Use BOLD weights (700, 800, 900) for impact
- Subheadlines: Use SEMI-BOLD (600) or MEDIUM (500)
- Body text: Use REGULAR (400) or LIGHT (300)
- Fine print/contact: Use LIGHT (300) or THIN (200)
- Mix weights for visual hierarchy! Don't use the same weight everywhere.

ELEMENT STRUCTURE (EVERY ELEMENT MUST HAVE ALL REQUIRED FIELDS):
{
  "id": "unique_id",
  "type": "text|shape|image",
  "name": "Descriptive Name",
  "x": number (center X position in pixels),
  "y": number (center Y position in pixels),
  "width": number (element width in pixels),
  "height": number (for shapes/images),
  "zIndex": number (REQUIRED! 1-59, controls layering - see z-index guide above),

  // Text properties - CHOOSE FONTS AND WEIGHTS CAREFULLY!
  "text": "Content",
  "fontSize": number in PIXELS (min ${MIN_FONT_SIZE}px - this is the actual size used),
  "fontFamily": "Font Name from list above",
  "fontWeight": "100|200|300|400|500|600|700|800|900" (REQUIRED - pick based on element importance),
  "color": "#hex",
  "textAlign": "left|center|right",
  "textTransform": "none|uppercase",
  "letterSpacing": 0-8,
  "textShadow": "2px 2px 8px rgba(0,0,0,0.4)",
  "rotation": -15 to 15,

  // Shape properties
  "shapeType": "rect|circle",
  "fill": "#hex",
  "stroke": "#hex",
  "strokeWidth": 0-10,
  "opacity": 0-100,
  "borderRadius": number,

  // Placeholder properties (for dynamic content)
  "isPlaceholder": true/false,
  "placeholderKey": "business_logo|business_name|business_address|contact_info|person_name|person_photo|designation|country|product_image|event_date"
}

📝 DYNAMIC TEXT WITH PLACEHOLDERS:
You can mix static text with {{placeholder}} patterns that get replaced with dynamic values:
Examples:
- "DESTINATION {{country}}" → "DESTINATION AUSTRALIA"
- "Welcome {{person_name}}!" → "Welcome John Smith!"
- "Employee of {{month}}" → "Employee of January"
- "{{person_name}} - {{designation}}" → "John Smith - Software Engineer"
This allows creating flexible templates where users fill in the dynamic parts.

Return ONLY this JSON:
{
  "templateName": "Creative Name for This Design",
  "backgroundPrompt": "Vivid description of background that matches your creative vision",
  "backgroundStyle": "vibrant|luxury|minimal|festive|corporate",
  "colorPalette": {
    "primary": "${colors.primary}",
    "secondary": "${colors.secondary}",
    "accent": "${colors.accent}",
    "textPrimary": "${colors.text}"
  },
  "googleFontsImport": "@import url('...');",
  "elements": [
    // Your creative elements - be UNIQUE!
    // Include main content + decorative shapes + business branding
  ]
}

🚨 CRITICAL REQUIREMENTS:
- Make this design DIFFERENT from a standard centered layout
- Use your "${designConcept.layoutStyle}" layout approach
- Add personality with decorative elements (shapes with low zIndex: 1-9)
- MUST include: business_logo, business_name, business_address, contact_info
- SET zIndex FOR EVERY ELEMENT (shapes: 1-9, images: 20-29, text: 30-49, branding: 50-59)
- Position elements BEAUTIFULLY based on the ${width}x${height} canvas dimensions
- Font sizes should be appropriate for the canvas size and element importance
`
      });

      const structureText = structureResult.text;

      // Parse the structure JSON
      const jsonMatch = structureText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse template structure');
      }

      const templateStructure = JSON.parse(this.cleanJsonString(jsonMatch[0]));

      // Validate and fix elements, and build placeholders
      const placeholders = templateStructure.placeholders || {};

      // NOTE: Placeholders are now determined dynamically by the AI based on user request
      // No forced person/designation placeholders - AI decides what fields to include
      console.log('Prompt analysis - AI will determine appropriate placeholders based on user request');

      // FAILSAFE: Ensure mandatory business elements exist with ACTUAL business data
      // Build contact info string from business data
      const contactParts = [];
      if (businessInfo.phone) contactParts.push(`📞 ${businessInfo.phone}`);
      if (businessInfo.email) contactParts.push(`✉️ ${businessInfo.email}`);
      if (businessInfo.website) contactParts.push(`🌐 ${businessInfo.website}`);
      const contactInfoText = contactParts.join('  |  ') || '{{contact_info}}';

      // Get logo URL from business info
      const logoUrl = businessInfo.logo || businessInfo.logoUrl || '';
      console.log('Logo URL for template:', logoUrl || 'NO LOGO PROVIDED');

      // NOTE: Person/designation/country placeholders are now decided by AI based on user request
      // Only business branding elements are mandatory

      const mandatoryElements = [
        {
          id: 'business_logo',
          type: 'image',
          name: 'Business Logo',
          x: Math.round(width / 2),
          y: suggestedLayout.businessLogo?.y || Math.round(height * 0.72),
          width: suggestedLayout.businessLogo?.size || 90,
          height: suggestedLayout.businessLogo?.size || 90,
          borderRadius: 0,
          src: logoUrl,  // Actual logo URL
          isPlaceholder: !logoUrl,  // Only placeholder if no logo
          placeholderKey: 'business_logo',
          zIndex: 50  // High zIndex - logo on top
        },
        {
          id: 'business_name',
          type: 'text',
          name: 'Business Name',
          x: Math.round(width / 2),
          y: suggestedLayout.businessName?.y || Math.round(height * 0.82),
          width: Math.round(width * 0.8),
          text: businessInfo.name || '{{business_name}}',  // Actual business name
          fontSize: suggestedLayout.businessName?.fontSize || Math.round(width * 0.04),
          fontFamily: 'Montserrat',
          fontWeight: '700',
          color: textColor,
          textAlign: 'center',
          isPlaceholder: !businessInfo.name,
          placeholderKey: 'business_name',
          zIndex: 51  // Above logo
        },
        {
          id: 'business_address',
          type: 'text',
          name: 'Business Address',
          x: Math.round(width / 2),
          y: suggestedLayout.businessAddress?.y || Math.round(height * 0.89),
          width: Math.round(width * 0.85),
          text: businessInfo.address || '{{business_address}}',  // Actual address
          fontSize: suggestedLayout.businessAddress?.fontSize || Math.round(width * 0.018),
          fontFamily: 'Inter',
          fontWeight: '400',
          color: textColor,
          textAlign: 'center',
          isPlaceholder: !businessInfo.address,
          placeholderKey: 'business_address',
          zIndex: 52
        },
        {
          id: 'contact_info',
          type: 'text',
          name: 'Contact Information',
          x: Math.round(width / 2),
          y: suggestedLayout.contactInfo?.y || Math.round(height * 0.94),
          width: Math.round(width * 0.9),
          text: contactInfoText,  // Actual contact info
          fontSize: suggestedLayout.contactInfo?.fontSize || Math.round(width * 0.016),
          fontFamily: 'Inter',
          fontWeight: '400',
          color: textColor,
          textAlign: 'center',
          isPlaceholder: contactParts.length === 0,
          placeholderKey: 'contact_info',
          zIndex: 53  // Topmost text
        }
      ];

      // Initialize elements array if not present
      if (!templateStructure.elements) {
        templateStructure.elements = [];
      }

      // Check which mandatory elements are missing and add them
      // Also update existing elements with actual business data
      for (const mandatoryEl of mandatoryElements) {
        const existingIndex = templateStructure.elements.findIndex(el =>
          el.placeholderKey === mandatoryEl.placeholderKey ||
          el.id === mandatoryEl.id
        );

        if (existingIndex === -1) {
          // Element doesn't exist, add it
          console.log(`Adding missing mandatory element: ${mandatoryEl.placeholderKey}`, mandatoryEl.type === 'image' ? `src: ${mandatoryEl.src}` : '');
          templateStructure.elements.push(mandatoryEl);
        } else {
          // Element exists, update it with actual business data
          const existing = templateStructure.elements[existingIndex];
          console.log(`Updating existing element with business data: ${mandatoryEl.placeholderKey}`);

          // Update with actual values from mandatory element (which has real business data)
          if (mandatoryEl.text && !mandatoryEl.text.includes('{{')) {
            existing.text = mandatoryEl.text;
            existing.isPlaceholder = false;
          }
          if (mandatoryEl.src) {
            console.log(`Setting logo src to: ${mandatoryEl.src}`);
            existing.src = mandatoryEl.src;
            existing.isPlaceholder = false;
          }
          // Keep the higher zIndex for proper layering
          existing.zIndex = Math.max(existing.zIndex || 0, mandatoryEl.zIndex);
        }
      }

      // Process elements from AI - placeholders are determined by AI based on user request
      if (templateStructure.elements && Array.isArray(templateStructure.elements)) {
        templateStructure.elements = templateStructure.elements.map((el, index) => {
          const elementId = el.id || `${el.type || 'text'}_${Date.now()}_${index}`;

          // Check if element has placeholder
          const isPlaceholder = el.isPlaceholder || (el.text && el.text.includes('{{'));
          let placeholderKey = el.placeholderKey;

          // Extract placeholder key from text if not provided
          if (!placeholderKey && el.text) {
            const match = el.text.match(/\{\{(\w+)\}\}/);
            if (match) {
              placeholderKey = match[1];
            }
          }

          // Build dynamicProperties for placeholders
          const dynamicProperties = {};
          if (isPlaceholder && placeholderKey) {
            const propertyName = el.type === 'image' ? 'src' : 'text';
            dynamicProperties[propertyName] = {
              isDynamic: true,
              placeholder: placeholderKey
            };

            // Add to placeholders object if not already there
            if (!placeholders[placeholderKey]) {
              placeholders[placeholderKey] = {
                name: el.name || placeholderKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                type: el.type === 'image' ? 'image' : 'text',
                property: propertyName,
                elementId: elementId,
                defaultValue: el.type === 'image' ? '' : (el.text || '').replace(/\{\{.*?\}\}/g, '').trim() || `Enter ${placeholderKey.replace(/_/g, ' ')}`
              };
            }
          }

          // Calculate responsive font size with minimum sizes for important elements
          let defaultFontSize = el.fontSize || 48;

          // ENFORCE MINIMUM FONT SIZE: 10pt (~11px for 1080px canvas)
          if (defaultFontSize < MIN_FONT_SIZE) {
            defaultFontSize = MIN_FONT_SIZE;
          }

          // Ensure business name is EXTRA LARGE and prominent (minimum 4% of canvas width = ~43px for 1080px)
          if (el.placeholderKey === 'business_name' || el.id?.includes('business_name')) {
            const minBusinessFontSize = Math.round(width * 0.040);  // 4.0% = 43px for 1080px - BIGGER!
            if (defaultFontSize < minBusinessFontSize) {
              defaultFontSize = minBusinessFontSize;
            }
          }

          // Ensure person names are readable (minimum 3.2% = ~35px for 1080px)
          if (el.placeholderKey === 'person_name' || el.id?.includes('person_name')) {
            const minPersonFontSize = Math.round(width * 0.032);  // 3.2% = 35px for 1080px
            if (defaultFontSize < minPersonFontSize) {
              defaultFontSize = minPersonFontSize;
            }
          }

          // Scale contact info and address based on business name size
          if (el.placeholderKey === 'contact_info' || el.placeholderKey === 'business_address' ||
              el.id?.includes('contact') || el.id?.includes('address')) {
            const businessNameFontSize = Math.round(width * 0.040);  // Reference business name size
            const scaledSize = Math.round(businessNameFontSize * 0.42);  // 42% of business name
            const minSize = Math.max(MIN_FONT_SIZE, scaledSize);
            if (defaultFontSize < minSize) {
              defaultFontSize = minSize;
            }
          }

          // Ensure phone, email, website are readable
          if (el.placeholderKey === 'phone' || el.placeholderKey === 'email' || el.placeholderKey === 'website' ||
              el.id?.includes('phone') || el.id?.includes('email') || el.id?.includes('website')) {
            const minDetailSize = Math.max(MIN_FONT_SIZE, Math.round(width * 0.016));  // ~17px minimum
            if (defaultFontSize < minDetailSize) {
              defaultFontSize = minDetailSize;
            }
          }

          const fontSizePercent = el.fontSizePercent || ((defaultFontSize / width) * 100);

          // Normalize border radius - support both number and object format
          let borderRadius = el.borderRadius;
          if (typeof borderRadius === 'number') {
            borderRadius = {
              topLeft: borderRadius,
              topRight: borderRadius,
              bottomLeft: borderRadius,
              bottomRight: borderRadius,
              unit: 'px'
            };
          } else if (!borderRadius || typeof borderRadius !== 'object') {
            borderRadius = {
              topLeft: 0,
              topRight: 0,
              bottomLeft: 0,
              bottomRight: 0,
              unit: 'px'
            };
          }

          // Normalize padding - support both number and object format
          let padding = el.padding;
          if (typeof padding === 'number') {
            padding = {
              top: padding,
              right: padding,
              bottom: padding,
              left: padding
            };
          } else if (!padding || typeof padding !== 'object') {
            padding = { top: 0, right: 0, bottom: 0, left: 0 };
          }

          // Normalize border - support both shorthand and object format
          let border = el.border;
          if (typeof border === 'string') {
            // Parse shorthand like "2px solid #fff"
            const parts = border.split(' ');
            border = {
              width: parseInt(parts[0]) || 0,
              style: parts[1] || 'solid',
              color: parts[2] || '#000000'
            };
          } else if (!border || typeof border !== 'object') {
            border = {
              width: el.borderWidth || 0,
              style: 'solid',
              color: el.borderColor || '#000000'
            };
          }

          // Calculate zIndex based on element type and purpose for proper layering
          // Layer order (bottom to top):
          // 1-9: Background shapes, decorative elements
          // 10-19: Content images (product photos, etc.)
          // 20-29: Main content text (headlines, body)
          // 30-39: Secondary text (details, descriptions)
          // 40-49: Decorative overlays
          // 50-59: Business branding (logo, name, contact) - ALWAYS ON TOP
          let zIndex = el.zIndex;
          if (zIndex === undefined) {
            // Business elements get highest priority
            if (el.placeholderKey === 'business_logo' || el.id === 'business_logo') {
              zIndex = 50;
            } else if (el.placeholderKey === 'business_name' || el.id === 'business_name') {
              zIndex = 51;
            } else if (el.placeholderKey === 'business_address' || el.id === 'business_address') {
              zIndex = 52;
            } else if (el.placeholderKey === 'contact_info' || el.id === 'contact_info') {
              zIndex = 53;
            }
            // Other elements by type
            else if (el.type === 'shape') {
              zIndex = 5 + index;  // Shapes at bottom
            } else if (el.type === 'image') {
              if (el.placeholderKey === 'person_photo') {
                zIndex = 15;  // Person photos in middle
              } else {
                zIndex = 10 + index;  // Other images
              }
            } else {
              // Text elements
              const isHeadline = el.name?.toLowerCase().includes('headline') ||
                                el.name?.toLowerCase().includes('title') ||
                                el.fontSize > Math.round(width * 0.05);
              zIndex = isHeadline ? 25 : 30 + index;
            }
          }

          // Calculate element dimensions first based on element type and purpose
          let elWidth, elHeight;

          if (el.type === 'image') {
            // Different defaults for different image types
            if (el.placeholderKey === 'business_logo' || el.id?.includes('logo')) {
              elWidth = el.width || 100;  // Logo: 100x100
              elHeight = el.height || 100;
            } else if (el.placeholderKey === 'person_photo' || el.id?.includes('person') || el.id?.includes('photo')) {
              elWidth = el.width || 220;  // Person photo: 220x220
              elHeight = el.height || 220;
            } else {
              elWidth = el.width || 200;  // Default image
              elHeight = el.height || 200;
            }
          } else if (el.type === 'shape') {
            elWidth = el.width || 200;
            elHeight = el.height || 100;
          } else {
            // Text elements
            elWidth = el.width || Math.round(width * 0.75);
            elHeight = el.height;
          }

          // Calculate safe bounds for center position
          const safeMargin = 60;
          const minX = safeMargin + (elWidth / 2);
          const maxX = width - safeMargin - (elWidth / 2);
          const minY = safeMargin + ((elHeight || 50) / 2);
          const maxY = height - safeMargin - ((elHeight || 50) / 2);

          // Default to center if not specified, otherwise clamp to safe bounds
          let posX = el.x !== undefined ? el.x : Math.round(width / 2);
          let posY = el.y !== undefined ? el.y : Math.round(height / 2);

          // For centered text elements (most common), always use exact center
          if (el.type === 'text' && (!el.textAlign || el.textAlign === 'center')) {
            posX = Math.round(width / 2);
          }

          // Set proper default Y positions based on element purpose and background analysis
          // Use suggestedLayout from background analysis when available
          if (el.type === 'image') {
            posX = Math.round(width / 2); // Always center images horizontally

            if (el.placeholderKey === 'business_logo' || el.id?.includes('logo')) {
              // Business logo: use background analysis or default
              if (el.y === undefined) {
                posY = suggestedLayout?.businessLogo?.y || Math.round(height * 0.72);
              }
            } else if (el.placeholderKey === 'person_photo' || el.id?.includes('person') || el.id?.includes('photo')) {
              // Person photo: use mainContent zone or center of canvas
              if (el.y === undefined) {
                posY = suggestedLayout?.mainContent?.y || Math.round(height * 0.45);
              }
            }
          }

          // Set proper default Y positions for text elements based on purpose and background analysis
          if (el.type === 'text') {
            if (el.placeholderKey === 'business_name' || el.id?.includes('business_name')) {
              // Business name: use background analysis or default
              if (el.y === undefined) {
                posY = suggestedLayout?.businessName?.y || Math.round(height * 0.82);
              }
            } else if (el.placeholderKey === 'business_address' || el.id?.includes('address')) {
              // Business address: use background analysis or default
              if (el.y === undefined) {
                posY = suggestedLayout?.businessAddress?.y || Math.round(height * 0.89);
              }
            } else if (el.placeholderKey === 'contact_info' || el.id?.includes('contact')) {
              // Contact info: use background analysis or default
              if (el.y === undefined) {
                posY = suggestedLayout?.contactInfo?.y || Math.round(height * 0.94);
              }
            } else if (el.name?.toLowerCase().includes('headline') || el.name?.toLowerCase().includes('title')) {
              // Headlines: use background analysis
              if (el.y === undefined) {
                posY = suggestedLayout?.headline?.y || Math.round(height * 0.18);
              }
            } else if (el.name?.toLowerCase().includes('subhead')) {
              // Subheadlines: use background analysis
              if (el.y === undefined) {
                posY = suggestedLayout?.subheadline?.y || Math.round(height * 0.30);
              }
            }
          }

          // Clamp positions to safe bounds
          posX = Math.min(Math.max(posX, minX), maxX);
          posY = Math.min(Math.max(posY, minY), maxY);

          // Get flat border radius values
          const brTopLeft = typeof borderRadius === 'object' ? borderRadius.topLeft : borderRadius;
          const brTopRight = typeof borderRadius === 'object' ? borderRadius.topRight : borderRadius;
          const brBottomLeft = typeof borderRadius === 'object' ? borderRadius.bottomLeft : borderRadius;
          const brBottomRight = typeof borderRadius === 'object' ? borderRadius.bottomRight : borderRadius;
          const brUniform = typeof borderRadius === 'number' ? borderRadius : (brTopLeft || 0);

          // Get flat padding values
          const padTop = typeof padding === 'object' ? padding.top : padding;
          const padRight = typeof padding === 'object' ? padding.right : padding;
          const padBottom = typeof padding === 'object' ? padding.bottom : padding;
          const padLeft = typeof padding === 'object' ? padding.left : padding;
          const padUniform = typeof padding === 'number' ? padding : (padTop || 0);

          return {
            id: elementId,
            type: el.type || 'text',
            name: el.name || `Element ${index + 1}`,
            // Flat position properties (x,y are CENTER of element)
            x: posX,
            y: posY,
            width: elWidth,
            height: elHeight,
            // Text content
            text: el.text || el.content || '',
            src: el.src || '',
            // Typography - all flat properties
            fontSize: defaultFontSize,
            fontSizePercent: fontSizePercent,
            fontFamily: el.fontFamily || 'Inter',
            fontWeight: String(el.fontWeight || '600'),
            fontStyle: el.fontStyle || 'normal',
            color: el.color || '#ffffff',
            textAlign: el.textAlign || 'center',
            lineHeight: el.lineHeight || 1.2,
            letterSpacing: el.letterSpacing || 0,
            textTransform: el.textTransform || 'none',
            textShadow: el.textShadow || '',
            // Background - flat properties
            backgroundColor: el.backgroundColor || '#000000',
            backgroundOpacity: el.backgroundOpacity || 0,
            backgroundBlur: el.backgroundBlur || 0,
            // Border radius - flat properties (both uniform and per-corner)
            borderRadius: brUniform,
            borderRadiusTopLeft: brTopLeft || 0,
            borderRadiusTopRight: brTopRight || 0,
            borderRadiusBottomLeft: brBottomLeft || 0,
            borderRadiusBottomRight: brBottomRight || 0,
            // Padding - flat properties (both uniform and per-side)
            padding: padUniform,
            paddingTop: padTop || 0,
            paddingRight: padRight || 0,
            paddingBottom: padBottom || 0,
            paddingLeft: padLeft || 0,
            // Border - flat properties
            borderColor: (typeof border === 'object' ? border.color : el.borderColor) || '#000000',
            borderWidth: (typeof border === 'object' ? border.width : el.borderWidth) || 0,
            // Shape properties
            shapeType: el.shapeType || 'rect',
            fill: el.fill || '#e94560',
            stroke: el.stroke || 'transparent',
            strokeWidth: el.strokeWidth || 0,
            // Common properties
            opacity: el.opacity !== undefined ? el.opacity : 100,
            rotation: el.rotation || 0,
            visible: true,
            locked: el.locked || false,
            zIndex: zIndex,
            // Placeholder support
            isPlaceholder: isPlaceholder,
            placeholderKey: placeholderKey || null,
            dynamicProperties: dynamicProperties
          };
        });
      }

      // Add placeholders to the result
      templateStructure.placeholders = placeholders;

      // Debug: Log final logo element
      const finalLogoEl = templateStructure.elements?.find(el => el.placeholderKey === 'business_logo' || el.id === 'business_logo');
      console.log('Final logo element:', finalLogoEl ? { id: finalLogoEl.id, src: finalLogoEl.src, isPlaceholder: finalLogoEl.isPlaceholder } : 'NOT FOUND');

      // Background was already generated in Step 2 above
      // Only generate here if it wasn't generated earlier or if we need a different one
      if (!backgroundData && generateBackground && templateStructure.backgroundPrompt) {
        console.log('Generating background from template structure prompt (fallback)...');
        try {
          backgroundData = await this.generateBackground(
            templateStructure.backgroundPrompt,
            {
              width,
              height,
              style: templateStructure.backgroundStyle || style,
              category: platform
            }
          );
        } catch (bgError) {
          console.error('Background generation failed:', bgError);
          // Continue without background
        }
      }

      // Mark all elements as AI-controlled so editor/generate won't override positions/sizes
      const aiControlledElements = (templateStructure.elements || []).map(el => ({
        ...el,
        aiControlled: true  // Flag to preserve AI decisions for font size and placement
      }));

      return {
        success: true,
        templateName: templateStructure.templateName || 'AI Generated Template',
        elements: aiControlledElements,
        placeholders: templateStructure.placeholders || {},
        backgroundPrompt: templateStructure.backgroundPrompt,
        backgroundStyle: templateStructure.backgroundStyle,
        background: backgroundData,
        colorPalette: templateStructure.colorPalette || {
          primary: '#FFD700',
          secondary: '#FF6B35',
          accent: '#9B2335',
          background: '#1A1A2E',
          textPrimary: '#FFFFFF',
          textSecondary: 'rgba(255,255,255,0.85)'
        },
        googleFonts: {
          import: templateStructure.googleFontsImport || "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Poppins:wght@300;400;500;600&display=swap');",
          families: this.extractFontFamilies(templateStructure.elements || [])
        },
        aiControlled: true,  // Template-level flag for AI control
        metadata: {
          width,
          height,
          platform,
          contentType,
          generatedAt: new Date().toISOString(),
          version: '2.1',
          designConcept: designConcept,
          backgroundAnalysis: backgroundAnalysis,
          minFontSize: MIN_FONT_SIZE,
          aiControlled: true
        }
      };
    } catch (error) {
      console.error('Complete template generation error:', error);
      throw new Error(`Failed to generate template: ${error.message}`);
    }
  }

  /**
   * Edit an existing template using AI instructions
   * @param {Object} currentTemplate - Current template state
   * @param {string} instruction - User's edit instruction
   * @returns {Promise<Object>} Updated template
   */
  async editTemplateWithAI(currentTemplate, instruction) {
    await this.ensureInitialized();
    if (!this.ai) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `
You are a template editor AI. The user wants to modify their template.

Current template state:
${JSON.stringify(currentTemplate, null, 2)}

User instruction: "${instruction}"

Apply the user's changes to the template. You can:
- Modify existing elements (change text, colors, positions, sizes, fonts)
- Change element styling (borderRadius, backgroundColor, backgroundOpacity, borderColor, borderWidth, padding, opacity)
- Add new elements
- Remove elements
- Change background settings

Return ONLY valid JSON with the updated template:
{
  "elements": [...updated elements array...],
  "background": {
    "type": "color" | "gradient" | "image",
    "value": "color hex" | {"start": "#hex", "end": "#hex", "direction": "to bottom"} | "unchanged"
  },
  "changes": ["list of changes made"],
  "newBackgroundPrompt": "if background needs regeneration, provide a prompt, otherwise null"
}

Important:
- Preserve element IDs when modifying existing elements
- Keep all required properties for each element
- If background doesn't need to change, set background.value to "unchanged"
- Be precise with positioning (canvas is ${currentTemplate.width || 1080}x${currentTemplate.height || 1080})
`
      });

      const text = result.text;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }

      const updates = JSON.parse(this.cleanJsonString(jsonMatch[0]));

      // Validate elements
      if (updates.elements && Array.isArray(updates.elements)) {
        const canvasWidth = currentTemplate.width || 1080;
        const canvasHeight = currentTemplate.height || 1080;
        const MIN_FONT_SIZE = Math.max(11, Math.round(canvasWidth * 0.01));  // 10pt minimum

        updates.elements = updates.elements.map((el, index) => {
          const br = el.borderRadius || 0;
          const brNum = typeof br === 'number' ? br : 0;
          const pad = el.padding || 0;
          const padNum = typeof pad === 'number' ? pad : 0;
          let fontSize = el.fontSize || 48;

          // Enforce minimum font size
          if (fontSize < MIN_FONT_SIZE) {
            fontSize = MIN_FONT_SIZE;
          }

          // Enforce bigger business name
          if (el.placeholderKey === 'business_name' || el.id?.includes('business_name')) {
            const minBusinessSize = Math.round(canvasWidth * 0.040);  // 4% minimum
            if (fontSize < minBusinessSize) fontSize = minBusinessSize;
          }

          const fontSizePercent = el.fontSizePercent || ((fontSize / canvasWidth) * 100);

          // For centered text, use canvas center
          let posX = el.x || Math.round(canvasWidth / 2);
          if (el.type === 'text' && (!el.textAlign || el.textAlign === 'center')) {
            posX = Math.round(canvasWidth / 2);
          }

          return {
            id: el.id || `${el.type || 'text'}_${Date.now()}_${index}`,
            type: el.type || 'text',
            name: el.name || `Element ${index + 1}`,
            x: posX,
            y: el.y || Math.round(canvasHeight / 2),
            width: el.width || 400,
            height: el.height,
            text: el.text || el.content || '',
            src: el.src || '',
            fontSize: fontSize,
            fontSizePercent: fontSizePercent,
            fontFamily: el.fontFamily || 'Inter',
            fontWeight: String(el.fontWeight || '600'),
            fontStyle: el.fontStyle || 'normal',
            color: el.color || '#ffffff',
            textAlign: el.textAlign || 'center',
            lineHeight: el.lineHeight || 1.2,
            letterSpacing: el.letterSpacing || 0,
            textTransform: el.textTransform || 'none',
            textShadow: el.textShadow || '',
            backgroundColor: el.backgroundColor || '#000000',
            backgroundOpacity: el.backgroundOpacity || 0,
            backgroundBlur: el.backgroundBlur || 0,
            borderRadius: brNum,
            borderRadiusTopLeft: el.borderRadiusTopLeft || brNum,
            borderRadiusTopRight: el.borderRadiusTopRight || brNum,
            borderRadiusBottomLeft: el.borderRadiusBottomLeft || brNum,
            borderRadiusBottomRight: el.borderRadiusBottomRight || brNum,
            padding: padNum,
            paddingTop: el.paddingTop || padNum,
            paddingRight: el.paddingRight || padNum,
            paddingBottom: el.paddingBottom || padNum,
            paddingLeft: el.paddingLeft || padNum,
            borderColor: el.borderColor || '#000000',
            borderWidth: el.borderWidth || 0,
            shapeType: el.shapeType || 'rect',
            fill: el.fill || '#e94560',
            stroke: el.stroke || 'transparent',
            strokeWidth: el.strokeWidth || 0,
            opacity: el.opacity !== undefined ? el.opacity : 100,
            rotation: el.rotation || 0,
            visible: el.visible !== false,
            locked: el.locked || false,
            zIndex: el.zIndex || (10 + index),
            isPlaceholder: el.isPlaceholder || false,
            placeholderKey: el.placeholderKey || null,
            dynamicProperties: el.dynamicProperties || {}
          };
        });
      }

      return {
        success: true,
        ...updates
      };
    } catch (error) {
      console.error('Template editing error:', error);
      throw new Error(`Failed to edit template: ${error.message}`);
    }
  }

  /**
   * Suggest improvements for a background prompt
   * @param {string} prompt - Original prompt
   * @returns {Promise<Object>} Suggestions
   */
  async suggestPromptImprovements(prompt) {
    await this.ensureInitialized();
    if (!this.ai) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `
You are a social media design expert. Given this background image request: "${prompt}"

Suggest 3 improved prompts that would generate better backgrounds for social media posts.
Consider:
- Visual appeal
- Text overlay compatibility
- Brand-friendly designs
- Current design trends

Format as JSON array with keys: prompt, reason
`
      });

      const text = result.text;

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(this.cleanJsonString(jsonMatch[0]));
      }

      return [{ prompt: prompt, reason: 'Original prompt' }];
    } catch (error) {
      console.error('Suggestion error:', error);
      return [{ prompt: prompt, reason: 'Original prompt' }];
    }
  }
}

module.exports = new GeminiService();
