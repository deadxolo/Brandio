// Twitter/X Service - Twitter API v2 integration
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const platformsConfig = require('../../../shared/config/platforms');

class TwitterService {
  constructor() {
    this.config = platformsConfig.twitter;
    this.apiUrl = this.config.apiUrl;
    this.uploadUrl = this.config.uploadUrl;
  }

  // ==================== OAuth Flow ====================

  // Exchange authorization code for access token (OAuth 2.0 PKCE)
  async exchangeCodeForToken(code, codeVerifier) {
    try {
      const params = new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        code_verifier: codeVerifier
      });

      const response = await axios.post(
        this.config.tokenUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
          }
        }
      );

      return {
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type,
        scope: response.data.scope
      };

    } catch (error) {
      console.error('[TwitterService] Token exchange error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_description || error.response?.data?.error || error.message
      };
    }
  }

  // Refresh access token
  async refreshToken(refreshToken) {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId
      });

      const response = await axios.post(
        this.config.tokenUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
          }
        }
      );

      return {
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in
      };

    } catch (error) {
      console.error('[TwitterService] Token refresh error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_description || error.message
      };
    }
  }

  // Get authenticated user info
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(`${this.apiUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          'user.fields': 'id,name,username,profile_image_url'
        }
      });

      return response.data.data;

    } catch (error) {
      console.error('[TwitterService] Get user info error:', error.response?.data || error.message);
      throw error;
    }
  }

  // ==================== Media Upload ====================

  // Upload media to Twitter (v1.1 endpoint for media)
  async uploadMedia(imageSource, options = {}) {
    const { tokens } = options;

    try {
      // Get image buffer
      const imageBuffer = await this.getImageBuffer(imageSource);

      // Initialize upload
      const initResponse = await axios.post(
        `${this.uploadUrl}/media/upload.json`,
        null,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          },
          params: {
            command: 'INIT',
            total_bytes: imageBuffer.length,
            media_type: 'image/png'
          }
        }
      );

      const mediaId = initResponse.data.media_id_string;

      // Append data
      await axios.post(
        `${this.uploadUrl}/media/upload.json`,
        null,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          params: {
            command: 'APPEND',
            media_id: mediaId,
            segment_index: 0,
            media_data: imageBuffer.toString('base64')
          }
        }
      );

      // Finalize upload
      await axios.post(
        `${this.uploadUrl}/media/upload.json`,
        null,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          },
          params: {
            command: 'FINALIZE',
            media_id: mediaId
          }
        }
      );

      return {
        success: true,
        mediaId
      };

    } catch (error) {
      console.error('[TwitterService] Media upload error:', error.response?.data || error.message);
      const err = new Error(error.response?.data?.errors?.[0]?.message || 'Media upload failed');
      err.code = error.response?.data?.errors?.[0]?.code;
      throw err;
    }
  }

  // ==================== Tweet Publishing ====================

  // Create a tweet
  async createTweet(options) {
    const { tokens, text, mediaIds } = options;

    try {
      const tweetData = {
        text: text || ''
      };

      if (mediaIds && mediaIds.length > 0) {
        tweetData.media = {
          media_ids: Array.isArray(mediaIds) ? mediaIds : [mediaIds]
        };
      }

      const response = await axios.post(
        `${this.apiUrl}/tweets`,
        tweetData,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        platformPostId: response.data.data.id,
        platformUrl: `https://twitter.com/i/status/${response.data.data.id}`
      };

    } catch (error) {
      console.error('[TwitterService] Create tweet error:', error.response?.data || error.message);
      const err = new Error(error.response?.data?.detail || error.response?.data?.title || 'Tweet creation failed');
      err.code = error.response?.data?.type;
      throw err;
    }
  }

  // ==================== Unified Publish Method ====================

  async publish(options) {
    const { post, tokens, mediaId, caption, platform } = options;

    let uploadedMediaId = mediaId;

    // Upload media if present and not already uploaded
    if (post.image_url && !uploadedMediaId) {
      const uploadResult = await this.uploadMedia(post.image_url, { tokens });
      uploadedMediaId = uploadResult.mediaId;
    }

    // Create tweet
    return this.createTweet({
      tokens,
      text: caption,
      mediaIds: uploadedMediaId ? [uploadedMediaId] : null
    });
  }

  // ==================== Helpers ====================

  async getImageBuffer(imageSource) {
    if (!imageSource) {
      throw new Error('No image source provided');
    }

    // If it's a data URL
    if (imageSource.startsWith('data:')) {
      const base64Data = imageSource.replace(/^data:image\/\w+;base64,/, '');
      return Buffer.from(base64Data, 'base64');
    }

    // If it's a URL, fetch it
    if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
      const response = await axios.get(imageSource, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    }

    // If it's a local path
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.isAbsolute(imageSource)
      ? imageSource
      : path.join(__dirname, '../../../post_generator', imageSource);

    return fs.readFileSync(fullPath);
  }

  // Validate tweet content
  validateTweet(text) {
    const errors = [];
    const limit = this.config.characterLimits?.tweet || 280;

    if (text && text.length > limit) {
      errors.push(`Tweet exceeds ${limit} character limit`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Revoke token
  async revokeToken(accessToken) {
    try {
      await axios.post(
        `${this.config.tokenUrl}/revoke`,
        new URLSearchParams({ token: accessToken }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
          }
        }
      );
      return { success: true };
    } catch (error) {
      console.error('[TwitterService] Revoke token error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Fetch engagement insights (public metrics) for a tweet. Returns normalized
  // metrics, or null if unavailable.
  async getInsights(platformPostId, opts = {}) {
    const accessToken = opts.accessToken;
    if (!accessToken || !platformPostId) return null;
    try {
      const resp = await axios.get(`${this.apiUrl}/tweets/${platformPostId}`, {
        params: { 'tweet.fields': 'public_metrics' },
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const m = (resp.data && resp.data.data && resp.data.data.public_metrics) || {};
      return {
        impressions: m.impression_count || 0, reach: 0, likes: m.like_count || 0,
        comments: m.reply_count || 0, shares: m.retweet_count || 0, saves: 0, clicks: 0
      };
    } catch (error) {
      console.warn('[TwitterService] getInsights failed:', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = new TwitterService();
