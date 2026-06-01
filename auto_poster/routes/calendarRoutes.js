const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const requireBusinessOwnership = require('../../shared/middleware/ownership');

// Enforce business ownership for authenticated users (lenient: skips service/dev calls)
router.param('businessId', requireBusinessOwnership.param(db));
router.use(requireBusinessOwnership(db));

// Get posts for a specific month
router.get('/:businessId/:year/:month', (req, res) => {
  try {
    const { businessId, year, month } = req.params;

    // Get start and end dates for the month
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = `${year}-${month.padStart(2, '0')}-31`;

    const posts = db.db.prepare(`
      SELECT * FROM posts
      WHERE business_id = ?
      AND status IN ('scheduled', 'published')
      AND (
        (scheduled_at >= ? AND scheduled_at <= ?)
        OR (published_at >= ? AND published_at <= ?)
      )
      ORDER BY COALESCE(scheduled_at, published_at) ASC
    `).all(businessId, startDate, endDate, startDate, endDate);

    // Group by date
    const calendar = {};
    posts.forEach(post => {
      post.platforms = JSON.parse(post.platforms || '[]');
      post.content = JSON.parse(post.content || '{}');

      const date = (post.scheduled_at || post.published_at).split('T')[0];
      if (!calendar[date]) {
        calendar[date] = [];
      }
      calendar[date].push(post);
    });

    res.json({
      success: true,
      year: parseInt(year),
      month: parseInt(month),
      calendar,
      totalPosts: posts.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get posts for current week
router.get('/:businessId/week', (req, res) => {
  try {
    const { businessId } = req.params;

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const posts = db.db.prepare(`
      SELECT * FROM posts
      WHERE business_id = ?
      AND status IN ('scheduled', 'published', 'draft')
      AND (
        scheduled_at BETWEEN ? AND ?
        OR published_at BETWEEN ? AND ?
      )
      ORDER BY COALESCE(scheduled_at, published_at) ASC
    `).all(
      businessId,
      startOfWeek.toISOString(),
      endOfWeek.toISOString(),
      startOfWeek.toISOString(),
      endOfWeek.toISOString()
    );

    // Group by day of week
    const week = {
      0: [], // Sunday
      1: [], // Monday
      2: [],
      3: [],
      4: [],
      5: [],
      6: []  // Saturday
    };

    posts.forEach(post => {
      post.platforms = JSON.parse(post.platforms || '[]');
      const date = new Date(post.scheduled_at || post.published_at);
      week[date.getDay()].push(post);
    });

    res.json({
      success: true,
      weekStart: startOfWeek.toISOString().split('T')[0],
      weekEnd: endOfWeek.toISOString().split('T')[0],
      week,
      totalPosts: posts.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get posts for a specific day
router.get('/:businessId/day/:date', (req, res) => {
  try {
    const { businessId, date } = req.params;

    const startDate = `${date}T00:00:00`;
    const endDate = `${date}T23:59:59`;

    const posts = db.db.prepare(`
      SELECT * FROM posts
      WHERE business_id = ?
      AND (
        (scheduled_at >= ? AND scheduled_at <= ?)
        OR (published_at >= ? AND published_at <= ?)
      )
      ORDER BY COALESCE(scheduled_at, published_at) ASC
    `).all(businessId, startDate, endDate, startDate, endDate);

    const formattedPosts = posts.map(post => ({
      ...post,
      platforms: JSON.parse(post.platforms || '[]'),
      content: JSON.parse(post.content || '{}')
    }));

    res.json({
      success: true,
      date,
      posts: formattedPosts,
      count: posts.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get best times to post — computed from this business's published-post
// history, with general recommendations where there isn't enough data yet.
router.get('/:businessId/best-times', (req, res) => {
  try {
    const { businessId } = req.params;

    // General fallback recommendations.
    const defaults = {
      instagram: { weekdays: ['09:00', '12:00', '18:00', '21:00'], weekends: ['11:00', '14:00', '19:00'] },
      facebook: { weekdays: ['09:00', '13:00', '16:00'], weekends: ['12:00', '15:00'] },
      twitter: { weekdays: ['08:00', '12:00', '17:00', '20:00'], weekends: ['10:00', '15:00'] },
      linkedin: { weekdays: ['07:30', '12:00', '17:00'], weekends: [] }
    };

    const posts = db.getPostsByBusiness(businessId, 'published', 1000);

    // Tally publish hours per platform, split weekday vs weekend.
    const tally = {};
    for (const p of posts) {
      const when = p.published_at || p.scheduled_at;
      if (!when) continue;
      const d = new Date(when);
      if (isNaN(d.getTime())) continue;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const hour = `${String(d.getHours()).padStart(2, '0')}:00`;
      const platforms = Array.isArray(p.platforms) ? p.platforms : [];
      for (const plat of platforms) {
        tally[plat] = tally[plat] || { weekday: {}, weekends: {} };
        const bucket = isWeekend ? tally[plat].weekends : tally[plat].weekday;
        bucket[hour] = (bucket[hour] || 0) + 1;
      }
    }

    const topHours = (obj, n = 4) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]).sort();
    const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
    const MIN_SAMPLES = 3;

    const bestTimes = {};
    const dataDriven = {};
    for (const plat of Object.keys(defaults)) {
      const t = tally[plat] || { weekday: {}, weekends: {} };
      const wd = sum(t.weekday);
      const we = sum(t.weekends);
      bestTimes[plat] = {
        weekdays: wd >= MIN_SAMPLES ? topHours(t.weekday) : defaults[plat].weekdays,
        weekends: we >= MIN_SAMPLES ? topHours(t.weekends) : defaults[plat].weekends
      };
      dataDriven[plat] = { weekdays: wd >= MIN_SAMPLES, weekends: we >= MIN_SAMPLES };
    }

    res.json({
      success: true,
      bestTimes,
      dataDriven,
      sampleSize: posts.length,
      note: posts.length < MIN_SAMPLES
        ? 'Not enough published history yet — showing general recommendations.'
        : 'Computed from your published-post history; general recommendations are used where data is sparse.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get upcoming posts preview
router.get('/:businessId/upcoming', (req, res) => {
  try {
    const { businessId } = req.params;
    const { limit = 10 } = req.query;

    const now = new Date().toISOString();

    const posts = db.db.prepare(`
      SELECT * FROM posts
      WHERE business_id = ?
      AND status = 'scheduled'
      AND scheduled_at >= ?
      ORDER BY scheduled_at ASC
      LIMIT ?
    `).all(businessId, now, parseInt(limit));

    const formattedPosts = posts.map(post => ({
      ...post,
      platforms: JSON.parse(post.platforms || '[]')
    }));

    res.json({
      success: true,
      posts: formattedPosts,
      count: posts.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
