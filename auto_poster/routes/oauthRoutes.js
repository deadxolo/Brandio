// OAuth Routes - Handle OAuth flows for all social media platforms
const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const platformsConfig = require('../../shared/config/platforms');
const tokenService = require('../services/tokenService');

// Platform services will be loaded dynamically
let metaService = null;
let twitterService = null;
let linkedinService = null;

// Lazy load services to avoid circular dependencies
const getMetaService = () => {
  if (!metaService) {
    metaService = require('../services/platforms/metaService');
  }
  return metaService;
};

const getTwitterService = () => {
  if (!twitterService) {
    try {
      twitterService = require('../services/platforms/twitterService');
    } catch (e) {
      return null;
    }
  }
  return twitterService;
};

const getLinkedinService = () => {
  if (!linkedinService) {
    try {
      linkedinService = require('../services/platforms/linkedinService');
    } catch (e) {
      return null;
    }
  }
  return linkedinService;
};

// Get available platforms and their configuration status
router.get('/platforms', (req, res) => {
  const platforms = [
    {
      id: 'instagram',
      name: 'Instagram',
      provider: 'meta',
      configured: platformsConfig.isConfigured('instagram'),
      authUrl: '/api/oauth/meta/authorize?platform=instagram'
    },
    {
      id: 'facebook',
      name: 'Facebook',
      provider: 'meta',
      configured: platformsConfig.isConfigured('facebook'),
      authUrl: '/api/oauth/meta/authorize?platform=facebook'
    },
    {
      id: 'twitter',
      name: 'Twitter/X',
      provider: 'twitter',
      configured: platformsConfig.isConfigured('twitter'),
      authUrl: '/api/oauth/twitter/authorize'
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      provider: 'linkedin',
      configured: platformsConfig.isConfigured('linkedin'),
      authUrl: '/api/oauth/linkedin/authorize'
    }
  ];

  res.json({ success: true, platforms });
});

// ==================== META (Facebook/Instagram) ====================

// Start Meta OAuth flow
router.get('/meta/authorize', (req, res) => {
  try {
    const { platform, business_id } = req.query;
    const config = platformsConfig.meta;

    if (!config.appId || !config.appSecret) {
      return res.status(400).json({
        success: false,
        error: 'Meta API credentials not configured'
      });
    }

    // Generate state for security
    const state = tokenService.generateOAuthState();
    tokenService.storeOAuthState(state, {
      platform: platform || 'instagram',
      business_id: business_id || 'default'
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(','),
      response_type: 'code',
      state
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    // For API calls, return the URL
    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, authUrl });
    }

    // For browser, redirect
    res.redirect(authUrl);

  } catch (error) {
    console.error('[OAuth] Meta authorize error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Meta OAuth callback
router.get('/meta/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.redirect(`/oauth-error?error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code || !state) {
      return res.redirect('/oauth-error?error=Missing code or state');
    }

    // Verify state
    const stateData = tokenService.consumeOAuthState(state);
    if (!stateData) {
      return res.redirect('/oauth-error?error=Invalid or expired state');
    }

    const meta = getMetaService();
    const config = platformsConfig.meta;

    // Exchange code for token
    const tokenResult = await meta.exchangeCodeForToken(code);

    if (!tokenResult.success) {
      return res.redirect(`/oauth-error?error=${encodeURIComponent(tokenResult.error)}`);
    }

    // Get user info and pages
    const userInfo = await meta.getUserInfo(tokenResult.access_token);
    const pages = await meta.getPages(tokenResult.access_token);

    console.log('[OAuth] User:', userInfo.name, 'ID:', userInfo.id);
    console.log('[OAuth] Pages found:', pages.length);
    pages.forEach((p, i) => {
      console.log(`[OAuth] Page ${i + 1}: ${p.name} (ID: ${p.id}, has IG: ${!!p.instagram_business_account})`);
    });

    // Check if user has any Pages
    if (pages.length === 0) {
      return res.redirect('/oauth-error?error=' + encodeURIComponent(
        'No Facebook Pages found. You need a Facebook Page to post via the API. ' +
        'Personal profiles cannot be used for API posting. ' +
        'Create a Facebook Page first, then reconnect.'
      ));
    }

    // Prepare base token data
    const encryptedTokens = tokenService.prepareForStorage({
      access_token: tokenResult.access_token,
      expires_in: tokenResult.expires_in
    });

    let savedAccounts = [];

    if (stateData.platform === 'instagram') {
      // For Instagram, find pages with Instagram Business Account
      for (const page of pages) {
        const instagramAccount = await meta.getInstagramAccount(page.id, page.access_token);
        if (instagramAccount) {
          const accountData = {
            business_id: stateData.business_id,
            platform: 'instagram',
            account_id: instagramAccount.id,
            account_name: `${instagramAccount.username} (via ${page.name})`,
            ...encryptedTokens,
            profile_url: `https://instagram.com/${instagramAccount.username}`,
            profile_picture: instagramAccount.profile_picture_url || null,
            page_id: page.id,
            page_access_token: tokenService.encryptToken(page.access_token),
            instagram_account_id: instagramAccount.id,
            scopes: config.scopes
          };

          // Check if this specific account exists
          const existing = db.getSocialAccountByAccountId(stateData.business_id, 'instagram', instagramAccount.id);
          if (existing) {
            db.updateSocialAccount(existing.id, accountData);
          } else {
            db.createSocialAccount(accountData);
          }
          savedAccounts.push(instagramAccount.username);
        }
      }

      if (savedAccounts.length === 0) {
        return res.redirect('/oauth-error?error=' + encodeURIComponent(
          'No Instagram Business Accounts found on your Pages. ' +
          'To post to Instagram, link an Instagram Business/Creator account to your Facebook Page in Meta Business Suite.'
        ));
      }
    } else {
      // For Facebook, save ALL pages as separate accounts
      for (const page of pages) {
        const accountData = {
          business_id: stateData.business_id,
          platform: 'facebook',
          account_id: page.id,
          account_name: page.name,
          ...encryptedTokens,
          profile_url: `https://facebook.com/${page.id}`,
          profile_picture: userInfo.picture?.data?.url || null,
          page_id: page.id,
          page_access_token: tokenService.encryptToken(page.access_token),
          instagram_account_id: null,
          scopes: config.scopes
        };

        console.log('[OAuth] Saving Facebook Page:', page.name, 'ID:', page.id);

        // Check if this specific page already exists
        const existing = db.getSocialAccountByAccountId(stateData.business_id, 'facebook', page.id);
        if (existing) {
          db.updateSocialAccount(existing.id, accountData);
        } else {
          db.createSocialAccount(accountData);
        }
        savedAccounts.push(page.name);
      }
    }

    console.log('[OAuth] Saved accounts:', savedAccounts);

    // Log the OAuth success
    db.createPublishingLog({
      platform: stateData.platform,
      action: 'oauth_complete',
      status: 'success',
      request_data: JSON.stringify({ business_id: stateData.business_id, accounts: savedAccounts })
    });

    // Redirect to success page
    const accountNames = savedAccounts.join(', ');
    res.redirect(`/oauth-success?platform=${stateData.platform}&name=${encodeURIComponent(accountNames)}&count=${savedAccounts.length}`);

  } catch (error) {
    console.error('[OAuth] Meta callback error:', error);
    db.createPublishingLog({
      platform: 'meta',
      action: 'oauth_complete',
      status: 'failed',
      error_message: error.message
    });
    res.redirect(`/oauth-error?error=${encodeURIComponent(error.message)}`);
  }
});

