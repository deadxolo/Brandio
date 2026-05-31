const path = require('path');
require('dotenv').config();

module.exports = {
  // Server settings
  server: {
    port: process.env.BG_ENGINE_PORT || 3001,
    host: process.env.HOST || '0.0.0.0'
  },

  // Gemini AI settings
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-pro', // Top Gemini model for reasoning/text
    textModel: 'gemini-2.5-pro', // Top Gemini model for template structure
    imageModel: 'gemini-2.5-flash-image' // Gemini image generation model
  },

  // Background storage settings
  storage: {
    backgroundsPath: process.env.BACKGROUNDS_PATH || path.join(__dirname, '../backgrounds'),
    metadataFile: 'backgrounds_index.json'
  },

  // Image settings
  image: {
    defaultWidth: 1080,
    defaultHeight: 1080,
    formats: ['png', 'jpg', 'webp'],
    defaultFormat: 'png',
    safeZone: {
      top: 100,
      bottom: 100,
      left: 60,
      right: 60
    }
  },

  // Typography settings with Google Fonts
  typography: {
    // Font size recommendations based on 1080px canvas
    fontSizes: {
      headline: { min: 64, max: 96, recommended: 72 },
      subheadline: { min: 28, max: 40, recommended: 32 },
      body: { min: 20, max: 28, recommended: 24 },
      label: { min: 14, max: 18, recommended: 16 },
      contact: { min: 12, max: 16, recommended: 14 }
    },

    // Recommended Google Fonts with metadata
    googleFonts: {
      display: [
        {
          family: 'Playfair Display',
          weights: [400, 500, 600, 700, 800, 900],
          category: 'serif',
          usage: 'Premium headlines, elegant titles',
          pairsWith: ['Lato', 'Open Sans', 'Poppins']
        },
        {
          family: 'Montserrat',
          weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
          category: 'sans-serif',
          usage: 'Modern headlines, versatile display',
          pairsWith: ['Open Sans', 'Lora', 'Roboto']
        },
        {
          family: 'Oswald',
          weights: [200, 300, 400, 500, 600, 700],
          category: 'sans-serif',
          usage: 'Bold condensed headlines, high impact',
          pairsWith: ['Lato', 'Open Sans', 'Roboto']
        },
        {
          family: 'Abril Fatface',
          weights: [400],
          category: 'display',
          usage: 'Dramatic display, special occasions',
          pairsWith: ['Lato', 'Open Sans']
        }
      ],
      body: [
        {
          family: 'Poppins',
          weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
          category: 'sans-serif',
          usage: 'Clean body text, UI elements',
          pairsWith: ['Playfair Display', 'Lora']
        },
        {
          family: 'Open Sans',
          weights: [300, 400, 500, 600, 700, 800],
          category: 'sans-serif',
          usage: 'Highly readable body text',
          pairsWith: ['Montserrat', 'Oswald', 'Playfair Display']
        },
        {
          family: 'Lato',
          weights: [100, 300, 400, 700, 900],
          category: 'sans-serif',
          usage: 'Friendly and professional',
          pairsWith: ['Playfair Display', 'Oswald']
        },
        {
          family: 'Inter',
          weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
          category: 'sans-serif',
          usage: 'Screen optimized, small text',
          pairsWith: ['Playfair Display', 'Montserrat']
        },
        {
          family: 'Roboto',
          weights: [100, 300, 400, 500, 700, 900],
          category: 'sans-serif',
          usage: 'Clean modern look',
          pairsWith: ['Roboto Slab', 'Montserrat']
        }
      ],
      accent: [
        {
          family: 'Lora',
          weights: [400, 500, 600, 700],
          styles: ['normal', 'italic'],
          category: 'serif',
          usage: 'Quotes, elegant messages, emphasis',
          pairsWith: ['Poppins', 'Open Sans', 'Lato']
        },
        {
          family: 'Dancing Script',
          weights: [400, 500, 600, 700],
          category: 'handwriting',
          usage: 'Signatures, decorative accents',
          pairsWith: ['Montserrat', 'Open Sans']
        }
      ]
    },

    // Font pairing presets for different occasions
    fontPairings: {
      festive: {
        headline: 'Playfair Display',
        subheadline: 'Poppins',
        body: 'Open Sans',
        accent: 'Lora'
      },
      corporate: {
        headline: 'Montserrat',
        subheadline: 'Open Sans',
        body: 'Inter',
        accent: 'Roboto'
      },
      celebration: {
        headline: 'Abril Fatface',
        subheadline: 'Poppins',
        body: 'Lato',
        accent: 'Dancing Script'
      },
      minimal: {
        headline: 'Inter',
        subheadline: 'Inter',
        body: 'Inter',
        accent: 'Lora'
      },
      luxury: {
        headline: 'Playfair Display',
        subheadline: 'Montserrat',
        body: 'Lato',
        accent: 'Lora'
      }
    }
  },

  // Color palette presets
  colorPalettes: {
    festive: {
      primary: '#FFD700',
      secondary: '#FF6B35',
      accent: '#9B2335',
      background: '#1A0A2E',
      textLight: '#FFFFFF',
      textDark: '#1A1A2E'
    },
    corporate: {
      primary: '#2563EB',
      secondary: '#1E40AF',
      accent: '#3B82F6',
      background: '#F8FAFC',
      textLight: '#FFFFFF',
      textDark: '#1E293B'
    },
    celebration: {
      primary: '#F59E0B',
      secondary: '#EF4444',
      accent: '#8B5CF6',
      background: '#1F2937',
      textLight: '#FFFFFF',
      textDark: '#111827'
    },
    nature: {
      primary: '#10B981',
      secondary: '#059669',
      accent: '#34D399',
      background: '#F0FDF4',
      textLight: '#FFFFFF',
      textDark: '#064E3B'
    },
    minimal: {
      primary: '#374151',
      secondary: '#6B7280',
      accent: '#111827',
      background: '#FFFFFF',
      textLight: '#FFFFFF',
      textDark: '#1F2937'
    },
    luxury: {
      primary: '#D4AF37',
      secondary: '#1A1A2E',
      accent: '#C0A062',
      background: '#0F0F1A',
      textLight: '#FFFFFF',
      textDark: '#D4AF37'
    }
  },

  // Gemini prompt quality keywords
  promptQuality: {
    resolution: ['8K resolution', 'ultra high definition', '4K quality', 'high resolution'],
    style: ['photorealistic', 'professional photography', 'cinematic', 'premium quality'],
    lighting: ['volumetric lighting', 'golden hour', 'soft diffused light', 'dramatic lighting', 'studio lighting'],
    effects: ['bokeh', 'depth of field', 'subtle grain', 'vignette', 'particle effects'],
    composition: ['rule of thirds', 'balanced composition', 'visual hierarchy', 'centered focus'],
    avoid: ['text', 'watermark', 'logo', 'people', 'faces', 'blurry', 'low quality', 'pixelated']
  },

  // Festival/occasion keywords for matching
  occasions: [
    'diwali', 'holi', 'christmas', 'eid', 'new year', 'thanksgiving',
    'independence day', 'republic day', 'valentine', 'mother day', 'father day',
    'easter', 'halloween', 'durga puja', 'ganesh chaturthi', 'navratri',
    'raksha bandhan', 'makar sankranti', 'pongal', 'onam', 'baisakhi',
    'guru nanak jayanti', 'mahashivratri', 'janmashtami', 'karwa chauth',
    'birthday', 'anniversary', 'wedding', 'graduation', 'promotion',
    'summer', 'winter', 'spring', 'autumn', 'monsoon',
    'sale', 'discount', 'offer', 'launch', 'announcement'
  ],

  // Categories for backgrounds
  categories: [
    'festival', 'celebration', 'business', 'nature', 'abstract',
    'seasonal', 'promotional', 'social', 'corporate', 'creative'
  ],

  // Element positioning guidelines for 1080x1080 canvas
  positioning: {
    canvas1080: {
      headerZone: { yMin: 80, yMax: 270 },
      upperMid: { yMin: 270, yMax: 486 },
      center: { yMin: 486, yMax: 702 },
      lowerMid: { yMin: 702, yMax: 864 },
      footer: { yMin: 864, yMax: 1048 },
      safeMargin: 60,
      centerX: 540,
      centerY: 540
    }
  }
};
