# Background Engine API Documentation

## Overview

The Background Engine is an AI-powered background generator for social media posts using Google's Gemini AI. This API allows you to generate, upload, search, and manage background images.

**Base URL:** `http://localhost:3001/api`

**Version:** 1.0.0

---

## Table of Contents

1. [Authentication](#authentication)
2. [Backgrounds API](#backgrounds-api)
   - [Generate Background](#generate-background)
   - [Upload Background](#upload-background)
   - [Search Backgrounds](#search-backgrounds)
   - [List All Backgrounds](#list-all-backgrounds)
   - [Get Background by ID](#get-background-by-id)
   - [Get Background Image](#get-background-image)
   - [Get Backgrounds by Occasion](#get-backgrounds-by-occasion)
   - [Delete Background](#delete-background)
   - [Get Autocomplete Suggestions](#get-autocomplete-suggestions)
   - [Analyze Background](#analyze-background)
   - [Improve Prompt](#improve-prompt)
   - [Get Categories](#get-categories)
   - [Get Occasions](#get-occasions)
3. [Integration API](#integration-api)
   - [Smart Get Background](#smart-get-background)
   - [Batch Backgrounds](#batch-backgrounds)
   - [Festivals Today](#festivals-today)
   - [Background for Post](#background-for-post)
   - [Get Statistics](#get-statistics)
   - [Health Check](#health-check)
4. [Settings API](#settings-api)
   - [Get API Status](#get-api-status)
   - [Save API Key](#save-api-key)
   - [Delete API Key](#delete-api-key)
   - [Get Settings](#get-settings)
5. [Data Models](#data-models)
6. [Error Handling](#error-handling)
7. [Integration Examples](#integration-examples)

---

## Authentication

Currently, the API does not require authentication. The Gemini API key is configured server-side either via environment variables or through the Settings API.

---

## Backgrounds API

### Generate Background

Generate a new background image using Gemini AI.

**Endpoint:** `POST /api/backgrounds/generate`

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Description of the background to generate |
| `category` | string | No | `"general"` | Category: festival, business, nature, etc. |
| `style` | string | No | `"vibrant"` | Style: vibrant, minimal, gradient, festive, corporate, nature, abstract |
| `width` | number | No | `1080` | Width in pixels |
| `height` | number | No | `1080` | Height in pixels |
| `forceNew` | boolean | No | `false` | Force new generation even if matches exist |
| `occasion` | string | No | `""` | Festival/occasion name (e.g., diwali, christmas) |

**Example Request:**

```json
{
  "prompt": "Diwali festival celebration with diyas and colorful lights",
  "category": "festival",
  "style": "festive",
  "occasion": "diwali",
  "forceNew": false
}
```

**Success Response (New Generation):**

```json
{
  "success": true,
  "type": "generated",
  "message": "New background generated successfully",
  "background": {
    "id": "78ec01bc-17e6-4255-aeed-6368533188b4",
    "filename": "diwali_festival_celebration_1768204614004",
    "imagePath": "diwali_festival_celebration_1768204614004.png",
    "prompt": "Diwali festival celebration with diyas and colorful lights",
    "description": "A vibrant Diwali background...",
    "category": "festival",
    "occasion": "diwali",
    "tags": ["diwali", "festival", "celebration"],
    "metadata": {
      "width": 1080,
      "height": 1080,
      "style": "festive",
      "mimeType": "image/png",
      "size": 1257981,
      "createdAt": "2026-01-12T07:56:54.009Z"
    },
    "location": {
      "absolute": "/path/to/backgrounds/diwali_festival_celebration_1768204614004.png",
      "relative": "./backgrounds/diwali_festival_celebration_1768204614004.png",
      "url": "/api/backgrounds/image/diwali_festival_celebration_1768204614004.png"
    }
  }
}
```

**Success Response (Existing Found):**

```json
{
  "success": true,
  "type": "existing",
  "message": "Found existing backgrounds matching your query",
  "suggestions": [...],
  "generateNewUrl": "/api/backgrounds/generate",
  "generateNewBody": { "prompt": "...", "forceNew": true }
}
```

---

### Upload Background

Upload a background image from your device.

**Endpoint:** `POST /api/backgrounds/upload`

**Content-Type:** `multipart/form-data`

**Form Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file | Yes | Image file (PNG, JPG, WebP, max 10MB) |
| `name` | string | Yes | Background name for searching |
| `category` | string | No | Category of the background |
| `occasion` | string | No | Related occasion/festival |
| `description` | string | No | Brief description |
| `tags` | string | No | Comma-separated tags |

**Example Request (using curl):**

```bash
curl -X POST http://localhost:3001/api/backgrounds/upload \
  -F "image=@/path/to/image.png" \
  -F "name=Diwali Background" \
  -F "category=festival" \
  -F "occasion=diwali" \
  -F "tags=festive,colorful,lights"
```

**Success Response:**

```json
{
  "success": true,
  "message": "Background uploaded successfully",
  "background": {
    "id": "2c0064f9-bd68-4cde-9b99-ed5fa98bfa09",
    "filename": "diwali_background_1768205143826",
    "imagePath": "diwali_background_1768205143826.jpg",
    "prompt": "Diwali Background",
    "description": "Diwali Background",
    "category": "festival",
    "occasion": "diwali",
    "tags": ["festive", "colorful", "lights"],
    "metadata": {
      "mimeType": "image/jpeg",
      "size": 49417,
      "createdAt": "2026-01-12T08:05:43.830Z",
      "source": "upload"
    },
    "location": {
      "url": "/api/backgrounds/image/diwali_background_1768205143826.jpg"
    }
  }
}
```

---

### Search Backgrounds

Search for existing backgrounds by query.

**Endpoint:** `GET /api/backgrounds/search`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query |
| `category` | string | No | - | Filter by category |
| `occasion` | string | No | - | Filter by occasion |
| `limit` | number | No | `10` | Maximum results to return |

**Example Request:**

```
GET /api/backgrounds/search?q=diwali&category=festival&limit=5
```

**Success Response:**

```json
{
  "success": true,
  "query": "diwali",
  "count": 2,
  "results": [
    {
      "id": "78ec01bc-17e6-4255-aeed-6368533188b4",
      "filename": "diwali_background_1768204614004",
      "imagePath": "diwali_background_1768204614004.png",
      "prompt": "diwali background",
      "category": "festival",
      "occasion": "diwali",
      "tags": ["diwali"]
    }
  ]
}
```

---

### List All Backgrounds

Get all backgrounds with pagination.

**Endpoint:** `GET /api/backgrounds/list`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | `1` | Page number |
| `limit` | number | No | `20` | Items per page |
| `category` | string | No | - | Filter by category |
| `sortBy` | string | No | `"createdAt"` | Sort field |
| `order` | string | No | `"desc"` | Sort order (asc/desc) |

**Example Request:**

```
GET /api/backgrounds/list?page=1&limit=10&category=festival
```

**Success Response:**

```json
{
  "success": true,
  "items": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

### Get Background by ID

Get a specific background by ID or filename.

**Endpoint:** `GET /api/backgrounds/:id`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Background ID or filename |

**Example Request:**

```
GET /api/backgrounds/diwali_background_1768204614004
```

**Success Response:**

```json
{
  "success": true,
  "background": {
    "id": "78ec01bc-17e6-4255-aeed-6368533188b4",
    "filename": "diwali_background_1768204614004",
    "imagePath": "diwali_background_1768204614004.png",
    "prompt": "diwali background",
    "description": "A vibrant Diwali background...",
    "category": "festival",
    "occasion": "diwali",
    "tags": ["diwali"],
    "metadata": {...},
    "location": {...}
  }
}
```

---

### Get Background Image

Serve the actual background image file.

**Endpoint:** `GET /api/backgrounds/image/:filename`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `filename` | string | Image filename with extension |

**Example Request:**

```
GET /api/backgrounds/image/diwali_background_1768204614004.png
```

**Response:** Binary image file with appropriate Content-Type header.

---

### Get Backgrounds by Occasion

Get all backgrounds for a specific occasion/festival.

**Endpoint:** `GET /api/backgrounds/occasion/:occasion`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `occasion` | string | Occasion name (e.g., diwali, christmas) |

**Example Request:**

```
GET /api/backgrounds/occasion/diwali
```

**Success Response:**

```json
{
  "success": true,
  "occasion": "diwali",
  "count": 3,
  "backgrounds": [...]
}
```

---

### Delete Background

Delete a background by ID or filename.

**Endpoint:** `DELETE /api/backgrounds/:id`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Background ID or filename |

**Example Request:**

```
DELETE /api/backgrounds/diwali_background_1768204614004
```

**Success Response:**

```json
{
  "success": true,
  "message": "Background deleted successfully"
}
```

---

### Get Autocomplete Suggestions

Get autocomplete suggestions for search.

**Endpoint:** `GET /api/backgrounds/suggest/autocomplete`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Partial search query (min 2 chars) |

**Example Request:**

```
GET /api/backgrounds/suggest/autocomplete?q=div
```

**Success Response:**

```json
{
  "success": true,
  "suggestions": ["diwali", "divine", "diversity"]
}
```

---

### Analyze Background

Analyze an existing image and generate metadata using AI.

**Endpoint:** `POST /api/backgrounds/analyze`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `imagePath` | string | Yes | Path to the image file |

**Success Response:**

```json
{
  "success": true,
  "analysis": {
    "description": "A vibrant festival background with traditional elements...",
    "occasions": ["diwali", "festival"],
    "colors": ["gold", "orange", "red"],
    "category": "festive",
    "keywords": "diwali, lights, celebration, traditional"
  }
}
```

---

### Improve Prompt

Get AI-powered prompt improvement suggestions.

**Endpoint:** `POST /api/backgrounds/improve-prompt`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Original prompt to improve |

**Success Response:**

```json
{
  "success": true,
  "original": "diwali background",
  "suggestions": [
    {
      "prompt": "Vibrant Diwali celebration with golden diyas, rangoli patterns, and sparkling lights",
      "reason": "More descriptive with specific visual elements"
    },
    {
      "prompt": "Elegant Diwali background with traditional oil lamps and festive decorations",
      "reason": "Emphasizes traditional elements"
    }
  ]
}
```

---

### Get Categories

Get list of available categories.

**Endpoint:** `GET /api/backgrounds/meta/categories`

**Success Response:**

```json
{
  "success": true,
  "categories": [
    "festival", "celebration", "business", "nature",
    "abstract", "seasonal", "promotional", "social",
    "corporate", "creative"
  ]
}
```

---

### Get Occasions

Get list of available occasions/festivals.

**Endpoint:** `GET /api/backgrounds/meta/occasions`

**Success Response:**

```json
{
  "success": true,
  "occasions": [
    "diwali", "holi", "christmas", "eid", "new year",
    "thanksgiving", "independence day", "valentine",
    "birthday", "anniversary", "wedding", ...
  ]
}
```

---

## Integration API

These endpoints are designed for integration with other services like auto_poster, manager, and post_generator.

### Smart Get Background

Intelligent endpoint that finds existing backgrounds or generates new ones automatically.

**Endpoint:** `POST /api/integration/get-background`

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | - | What kind of background needed |
| `category` | string | No | `"general"` | Background category |
| `preferExisting` | boolean | No | `true` | Prefer existing over generating |
| `autoGenerate` | boolean | No | `true` | Auto-generate if not found |
| `style` | string | No | `"vibrant"` | Generation style |
| `occasion` | string | No | `""` | Related occasion |

**Example Request:**

```json
{
  "query": "christmas winter celebration",
  "category": "festival",
  "preferExisting": true,
  "autoGenerate": true
}
```

**Success Response:**

```json
{
  "success": true,
  "source": "existing",
  "background": {...},
  "alternatives": [...],
  "message": "Found existing background"
}
```

---

### Batch Backgrounds

Get backgrounds for multiple queries at once.

**Endpoint:** `POST /api/integration/batch-backgrounds`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `queries` | array | Yes | Array of query objects |
| `preferExisting` | boolean | No | Prefer existing backgrounds |

**Query Object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `category` | string | No | Category filter |
| `occasion` | string | No | Occasion filter |

**Example Request:**

```json
{
  "queries": [
    { "query": "diwali", "category": "festival" },
    { "query": "christmas", "category": "festival" },
    { "query": "business promotion", "category": "business" }
  ]
}
```

**Success Response:**

```json
{
  "success": true,
  "results": [
    { "query": "diwali", "source": "existing", "background": {...} },
    { "query": "christmas", "source": "not_found", "background": null, "needsGeneration": true },
    { "query": "business promotion", "source": "existing", "background": {...} }
  ],
  "summary": {
    "total": 3,
    "found": 2,
    "needsGeneration": 1
  }
}
```

---

### Festivals Today

Get backgrounds for today's festivals/occasions.

**Endpoint:** `GET /api/integration/festivals-today`

**Success Response:**

```json
{
  "success": true,
  "date": "2026-01-12",
  "festivals": ["makar sankranti"],
  "backgrounds": [...],
  "hasBackgrounds": true
}
```

---

### Background for Post

Find the best background for specific post content.

**Endpoint:** `POST /api/integration/for-post`

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `postContent` | string | Yes | - | The post text content |
| `platform` | string | No | `"instagram"` | Target platform |
| `mood` | string | No | `"positive"` | Desired mood |
| `category` | string | No | `"general"` | Category preference |

**Example Request:**

```json
{
  "postContent": "Wishing everyone a happy and prosperous Diwali! May the festival of lights bring joy to your life.",
  "platform": "instagram",
  "mood": "festive",
  "category": "festival"
}
```

**Success Response:**

```json
{
  "success": true,
  "source": "matched",
  "backgrounds": [...],
  "recommendation": {...},
  "extractedKeywords": ["diwali", "festival", "festive"]
}
```

---

### Get Statistics

Get background engine statistics for dashboards.

**Endpoint:** `GET /api/integration/stats`

**Success Response:**

```json
{
  "success": true,
  "stats": {
    "totalBackgrounds": 25,
    "byCategory": {
      "festival": 10,
      "business": 5,
      "nature": 3,
      "general": 7
    },
    "byOccasion": {
      "diwali": 5,
      "christmas": 3,
      "birthday": 2
    },
    "availableCategories": [...],
    "availableOccasions": [...]
  }
}
```

---

### Health Check

Check if the background engine service is healthy.

**Endpoint:** `GET /api/integration/health`

**Success Response:**

```json
{
  "success": true,
  "status": "healthy",
  "service": "background_engine",
  "timestamp": "2026-01-12T08:00:00.000Z",
  "geminiConfigured": true
}
```

---

## Settings API

### Get API Status

Check if Gemini API key is configured.

**Endpoint:** `GET /api/settings/api-status`

**Success Response:**

```json
{
  "success": true,
  "configured": true,
  "source": "user"
}
```

**Source Values:**
- `"user"` - API key set by user via settings
- `"env"` - API key from environment variable
- `"none"` - No API key configured

---

### Save API Key

Save user's Gemini API key.

**Endpoint:** `POST /api/settings/api-key`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | string | Yes | Gemini API key (starts with "AIza") |

**Example Request:**

```json
{
  "apiKey": "AIzaSy..."
}
```

**Success Response:**

```json
{
  "success": true,
  "message": "API key saved successfully"
}
```

---

### Delete API Key

Remove user's saved API key.

**Endpoint:** `DELETE /api/settings/api-key`

**Success Response:**

```json
{
  "success": true,
  "message": "API key removed"
}
```

---

### Get Settings

Get current settings (without sensitive data).

**Endpoint:** `GET /api/settings`

**Success Response:**

```json
{
  "success": true,
  "settings": {
    "apiKeyConfigured": true,
    "updatedAt": "2026-01-12T08:00:00.000Z"
  }
}
```

---

## Data Models

### Background Object

```json
{
  "id": "uuid",
  "filename": "string (without extension)",
  "imagePath": "string (with extension)",
  "prompt": "string",
  "description": "string",
  "category": "string",
  "occasion": "string",
  "tags": ["string"],
  "metadata": {
    "width": "number",
    "height": "number",
    "style": "string",
    "mimeType": "string",
    "size": "number (bytes)",
    "createdAt": "ISO date string",
    "source": "string (upload | generated)"
  },
  "location": {
    "absolute": "string (full path)",
    "relative": "string (relative path)",
    "url": "string (API URL)"
  }
}
```

### Categories

Available categories:
- `festival` - Festival and celebration backgrounds
- `celebration` - General celebration themes
- `business` - Professional/corporate backgrounds
- `nature` - Nature and landscape backgrounds
- `abstract` - Abstract patterns and designs
- `seasonal` - Season-specific backgrounds
- `promotional` - Sales and promotional backgrounds
- `social` - Social media optimized
- `corporate` - Business/corporate themes
- `creative` - Creative and artistic designs

### Styles

Available generation styles:
- `vibrant` - Colorful, high-contrast, eye-catching
- `minimal` - Clean, simple, elegant
- `gradient` - Smooth gradient transitions
- `festive` - Celebratory, colorful, joyful
- `corporate` - Professional, clean, business-appropriate
- `nature` - Natural elements, organic, peaceful
- `abstract` - Abstract patterns, artistic, creative

---

## Error Handling

All endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": "Error message description"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Missing or invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

---

## Integration Examples

### Node.js Client Example

```javascript
const BackgroundClient = require('./client/BackgroundClient');

const client = new BackgroundClient({
  baseUrl: 'http://localhost:3001'
});

// Get background (finds existing or generates)
const result = await client.getBackground('diwali festival', {
  category: 'festival',
  preferExisting: true
});

console.log(result.background);
```

### Auto Poster Integration

```javascript
// Get today's festival backgrounds for auto-posting
const festivals = await client.getFestivalsToday();

if (festivals.hasBackgrounds) {
  const background = festivals.backgrounds[0];
  // Use background.location.url for the image
}
```

### Post Generator Integration

```javascript
// Find best background for post content
const result = await client.forPost(
  'Happy Diwali! Wishing you prosperity and joy.',
  { platform: 'instagram', mood: 'festive' }
);

if (result.recommendation) {
  // Use result.recommendation as the background
}
```

---

## Rate Limits

Currently, no rate limits are enforced. However, Gemini API has its own rate limits based on your API key tier.

---

## File Storage

- **Backgrounds Directory:** `./backgrounds/`
- **Image Files:** `{name}_{timestamp}.{ext}`
- **Metadata Files:** `{name}_{timestamp}.json`
- **Index File:** `backgrounds_index.json`
- **User Settings:** `config/user-settings.json`

---

## Support

For issues and feature requests, please check the project repository or contact the development team.
