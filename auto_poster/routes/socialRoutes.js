const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const { v4: uuidv4 } = require('uuid');
const platformsConfig = require('../../shared/config/platforms');
const tokenService = require('../services/tokenService');

// Get connected social accounts for a business
router.get('/accounts/:businessId', (req, res) => {
  try {
    const accounts = db.getSocialAccountsByBusiness(req.params.businessId);

    // Enhance account data with token status (without exposing tokens)
    const enhancedAccounts = accounts.map(account => ({
      id: account.id,
      platform: account.platform,
      account_id: account.account_id,
      account_name: account.account_name,
      profile_url: account.profile_url,
      profile_picture: account.profile_picture,
      is_active: account.is_active,
      created_at: account.created_at,
      // Token status
      token_status: {
        hasToken: !!account.access_token,
        expired: tokenService.isTokenExpired(account),
        needsRefresh: tokenService.needsRefresh(account),
        expiresAt: account.token_expires_at
      },
      // Platform-specific
      hasPage: !!account.page_id,
      hasInstagram: !!account.instagram_account_id
    }));

    res.json({
      success: true,
      accounts: enhancedAccounts,
      count: accounts.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single account
router.get('/accounts/item/:id', (req, res) => {
  try {
    const account = db.getSocialAccount(req.params.id);

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    res.json({
      success: true,
      account
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Connect a social account (simulated - in production would use OAuth)
router.post('/connect', (req, res) => {
  try {
    const {
      business_id,
      platform,
      account_id,
      account_name,
      access_token,
      refresh_token,
      profile_url
    } = req.body;

    if (!business_id || !platform) {
      return res.status(400).json({
        success: false,
        error: 'business_id and platform are required'
      });
    }

    // Check if account already exists
    const existing = db.db.prepare(`
      SELECT * FROM social_accounts
      WHERE business_id = ? AND platform = ?
    `).get(business_id, platform);

    if (existing) {
      // Update existing
      db.updateSocialAccount(existing.id, {
        account_id: account_id || existing.account_id,
        account_name: account_name || existing.account_name,
        access_token: access_token || existing.access_token,
        refresh_token: refresh_token || existing.refresh_token,
        profile_url: profile_url || existing.profile_url,
        is_active: 1
      });

      return res.json({
        success: true,
        message: 'Account updated',
        account: db.getSocialAccount(existing.id)
      });
    }

    // Create new
    const account = db.createSocialAccount({
      business_id,
      platform,
      account_id: account_id || `${platform}_${Date.now()}`,
      account_name: account_name || `${platform} Account`,
      access_token,
      refresh_token,
      profile_url
    });

    res.status(201).json({
      success: true,
      message: 'Account connected successfully',
      account
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect a social account
router.delete('/accounts/:id', (req, res) => {
  try {
    const account = db.getSocialAccount(req.params.id);

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    db.deleteSocialAccount(req.params.id);

    res.json({
      success: true,
      message: 'Account disconnected successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test post to a platform (simulated)
router.post('/test-post', (req, res) => {
  try {
    const { account_id, message, image_url } = req.body;

    if (!account_id) {
      return res.status(400).json({
        success: false,
        error: 'account_id is required'
      });
    }

    const account = db.getSocialAccount(account_id);

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Simulate posting
    console.log(`[Test Post] Platform: ${account.platform}`);
    console.log(`[Test Post] Account: ${account.account_name}`);
    console.log(`[Test Post] Message: ${message || '(no message)'}`);
    console.log(`[Test Post] Image: ${image_url || '(no image)'}`);

    // In production, this would call the actual platform API
    res.json({
      success: true,
      message: 'Test post successful (simulated)',
      platform: account.platform,
      accountName: account.account_name
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available platforms with configuration status
router.get('/platforms', (req, res) => {
  const { business_id } = req.query;

  // Get connected accounts if business_id provided
  const connectedAccounts = business_id
    ? db.getSocialAccountsByBusiness(business_id)
    : [];

  // Helper to get accounts for a platform
  const getAccountsForPlatform = (platform) => {
    return connectedAccounts.filter(a => a.platform === platform).map(a => ({
      id: a.id,
      account_id: a.account_id,
      account_name: a.account_name,
      profile_url: a.profile_url
    }));
  };

  const platforms = [
    {
      id: 'instagram',
      name: 'Instagram',
      icon: 'instagram',
      features: ['photo', 'video', 'story', 'reel'],
      configured: platformsConfig.isConfigured('instagram'),
      authUrl: '/api/oauth/meta/authorize?platform=instagram',
      connected: connectedAccounts.some(a => a.platform === 'instagram'),
      accounts: getAccountsForPlatform('instagram'),
      account: connectedAccounts.find(a => a.platform === 'instagram')
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: 'facebook',
      features: ['photo', 'video', 'story', 'link'],
      configured: platformsConfig.isConfigured('facebook'),
      authUrl: '/api/oauth/meta/authorize?platform=facebook',
      connected: connectedAccounts.some(a => a.platform === 'facebook'),
      accounts: getAccountsForPlatform('facebook'),
      account: connectedAccounts.find(a => a.platform === 'facebook')
    },
    {
      id: 'twitter',
      name: 'Twitter/X',
      icon: 'twitter',
      features: ['photo', 'video', 'text', 'thread'],
      configured: platformsConfig.isConfigured('twitter'),
      authUrl: '/api/oauth/twitter/authorize',
      connected: connectedAccounts.some(a => a.platform === 'twitter'),
      accounts: getAccountsForPlatform('twitter'),
      account: connectedAccounts.find(a => a.platform === 'twitter')
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      icon: 'linkedin',
      features: ['photo', 'video', 'article', 'link'],
      configured: platformsConfig.isConfigured('linkedin'),
      authUrl: '/api/oauth/linkedin/authorize',
      connected: connectedAccounts.some(a => a.platform === 'linkedin'),
      accounts: getAccountsForPlatform('linkedin'),
      account: connectedAccounts.find(a => a.platform === 'linkedin')
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: 'whatsapp',
      features: ['status'],
      configured: false,
      authUrl: null,
      connected: false,
      note: 'WhatsApp Business API requires additional setup'
    }
  ];

  // Clean sensitive data from accounts
  platforms.forEach(p => {
    if (p.account) {
      p.account = {
        id: p.account.id,
        account_name: p.account.account_name,
        profile_url: p.account.profile_url,
        profile_picture: p.account.profile_picture
      };
    }
  });

  res.json({
    success: true,
    platforms
  });
});

// OAuth callback handler (placeholder)
router.get('/auth/:platform/callback', (req, res) => {
  const { platform } = req.params;
  const { code, state } = req.query;

  // In production, this would:
  // 1. Exchange code for tokens
  // 2. Get user info from platform
  // 3. Save account to database
  // 4. Redirect back to app

  res.json({
    success: true,
    message: `OAuth callback for ${platform}`,
    note: 'This is a placeholder. In production, implement actual OAuth flow.'
  });
});

module.exports = router;
