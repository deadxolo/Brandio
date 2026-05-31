// Meta Service - Facebook & Instagram API integration
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const platformsConfig = require('../../../shared/config/platforms');

class MetaService {
  constructor() {
    this.config = platformsConfig.meta;
    this.graphApiUrl = this.config.graphApiUrl;
  }

  // ==================== OAuth Flow ====================

  // Exchange authorization code for access token
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.get(this.config.tokenUrl, {
        params: {
          client_id: this.config.appId,
          client_secret: this.config.appSecret,
          redirect_uri: this.config.redirectUri,
          code
        }
      });

      return {
        success: true,
        access_token: response.data.access_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in || 5184000 // Default 60 days
      };

    } catch (error) {
      console.error('[MetaService] Token exchange error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  // Exchange short-lived token for long-lived token
  async getLongLivedToken(shortLivedToken) {
    try {
      const response = await axios.get(`${this.graphApiUrl}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.config.appId,
          client_secret: this.config.appSecret,
          fb_exchange_token: shortLivedToken
        }
      });

      return {
        success: true,
        access_token: response.data.access_token,
        expires_in: response.data.expires_in || 5184000
      };

    } catch (error) {
      console.error('[MetaService] Long-lived token error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  // Refresh access token (Meta tokens can be refreshed before expiry)
  async refreshToken(accessToken) {
    // Meta uses the same endpoint as long-lived token exchange
    return this.getLongLivedToken(accessToken);
  }

  // Get user info
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(`${this.graphApiUrl}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,email,picture'
        }
      });

      return response.data;

    } catch (error) {
      console.error('[MetaService] Get user info error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get user's Facebook pages
  async getPages(accessToken) {
    try {
      const response = await axios.get(`${this.graphApiUrl}/me/accounts`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,access_token,instagram_business_account'
        }
      });

      return response.data.data || [];

    } catch (error) {
      console.error('[MetaService] Get pages error:', error.response?.data || error.message);
      return [];
    }
  }

  // Get Instagram Business Account connected to a Page
  async getInstagramAccount(pageId, pageAccessToken) {
    try {
      const response = await axios.get(`${this.graphApiUrl}/${pageId}`, {
        params: {
          access_token: pageAccessToken,
          fields: 'instagram_business_account{id,username,profile_picture_url}'
        }
      });

      return response.data.instagram_business_account || null;

    } catch (error) {
      console.error('[MetaService] Get Instagram account error:', error.response?.data || error.message);
      return null;
    }
  }

  // ==================== Instagram Publishing ====================

  // Upload media to Instagram (creates a container)
  // For Facebook, this is a no-op since publishToFacebook handles the image directly
  async uploadMedia(imageSource, options = {}) {
    const { account, tokens, caption, platform } = options;

    // Facebook doesn't need a separate upload step - return null to skip
    if (platform === 'facebook') {
      return { success: true, mediaId: null, containerId: null };
    }

    // Determine which ID and token to use
    const igAccountId = account.instagram_account_id;
    const accessToken = account.page_access_token
      ? require('../tokenService').decryptToken(account.page_access_token)
      : tokens.access_token;

    if (!igAccountId) {
      throw new Error('No Instagram Business Account linked. To post to Instagram, your Facebook Page must have an Instagram Business or Creator account connected in Meta Business Suite.');
    }

    // Get the image URL (needs to be publicly accessible for Meta API)
    const imageUrl = await this.getPublicImageUrl(imageSource);

    try {
      // Create media container
      const response = await axios.post(
        `${this.graphApiUrl}/${igAccountId}/media`,
        null,
        {
          params: {
            image_url: imageUrl,
            caption: caption || '',
            access_token: accessToken
          }
        }
      );

      return {
        success: true,
        mediaId: response.data.id,
        containerId: response.data.id
      };

    } catch (error) {
      console.error('[MetaService] Upload media error:', error.response?.data || error.message);
      const err = new Error(error.response?.data?.error?.message || 'Media upload failed');
      err.code = error.response?.data?.error?.code;
      throw err;
    }
  }

  // Publish the media container to Instagram
  async publishToInstagram(options) {
    const { account, tokens, mediaId, containerId } = options;

    const igAccountId = account.instagram_account_id;
    const accessToken = account.page_access_token
      ? require('../tokenService').decryptToken(account.page_access_token)
      : tokens.access_token;

    try {
      // Check container status first
      const status = await this.checkContainerStatus(containerId || mediaId, accessToken);
      if (status !== 'FINISHED') {
        // Wait for container to be ready
        await this.waitForContainer(containerId || mediaId, accessToken);
      }

      // Publish the container
      const response = await axios.post(
        `${this.graphApiUrl}/${igAccountId}/media_publish`,
        null,
        {
          params: {
            creation_id: containerId || mediaId,
            access_token: accessToken
          }
        }
      );

      return {
        success: true,
        platformPostId: response.data.id,
        platformUrl: `https://www.instagram.com/p/${response.data.id}/`
      };

    } catch (error) {
      console.error('[MetaService] Publish to Instagram error:', error.response?.data || error.message);
      const err = new Error(error.response?.data?.error?.message || 'Publish failed');
      err.code = error.response?.data?.error?.code;
      throw err;
    }
  }

  // Check media container status
  async checkContainerStatus(containerId, accessToken) {
    try {
      const response = await axios.get(
        `${this.graphApiUrl}/${containerId}`,
        {
          params: {
            fields: 'status_code',
            access_token: accessToken
          }
        }
      );

      return response.data.status_code;

    } catch (error) {
      console.error('[MetaService] Check container status error:', error.response?.data || error.message);
      return 'ERROR';
    }
  }

  // Wait for container to be ready
  async waitForContainer(containerId, accessToken, maxWaitMs = 30000) {
    const startTime = Date.now();
    const checkInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.checkContainerStatus(containerId, accessToken);

      if (status === 'FINISHED') {
        return true;
      }

      if (status === 'ERROR') {
        throw new Error('Container processing failed');
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error('Container processing timeout');
  }

  // ==================== Facebook Publishing ====================

  // Publish photo to Facebook Page
  async publishToFacebook(options) {
    const { account, tokens, post, mediaId } = options;

    const pageId = account.page_id;
    const pageAccessToken = account.page_access_token
      ? require('../tokenService').decryptToken(account.page_access_token)
      : tokens.access_token;

    if (!pageId) {
      throw new Error('No Facebook Page linked');
    }

    try {
      // Use the Manager API to get the post image
      const imageApiUrl = `http://localhost:3004/api/posts/image/${post.id}`;
      console.log('[MetaService] Fetching image from API:', imageApiUrl);

      // Download the image via API
      const imageResponse = await axios.get(imageApiUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data);

      console.log('[MetaService] Image downloaded, size:', imageBuffer.length, 'bytes');

      // Create form data with binary image
      const formData = new FormData();
      formData.append('source', imageBuffer, {
        filename: 'image.png',
        contentType: imageResponse.headers['content-type'] || 'image/png'
      });
      formData.append('caption', options.caption || '');
      formData.append('access_token', pageAccessToken);

      console.log('[MetaService] Uploading to Facebook Page:', pageId);

      // Post photo with binary data
      const response = await axios.post(
        `${this.graphApiUrl}/${pageId}/photos`,
        formData,
        {
          headers: formData.getHeaders()
        }
      );

      console.log('[MetaService] Facebook API Response:', response.data);

      const postId = response.data.post_id || response.data.id;
      const postUrl = `https://www.facebook.com/${pageId}/posts/${postId}`;

      console.log('[MetaService] SUCCESS! Post published:', postUrl);

      return {
        success: true,
        platformPostId: postId,
        platformUrl: postUrl
      };

    } catch (error) {
      console.error('[MetaService] Publish to Facebook error:', error.response?.data || error.message);
      const err = new Error(error.response?.data?.error?.message || 'Publish failed');
      err.code = error.response?.data?.error?.code;
      throw err;
    }
  }

  // ==================== Unified Publish Method ====================

  async publish(options) {
    const { platform, post, account, tokens, mediaId, caption } = options;

    if (platform === 'instagram') {
      // For Instagram, we need to upload first if no mediaId
      let containerId = mediaId;
      if (!containerId && post.image_url) {
        const uploadResult = await this.uploadMedia(post.image_url, {
          account,
          tokens,
          caption,
          platform
        });
        containerId = uploadResult.containerId;
      }

      return this.publishToInstagram({
        account,
        tokens,
        mediaId: containerId,
        containerId
      });

    } else if (platform === 'facebook') {
      return this.publishToFacebook({
        account,
        tokens,
        post,
        caption
      });
    }

    throw new Error(`Unsupported platform: ${platform}`);
  }

  // ==================== Helpers ====================

  // Convert local image path to publicly accessible URL
  // In production, you'd upload to a CDN or use your server's public URL
  async getPublicImageUrl(imageSource) {
    if (!imageSource) {
      throw new Error('No image source provided');
    }

    // If it's already a URL, return it
    if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
      return imageSource;
    }

    // If it's a data URL, we need to upload it somewhere
    if (imageSource.startsWith('data:')) {
      // For now, throw an error - in production, upload to a public storage
      throw new Error('Data URLs not supported - please use a publicly accessible image URL');
    }

    // If it's a local path, construct the public URL
    // This assumes your server is running and can serve static files
    const serverUrl = process.env.SERVER_URL || 'http://localhost:3002';
    const publicPath = imageSource.startsWith('/') ? imageSource : `/${imageSource}`;

    return `${serverUrl}${publicPath}`;
  }

  // Validate media for platform requirements
  validateMedia(buffer, platform) {
    const requirements = platform === 'instagram'
      ? this.config.mediaRequirements.instagram
      : this.config.mediaRequirements.facebook;

    const errors = [];

    // Check size
    if (buffer.length > requirements.maxSize) {
      errors.push(`File size exceeds ${requirements.maxSize / (1024 * 1024)}MB limit`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Revoke access token
  async revokeToken(accessToken) {
    try {
      await axios.delete(`${this.graphApiUrl}/me/permissions`, {
        params: {
          access_token: accessToken
        }
      });
      return { success: true };
    } catch (error) {
      console.error('[MetaService] Revoke token error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Get rate limit status
  async getRateLimitStatus(accessToken) {
    try {
      const response = await axios.get(`${this.graphApiUrl}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id'
        }
      });

      // Rate limit info is in response headers
      const headers = response.headers;
      return {
        appUsage: headers['x-app-usage'] ? JSON.parse(headers['x-app-usage']) : null,
        businessUsage: headers['x-business-use-case-usage']
          ? JSON.parse(headers['x-business-use-case-usage'])
          : null
      };

    } catch (error) {
      return null;
    }
  }
}

module.exports = new MetaService();
