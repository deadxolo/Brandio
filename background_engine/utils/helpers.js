/**
 * Utility functions for Background Engine
 */

/**
 * Sanitize a string for use as a filename
 * @param {string} str - Input string
 * @returns {string} Sanitized filename-safe string
 */
function sanitizeFilename(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

/**
 * Extract keywords from text
 * @param {string} text - Input text
 * @param {number} maxKeywords - Maximum keywords to extract
 * @returns {Array<string>} Extracted keywords
 */
function extractKeywords(text, maxKeywords = 10) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
    'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now'
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Count word frequency
  const wordCount = {};
  for (const word of words) {
    wordCount[word] = (wordCount[word] || 0) + 1;
  }

  // Sort by frequency and return top keywords
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Calculate similarity between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
function stringSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;

  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Format file size for display
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get relative time string
 * @param {Date|string} date - Date to format
 * @returns {string} Relative time string
 */
function getRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) return then.toLocaleDateString();
  if (diffDays > 1) return `${diffDays} days ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffHours > 1) return `${diffHours} hours ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffMins > 1) return `${diffMins} minutes ago`;
  if (diffMins === 1) return '1 minute ago';
  return 'Just now';
}

/**
 * Validate image dimensions
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Object} Validation result
 */
function validateDimensions(width, height) {
  const minSize = 100;
  const maxSize = 4096;

  const errors = [];

  if (width < minSize || width > maxSize) {
    errors.push(`Width must be between ${minSize} and ${maxSize}`);
  }

  if (height < minSize || height > maxSize) {
    errors.push(`Height must be between ${minSize} and ${maxSize}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate a random ID
 * @param {number} length - ID length
 * @returns {string} Random ID
 */
function generateId(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Parse color from hex string
 * @param {string} hex - Hex color string
 * @returns {Object} RGB values
 */
function parseHexColor(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Calculate responsive font size based on canvas width
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} fontSizePercent - Font size as percentage of canvas width
 * @param {Object} options - Min/max constraints
 * @returns {number} Calculated font size in pixels
 */
function calculateResponsiveFontSize(canvasWidth, fontSizePercent, options = {}) {
  const { min = 12, max = 120 } = options;
  const calculatedSize = Math.round(canvasWidth * (fontSizePercent / 100));
  return Math.min(Math.max(calculatedSize, min), max);
}

/**
 * Get font size presets for different element types
 * @param {number} canvasWidth - Canvas width in pixels
 * @returns {Object} Font size presets
 */
function getFontSizePresets(canvasWidth) {
  return {
    headline: {
      percent: 6.67,
      size: calculateResponsiveFontSize(canvasWidth, 6.67, { min: 48, max: 120 }),
      label: 'Main Headline'
    },
    subheadline: {
      percent: 2.59,
      size: calculateResponsiveFontSize(canvasWidth, 2.59, { min: 20, max: 48 }),
      label: 'Subheadline'
    },
    body: {
      percent: 2.22,
      size: calculateResponsiveFontSize(canvasWidth, 2.22, { min: 16, max: 36 }),
      label: 'Body Text'
    },
    label: {
      percent: 1.48,
      size: calculateResponsiveFontSize(canvasWidth, 1.48, { min: 12, max: 24 }),
      label: 'Labels'
    },
    contact: {
      percent: 1.30,
      size: calculateResponsiveFontSize(canvasWidth, 1.30, { min: 12, max: 20 }),
      label: 'Contact Info'
    }
  };
}

/**
 * Normalize border radius - convert number or shorthand to per-corner object
 * @param {number|Object|string} borderRadius - Border radius value
 * @returns {Object} Normalized border radius object
 */
function normalizeBorderRadius(borderRadius) {
  if (typeof borderRadius === 'number') {
    return {
      topLeft: borderRadius,
      topRight: borderRadius,
      bottomLeft: borderRadius,
      bottomRight: borderRadius,
      unit: 'px'
    };
  }

  if (typeof borderRadius === 'string') {
    // Parse CSS shorthand like "10px 20px 10px 20px" (TL TR BR BL)
    const values = borderRadius.match(/\d+/g);
    if (values) {
      const nums = values.map(Number);
      if (nums.length === 1) {
        return { topLeft: nums[0], topRight: nums[0], bottomLeft: nums[0], bottomRight: nums[0], unit: 'px' };
      } else if (nums.length === 2) {
        return { topLeft: nums[0], topRight: nums[1], bottomLeft: nums[0], bottomRight: nums[1], unit: 'px' };
      } else if (nums.length === 4) {
        return { topLeft: nums[0], topRight: nums[1], bottomRight: nums[2], bottomLeft: nums[3], unit: 'px' };
      }
    }
  }

  if (typeof borderRadius === 'object' && borderRadius !== null) {
    return {
      topLeft: borderRadius.topLeft || 0,
      topRight: borderRadius.topRight || 0,
      bottomLeft: borderRadius.bottomLeft || 0,
      bottomRight: borderRadius.bottomRight || 0,
      unit: borderRadius.unit || 'px'
    };
  }

  return { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0, unit: 'px' };
}

/**
 * Convert border radius object to CSS string
 * @param {Object} borderRadius - Border radius object
 * @returns {string} CSS border-radius value
 */
function borderRadiusToCSS(borderRadius) {
  const br = normalizeBorderRadius(borderRadius);
  const unit = br.unit || 'px';
  return `${br.topLeft}${unit} ${br.topRight}${unit} ${br.bottomRight}${unit} ${br.bottomLeft}${unit}`;
}

/**
 * Normalize padding - convert number or shorthand to per-side object
 * @param {number|Object|string} padding - Padding value
 * @returns {Object} Normalized padding object
 */
function normalizePadding(padding) {
  if (typeof padding === 'number') {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }

  if (typeof padding === 'string') {
    const values = padding.match(/\d+/g);
    if (values) {
      const nums = values.map(Number);
      if (nums.length === 1) {
        return { top: nums[0], right: nums[0], bottom: nums[0], left: nums[0] };
      } else if (nums.length === 2) {
        return { top: nums[0], right: nums[1], bottom: nums[0], left: nums[1] };
      } else if (nums.length === 4) {
        return { top: nums[0], right: nums[1], bottom: nums[2], left: nums[3] };
      }
    }
  }

  if (typeof padding === 'object' && padding !== null) {
    return {
      top: padding.top || 0,
      right: padding.right || 0,
      bottom: padding.bottom || 0,
      left: padding.left || 0
    };
  }

  return { top: 0, right: 0, bottom: 0, left: 0 };
}

/**
 * Convert padding object to CSS string
 * @param {Object} padding - Padding object
 * @returns {string} CSS padding value
 */
function paddingToCSS(padding) {
  const p = normalizePadding(padding);
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
}

/**
 * Layer manipulation functions for elements
 */
const layerUtils = {
  /**
   * Bring element to front (highest zIndex)
   * @param {Array} elements - All elements
   * @param {string} elementId - Element to bring to front
   * @returns {Array} Updated elements array
   */
  bringToFront(elements, elementId) {
    const maxZ = Math.max(...elements.map(el => el.zIndex || 0));
    return elements.map(el =>
      el.id === elementId ? { ...el, zIndex: maxZ + 1 } : el
    );
  },

  /**
   * Send element to back (lowest zIndex)
   * @param {Array} elements - All elements
   * @param {string} elementId - Element to send to back
   * @returns {Array} Updated elements array
   */
  sendToBack(elements, elementId) {
    const minZ = Math.min(...elements.map(el => el.zIndex || 0));
    return elements.map(el =>
      el.id === elementId ? { ...el, zIndex: Math.max(1, minZ - 1) } : el
    );
  },

  /**
   * Bring element forward (zIndex + 1)
   * @param {Array} elements - All elements
   * @param {string} elementId - Element to bring forward
   * @returns {Array} Updated elements array
   */
  bringForward(elements, elementId) {
    const element = elements.find(el => el.id === elementId);
    if (!element) return elements;

    const currentZ = element.zIndex || 0;
    // Find element directly above
    const aboveElement = elements.find(el => el.zIndex === currentZ + 1);

    return elements.map(el => {
      if (el.id === elementId) {
        return { ...el, zIndex: currentZ + 1 };
      }
      if (aboveElement && el.id === aboveElement.id) {
        return { ...el, zIndex: currentZ };
      }
      return el;
    });
  },

  /**
   * Send element backward (zIndex - 1)
   * @param {Array} elements - All elements
   * @param {string} elementId - Element to send backward
   * @returns {Array} Updated elements array
   */
  sendBackward(elements, elementId) {
    const element = elements.find(el => el.id === elementId);
    if (!element) return elements;

    const currentZ = element.zIndex || 0;
    if (currentZ <= 1) return elements; // Already at back

    // Find element directly below
    const belowElement = elements.find(el => el.zIndex === currentZ - 1);

    return elements.map(el => {
      if (el.id === elementId) {
        return { ...el, zIndex: currentZ - 1 };
      }
      if (belowElement && el.id === belowElement.id) {
        return { ...el, zIndex: currentZ };
      }
      return el;
    });
  },

  /**
   * Normalize zIndex values to be sequential
   * @param {Array} elements - All elements
   * @returns {Array} Elements with normalized zIndex
   */
  normalizeZIndex(elements) {
    const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    return sorted.map((el, index) => ({ ...el, zIndex: index + 1 }));
  },

  /**
   * Get elements sorted by layer (zIndex)
   * @param {Array} elements - All elements
   * @param {string} order - 'asc' or 'desc'
   * @returns {Array} Sorted elements
   */
  getSortedByLayer(elements, order = 'asc') {
    return [...elements].sort((a, b) =>
      order === 'asc'
        ? (a.zIndex || 0) - (b.zIndex || 0)
        : (b.zIndex || 0) - (a.zIndex || 0)
    );
  }
};

/**
 * Check if text needs background blur based on color similarity
 * @param {string} textColor - Text color (hex)
 * @param {string} bgColor - Background color (hex)
 * @param {number} threshold - Similarity threshold (0-1)
 * @returns {Object} Recommendation for blur settings
 */
function checkTextVisibility(textColor, bgColor, threshold = 0.3) {
  const text = parseHexColor(textColor);
  const bg = parseHexColor(bgColor);

  if (!text || !bg) {
    return { needsBlur: false, recommendedBlur: 0 };
  }

  // Calculate color difference (simple Euclidean distance)
  const diff = Math.sqrt(
    Math.pow(text.r - bg.r, 2) +
    Math.pow(text.g - bg.g, 2) +
    Math.pow(text.b - bg.b, 2)
  );

  // Max possible difference is ~441 (white to black)
  const similarity = 1 - (diff / 441);

  if (similarity > threshold) {
    // Colors are too similar, recommend blur
    return {
      needsBlur: true,
      similarity: similarity,
      recommendedBlur: Math.round(8 + (similarity * 12)), // 8-20px
      recommendedBgOpacity: Math.round(20 + (similarity * 30)) // 20-50%
    };
  }

  return { needsBlur: false, similarity: similarity, recommendedBlur: 0 };
}

/**
 * Generate CSS backdrop-filter for background blur
 * @param {number} blurAmount - Blur amount in pixels
 * @param {string} bgColor - Background color
 * @param {number} bgOpacity - Background opacity (0-100)
 * @returns {Object} CSS properties for frosted glass effect
 */
function generateBackdropBlur(blurAmount, bgColor = '#000000', bgOpacity = 30) {
  const rgb = parseHexColor(bgColor);
  const rgba = rgb
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${bgOpacity / 100})`
    : `rgba(0, 0, 0, ${bgOpacity / 100})`;

  return {
    backdropFilter: `blur(${blurAmount}px)`,
    WebkitBackdropFilter: `blur(${blurAmount}px)`,
    backgroundColor: rgba
  };
}

/**
 * Position calculation utilities for canvas elements
 */
const positionUtils = {
  /**
   * Calculate safe position bounds for an element
   * @param {number} canvasWidth - Canvas width
   * @param {number} canvasHeight - Canvas height
   * @param {number} elementWidth - Element width
   * @param {number} elementHeight - Element height (use 0 for auto-height text)
   * @param {number} margin - Safe margin from edges (default 60)
   * @returns {Object} Min/max bounds for center position
   */
  getSafeBounds(canvasWidth, canvasHeight, elementWidth, elementHeight = 0, margin = 60) {
    const halfWidth = elementWidth / 2;
    const halfHeight = elementHeight / 2 || 25; // Default 50px height for text

    return {
      minX: margin + halfWidth,
      maxX: canvasWidth - margin - halfWidth,
      minY: margin + halfHeight,
      maxY: canvasHeight - margin - halfHeight,
      centerX: Math.round(canvasWidth / 2),
      centerY: Math.round(canvasHeight / 2)
    };
  },

  /**
   * Clamp position to safe bounds
   * @param {number} x - Desired X position
   * @param {number} y - Desired Y position
   * @param {Object} bounds - Bounds object from getSafeBounds
   * @returns {Object} Clamped x,y position
   */
  clampPosition(x, y, bounds) {
    return {
      x: Math.min(Math.max(x, bounds.minX), bounds.maxX),
      y: Math.min(Math.max(y, bounds.minY), bounds.maxY)
    };
  },

  /**
   * Get recommended positions for common element types
   * @param {number} canvasWidth - Canvas width
   * @param {number} canvasHeight - Canvas height
   * @returns {Object} Position presets for different zones
   */
  getPositionPresets(canvasWidth, canvasHeight) {
    const centerX = Math.round(canvasWidth / 2);
    return {
      headline: { x: centerX, y: Math.round(canvasHeight * 0.14), zone: 'header' },
      subheadline: { x: centerX, y: Math.round(canvasHeight * 0.24), zone: 'header' },
      mainContent: { x: centerX, y: Math.round(canvasHeight * 0.45), zone: 'center' },
      message: { x: centerX, y: Math.round(canvasHeight * 0.55), zone: 'center' },
      details: { x: centerX, y: Math.round(canvasHeight * 0.70), zone: 'lower' },
      logo: { x: centerX, y: Math.round(canvasHeight * 0.78), zone: 'footer' },
      businessName: { x: centerX, y: Math.round(canvasHeight * 0.86), zone: 'footer' },
      contact: { x: centerX, y: Math.round(canvasHeight * 0.93), zone: 'footer' }
    };
  },

  /**
   * Calculate element edges from center position
   * @param {number} centerX - Center X position
   * @param {number} centerY - Center Y position
   * @param {number} width - Element width
   * @param {number} height - Element height
   * @returns {Object} Element edges (left, right, top, bottom)
   */
  getElementEdges(centerX, centerY, width, height) {
    return {
      left: centerX - (width / 2),
      right: centerX + (width / 2),
      top: centerY - (height / 2),
      bottom: centerY + (height / 2)
    };
  },

  /**
   * Check if element is within canvas bounds
   * @param {Object} position - Position {x, y}
   * @param {Object} size - Size {width, height}
   * @param {number} canvasWidth - Canvas width
   * @param {number} canvasHeight - Canvas height
   * @param {number} margin - Safe margin
   * @returns {Object} Validation result with overflow info
   */
  validatePosition(position, size, canvasWidth, canvasHeight, margin = 60) {
    const edges = this.getElementEdges(position.x, position.y, size.width, size.height || 50);

    const overflow = {
      left: edges.left < margin,
      right: edges.right > canvasWidth - margin,
      top: edges.top < margin,
      bottom: edges.bottom > canvasHeight - margin
    };

    return {
      valid: !overflow.left && !overflow.right && !overflow.top && !overflow.bottom,
      overflow,
      edges,
      suggestion: {
        x: overflow.left || overflow.right ? Math.round(canvasWidth / 2) : position.x,
        y: overflow.top ? margin + (size.height || 50) / 2 :
           overflow.bottom ? canvasHeight - margin - (size.height || 50) / 2 : position.y
      }
    };
  },

  /**
   * Get maximum safe width for an element at a given x position
   * @param {number} centerX - Center X position
   * @param {number} canvasWidth - Canvas width
   * @param {number} margin - Safe margin
   * @returns {number} Maximum width that won't overflow
   */
  getMaxWidth(centerX, canvasWidth, margin = 60) {
    const distanceToLeft = centerX - margin;
    const distanceToRight = canvasWidth - margin - centerX;
    return Math.min(distanceToLeft, distanceToRight) * 2;
  }
};

/**
 * Context menu actions configuration
 */
const contextMenuConfig = {
  layerActions: [
    { action: 'bringToFront', label: 'Bring to Front', shortcut: 'Ctrl+Shift+]', icon: 'layers-top' },
    { action: 'bringForward', label: 'Bring Forward', shortcut: 'Ctrl+]', icon: 'layer-up' },
    { action: 'sendBackward', label: 'Send Backward', shortcut: 'Ctrl+[', icon: 'layer-down' },
    { action: 'sendToBack', label: 'Send to Back', shortcut: 'Ctrl+Shift+[', icon: 'layers-bottom' }
  ],
  editActions: [
    { action: 'duplicate', label: 'Duplicate', shortcut: 'Ctrl+D', icon: 'copy' },
    { action: 'delete', label: 'Delete', shortcut: 'Delete', icon: 'trash' },
    { action: 'lock', label: 'Lock/Unlock', shortcut: 'Ctrl+L', icon: 'lock' },
    { action: 'hide', label: 'Show/Hide', shortcut: 'Ctrl+H', icon: 'eye' }
  ],
  alignActions: [
    { action: 'alignLeft', label: 'Align Left', icon: 'align-left' },
    { action: 'alignCenter', label: 'Align Center', icon: 'align-center' },
    { action: 'alignRight', label: 'Align Right', icon: 'align-right' },
    { action: 'alignTop', label: 'Align Top', icon: 'align-top' },
    { action: 'alignMiddle', label: 'Align Middle', icon: 'align-middle' },
    { action: 'alignBottom', label: 'Align Bottom', icon: 'align-bottom' }
  ]
};

module.exports = {
  sanitizeFilename,
  extractKeywords,
  stringSimilarity,
  formatFileSize,
  getRelativeTime,
  validateDimensions,
  generateId,
  parseHexColor,
  // New responsive typography helpers
  calculateResponsiveFontSize,
  getFontSizePresets,
  // Border radius helpers
  normalizeBorderRadius,
  borderRadiusToCSS,
  // Padding helpers
  normalizePadding,
  paddingToCSS,
  // Layer manipulation utilities
  layerUtils,
  // Position calculation utilities
  positionUtils,
  // Text visibility and blur helpers
  checkTextVisibility,
  generateBackdropBlur,
  // Context menu configuration
  contextMenuConfig
};
