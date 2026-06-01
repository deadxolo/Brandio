// LinkedIn Service - LinkedIn API integration
const axios = require('axios');
const FormData = require('form-data');
const platformsConfig = require('../../../shared/config/platforms');

class LinkedInService {
  constructor() {
    this.config = platformsConfig.linkedin;
    this.apiUrl = this.config.apiUrl;
  }

  // ==================== OAuth Flow ====================

  // Exchange authorization code for access token
  async exchangeCodeForToken(code) {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      });

      const response = await axios.post(
        this.config.tokenUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        scope: response.data.scope
      };

    } catch (error) {
      console.error('[LinkedInService] Token exchange error:', error.response?.data || error.message);
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
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      });

      const response = await axios.post(
        this.config.tokenUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
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
      console.error('[LinkedInService] Token refresh error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_description || error.message
      };
    }
  }

  // Get authenticated user info (using OpenID Connect)
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data;

    } catch (error) {
      console.error('[LinkedInService] Get user info error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get user's URN (needed for posting)
  async getUserUrn(accessToken) {
    try {
      const userInfo = await this.getUserInfo(accessToken);
      return `urn:li:person:${userInfo.sub}`;
    } catch (error) {
      throw error;
    }
  }

  // ==================== Image Upload ====================

  // Register image upload
  async registerImageUpload(accessToken, personUrn) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/assets?action=registerUpload`,
        {
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: personUrn,
            serviceRelationships: [{
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }]
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      const uploadUrl = response.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
      const asset = response.data.value.asset;

      return { uploadUrl, asset };

    } catch (error) {
      console.error('[LinkedInService] Register upload error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Upload image binary
  async uploadImageBinary(uploadUrl, imageBuffer, accessToken) {
    try {
      await axios.put(uploadUrl, imageBuffer, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream'
        }
      });

      return { success: true };

    } catch (error) {
      console.error('[LinkedInService] Upload binary error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Full image upload flow
  async uploadMedia(imageSource, options = {}) {
    const { tokens, account } = options;

    try {
      // Get user URN
      const personUrn = await this.getUserUrn(tokens.access_token);

      // Register upload
      const { uploadUrl, asset } = await this.registerImageUpload(tokens.access_token, personUrn);

      // Get image buffer
      const imageBuffer = await this.getImageBuffer(imageSource);

      // Upload binary
      await this.uploadImageBinary(uploadUrl, imageBuffer, tokens.access_token);

      return {
        success: true,
        mediaId: asset,
        personUrn
      };

    } catch (error) {
      console.error('[LinkedInService] Media upload error:', error.response?.data || error.message);
      const err = new Error(error.message || 'Media upload failed');
      err.code = error.response?.status;
      throw err;
    }
  }

  // ==================== Post Publishing ====================

  // Create a share post
  async createShare(options) {
    const { tokens, personUrn, text, mediaAsset } = options;

    try {
      const shareContent = {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: text || ''
            },
            shareMediaCategory: mediaAsset ? 'IMAGE' : 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      // Add media if present
      if (mediaAsset) {
        shareContent.specificContent['com.linkedin.ugc.ShareContent'].media = [{
          status: 'READY',
          media: mediaAsset
        }];
      }

      const response = await axios.post(
        `${this.apiUrl}/ugcPosts`,
        shareContent,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      const postId = response.data.id;
      // Extract the activity ID from the URN
      const activityId = postId.split(':').pop();

      return {
        success: true,
        platformPostId: postId,
        platformUrl: `https://www.linkedin.com/feed/update/${postId}`
      };

    } catch (error) {
      console.error('[LinkedInService] Create share error:', error.response?.data || error.message);
      const err = new Error(error.response?.data?.message || error.message || 'Post creation failed');
      err.code = error.response?.status;
      throw err;
    }
  }

  // ==================== Unified Publish Method ====================

  async publish(options) {
    const { post, tokens, mediaId, caption, platform } = options;

    // Get user URN
    const personUrn = await this.getUserUrn(tokens.access_token);

    let mediaAsset = mediaId;

    // Upload media if present and not already uploaded
    if (post.image_url && !mediaAsset) {
      const uploadResult = await this.uploadMedia(post.image_url, { tokens });
      mediaAsset = uploadResult.mediaId;
    }

    // Create share
    return this.createShare({
      tokens,
      personUrn,
      text: caption,
      mediaAsset
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

  // Validate post content
  validatePost(text) {
    const errors = [];
    const limit = this.config.characterLimits?.post || 3000;

    if (text && text.length > limit) {
      errors.push(`Post exceeds ${limit} character limit`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Revoke token (LinkedIn doesn't have a specific revoke endpoint)
  async revokeToken(accessToken) {
    // LinkedIn tokens expire naturally; there's no revoke endpoint
    // Just return success
    return { success: true };
  }

  // Fetch engagement insights for a UGC post. LinkedIn organic post analytics
  // require additional partner permissions (socialActions /
  // organizationalEntityShareStatistics), so this returns null until those
  // scopes are granted. Wire the real call here when available.
  async getInsights(platformPostId, opts = {}) {
    return null;
  }
}

module.exports = new LinkedInService();