// Refresh Meta token
router.post('/meta/refresh', async (req, res) => {
  try {
    const { account_id } = req.body;

    const account = db.getSocialAccount(account_id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const meta = getMetaService();
    const tokens = tokenService.getDecryptedTokens(account);

    const result = await meta.refreshToken(tokens.access_token);

    if (result.success) {
      const encryptedTokens = tokenService.prepareForStorage({
        access_token: result.access_token,
        expires_in: result.expires_in
      });

      db.updateSocialAccount(account.id, encryptedTokens);

      res.json({ success: true, message: 'Token refreshed successfully' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== TWITTER/X ====================

// Start Twitter OAuth flow
router.get('/twitter/authorize', (req, res) => {
  try {
    const { business_id } = req.query;
    const config = platformsConfig.twitter;

    if (!config.clientId || !config.clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'Twitter API credentials not configured'
      });
    }

    // Generate PKCE codes
    const codeVerifier = tokenService.generateCodeVerifier();
    const codeChallenge = tokenService.generateCodeChallenge(codeVerifier);
    const state = tokenService.generateOAuthState();

    // Store state with code verifier
    tokenService.storeOAuthState(state, {
      platform: 'twitter',
      business_id: business_id || 'default',
      codeVerifier
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      response_type: 'code',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, authUrl });
    }

    res.redirect(authUrl);

  } catch (error) {
    console.error('[OAuth] Twitter authorize error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Twitter OAuth callback
router.get('/twitter/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`/oauth-error?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect('/oauth-error?error=Missing code or state');
    }

    const stateData = tokenService.consumeOAuthState(state);
    if (!stateData) {
      return res.redirect('/oauth-error?error=Invalid or expired state');
    }

    const twitter = getTwitterService();
    if (!twitter) {
      return res.redirect('/oauth-error?error=Twitter service not available');
    }

    // Exchange code for token
    const tokenResult = await twitter.exchangeCodeForToken(code, stateData.codeVerifier);

    if (!tokenResult.success) {
      return res.redirect(`/oauth-error?error=${encodeURIComponent(tokenResult.error)}`);
    }

    // Get user info
    const userInfo = await twitter.getUserInfo(tokenResult.access_token);

    // Prepare encrypted tokens
    const encryptedTokens = tokenService.prepareForStorage({
      access_token: tokenResult.access_token,
      refresh_token: tokenResult.refresh_token,
      expires_in: tokenResult.expires_in
    });

    // Save account
    const accountData = {
      business_id: stateData.business_id,
      platform: 'twitter',
      account_id: userInfo.id,
      account_name: userInfo.username,
      ...encryptedTokens,
      profile_url: `https://twitter.com/${userInfo.username}`,
      profile_picture: userInfo.profile_image_url,
      scopes: platformsConfig.twitter.scopes
    };

    const existingAccount = db.getSocialAccountByPlatform(stateData.business_id, 'twitter');
    if (existingAccount) {
      db.updateSocialAccount(existingAccount.id, accountData);
    } else {
      db.createSocialAccount(accountData);
    }

    res.redirect(`/oauth-success?platform=twitter&name=${encodeURIComponent(userInfo.username)}`);

  } catch (error) {
    console.error('[OAuth] Twitter callback error:', error);
    res.redirect(`/oauth-error?error=${encodeURIComponent(error.message)}`);
  }
});

// ==================== LINKEDIN ====================

// Start LinkedIn OAuth flow
router.get('/linkedin/authorize', (req, res) => {
  try {
    const { business_id } = req.query;
    const config = platformsConfig.linkedin;

    if (!config.clientId || !config.clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'LinkedIn API credentials not configured'
      });
    }

    const state = tokenService.generateOAuthState();
    tokenService.storeOAuthState(state, {
      platform: 'linkedin',
      business_id: business_id || 'default'
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      response_type: 'code',
      state
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, authUrl });
    }

    res.redirect(authUrl);

  } catch (error) {
    console.error('[OAuth] LinkedIn authorize error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// LinkedIn OAuth callback
router.get('/linkedin/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.redirect(`/oauth-error?error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code || !state) {
      return res.redirect('/oauth-error?error=Missing code or state');
    }

    const stateData = tokenService.consumeOAuthState(state);
    if (!stateData) {
      return res.redirect('/oauth-error?error=Invalid or expired state');
    }

    const linkedin = getLinkedinService();
    if (!linkedin) {
      return res.redirect('/oauth-error?error=LinkedIn service not available');
    }

    const tokenResult = await linkedin.exchangeCodeForToken(code);

    if (!tokenResult.success) {
      return res.redirect(`/oauth-error?error=${encodeURIComponent(tokenResult.error)}`);
    }

    const userInfo = await linkedin.getUserInfo(tokenResult.access_token);

    const encryptedTokens = tokenService.prepareForStorage({
      access_token: tokenResult.access_token,
      refresh_token: tokenResult.refresh_token,
      expires_in: tokenResult.expires_in
    });

    const accountData = {
      business_id: stateData.business_id,
      platform: 'linkedin',
      account_id: userInfo.sub,
      account_name: userInfo.name,
      ...encryptedTokens,
      profile_url: `https://linkedin.com/in/${userInfo.sub}`,
      profile_picture: userInfo.picture,
      scopes: platformsConfig.linkedin.scopes
    };

    const existingAccount = db.getSocialAccountByPlatform(stateData.business_id, 'linkedin');
    if (existingAccount) {
      db.updateSocialAccount(existingAccount.id, accountData);
    } else {
      db.createSocialAccount(accountData);
    }

    res.redirect(`/oauth-success?platform=linkedin&name=${encodeURIComponent(userInfo.name)}`);

  } catch (error) {
    console.error('[OAuth] LinkedIn callback error:', error);
    res.redirect(`/oauth-error?error=${encodeURIComponent(error.message)}`);
  }
});

// ==================== COMMON ENDPOINTS ====================

// Revoke access for a platform
router.delete('/:platform/revoke', async (req, res) => {
  try {
    const { platform } = req.params;
    const { account_id, business_id } = req.body;

    let account;
    if (account_id) {
      account = db.getSocialAccount(account_id);
    } else if (business_id) {
      account = db.getSocialAccountByPlatform(business_id, platform);
    }

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Try to revoke token with platform
    try {
      const service = platform === 'instagram' || platform === 'facebook'
        ? getMetaService()
        : platform === 'twitter'
          ? getTwitterService()
          : getLinkedinService();

      if (service && service.revokeToken) {
        const tokens = tokenService.getDecryptedTokens(account);
        await service.revokeToken(tokens.access_token);
      }
    } catch (revokeError) {
      console.warn('[OAuth] Token revocation failed:', revokeError.message);
    }

    // Delete the account from database
    db.deleteSocialAccount(account.id);

    db.createPublishingLog({
      platform,
      action: 'oauth_revoke',
      status: 'success',
      request_data: JSON.stringify({ account_id: account.id })
    });

    res.json({ success: true, message: 'Account disconnected successfully' });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check token status
router.get('/:platform/status', (req, res) => {
  try {
    const { platform } = req.params;
    const { business_id } = req.query;

    const account = db.getSocialAccountByPlatform(business_id || 'default', platform);

    if (!account) {
      return res.json({
        success: true,
        connected: false,
        platform
      });
    }

    const isExpired = tokenService.isTokenExpired(account);
    const needsRefresh = tokenService.needsRefresh(account);

    res.json({
      success: true,
      connected: true,
      platform,
      account: {
        id: account.id,
        name: account.account_name,
        profile_url: account.profile_url,
        profile_picture: account.profile_picture
      },
      token: {
        expired: isExpired,
        needsRefresh,
        expiresAt: account.token_expires_at
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
