const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const tokenService = require('../services/tokenService');
const metaService = require('../services/platforms/metaService');
const twitterService = require('../services/platforms/twitterService');
const linkedinService = require('../services/platforms/linkedinService');
const requireBusinessOwnership = require('../../shared/middleware/ownership');

// Enforce business ownership for authenticated users.
router.param('businessId', requireBusinessOwnership.param(db));

const METRICS = ['impressions', 'reach', 'likes', 'comments', 'shares', 'saves', 'clicks'];
const SERVICES = {
  instagram: metaService,
  facebook: metaService,
  twitter: twitterService,
  linkedin: linkedinService
};

// Keep only the most recent analytics snapshot per (post, platform).
// getAnalyticsByBusiness returns rows already sorted newest-first.
function latestPerPostPlatform(rows) {
  const seen = new Map();
  for (const r of rows) {
    const key = `${r.post_id}|${r.platform}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

function emptyMetricBucket(extra = {}) {
  const o = { ...extra };
  for (const m of METRICS) o[m] = 0;
  return o;
}

// GET /api/analytics/:businessId/summary — aggregated metrics + per-platform.
router.get('/:businessId/summary', (req, res) => {
  try {
    const { businessId } = req.params;
    const latest = latestPerPostPlatform(db.getAnalyticsByBusiness(businessId));

    const totals = emptyMetricBucket();
    const byPlatform = {};
    for (const r of latest) {
      byPlatform[r.platform] = byPlatform[r.platform] || emptyMetricBucket({ posts: 0 });
      for (const m of METRICS) {
        totals[m] += r[m] || 0;
        byPlatform[r.platform][m] += r[m] || 0;
      }
      byPlatform[r.platform].posts += 1;
    }

    const engagement = totals.likes + totals.comments + totals.shares + totals.saves;
    const engagementRate = totals.impressions > 0
      ? Number(((engagement / totals.impressions) * 100).toFixed(2))
      : 0;

    res.json({
      success: true,
      totals,
      byPlatform,
      engagement,
      engagementRate,
      trackedPosts: latest.length,
      publishedPosts: db.getPlatformPostsByBusiness(businessId).length,
      lastUpdated: latest.length ? latest[0].recorded_at : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/:businessId/posts — per-post latest metrics (top first).
router.get('/:businessId/posts', (req, res) => {
  try {
    const { businessId } = req.params;
    const latest = latestPerPostPlatform(db.getAnalyticsByBusiness(businessId));
    const posts = latest.map((r) => {
      const post = db.getPost(r.post_id) || {};
      const metrics = emptyMetricBucket();
      for (const m of METRICS) metrics[m] = r[m] || 0;
      return {
        post_id: r.post_id,
        title: post.title || 'Untitled post',
        image_url: post.image_url || null,
        platform: r.platform,
        recorded_at: r.recorded_at,
        metrics
      };
    }).sort((a, b) =>
      (b.metrics.likes + b.metrics.comments + b.metrics.shares) -
      (a.metrics.likes + a.metrics.comments + a.metrics.shares));

    res.json({ success: true, posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/analytics/:businessId/refresh — pull live metrics from platforms
// for every published post and store a fresh analytics snapshot. Gracefully
// no-ops when accounts aren't connected / tokens are missing.
router.post('/:businessId/refresh', async (req, res) => {
  try {
    const { businessId } = req.params;
    const platformPosts = db.getPlatformPostsByBusiness(businessId);

    let refreshed = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    for (const pp of platformPosts) {
      const service = SERVICES[pp.platform];
      if (!service || typeof service.getInsights !== 'function') { skipped++; continue; }

      const account = db.getSocialAccountByPlatform(businessId, pp.platform);
      if (!account) { skipped++; continue; }

      // Resolve the right access token (page token for IG/FB).
      let accessToken = null;
      try {
        const tokens = tokenService.getDecryptedTokens(account);
        accessToken = tokens && tokens.access_token;
        if ((pp.platform === 'instagram' || pp.platform === 'facebook') && account.page_access_token) {
          accessToken = account.token_encrypted === 1
            ? tokenService.decryptToken(account.page_access_token)
            : account.page_access_token;
        }
      } catch (e) {
        accessToken = null;
      }
      if (!accessToken) { skipped++; continue; }

      try {
        const metrics = await service.getInsights(pp.platform_post_id, { accessToken, platform: pp.platform });
        if (!metrics) { skipped++; continue; }
        db.recordAnalytics({ post_id: pp.post_id, platform: pp.platform, ...metrics });
        refreshed++;
      } catch (e) {
        failed++;
        if (errors.length < 5) errors.push(`${pp.platform}: ${e.message}`);
      }
    }

    let note;
    if (platformPosts.length === 0) {
      note = 'No published posts yet. Publish posts (and connect accounts) to start collecting analytics.';
    } else if (refreshed === 0) {
      note = 'No live metrics fetched — connect accounts with valid tokens to pull insights.';
    } else {
      note = `Updated metrics for ${refreshed} published post(s).`;
    }

    res.json({ success: true, refreshed, skipped, failed, totalPlatformPosts: platformPosts.length, note, errors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
