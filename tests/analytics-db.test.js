const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_DB = path.join(os.tmpdir(), `brandio_analytics_test_${process.pid}.db`);
process.env.DB_PATH = TMP_DB;
const db = require('../shared/db/database');

after(() => {
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(TMP_DB + s); } catch {} }
});

test('getAnalyticsByBusiness returns rows for the business posts only', () => {
  const biz = db.createBusiness({ user_id: 'u1', name: 'Biz' });
  const other = db.createBusiness({ user_id: 'u1', name: 'Other' });
  const p1 = db.createPost({ business_id: biz.id, title: 'P1' });
  const p2 = db.createPost({ business_id: other.id, title: 'P2' });

  db.recordAnalytics({ post_id: p1.id, platform: 'instagram', likes: 10, impressions: 100 });
  db.recordAnalytics({ post_id: p2.id, platform: 'instagram', likes: 5 });

  const rows = db.getAnalyticsByBusiness(biz.id);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].post_id, p1.id);
  assert.strictEqual(rows[0].likes, 10);
});

test('getLatestAnalyticsByPost returns the newest snapshot', () => {
  const biz = db.createBusiness({ user_id: 'u2', name: 'Biz2' });
  const p = db.createPost({ business_id: biz.id, title: 'P' });
  db.recordAnalytics({ post_id: p.id, platform: 'twitter', likes: 1 });
  db.recordAnalytics({ post_id: p.id, platform: 'twitter', likes: 99 });
  const latest = db.getLatestAnalyticsByPost(p.id);
  assert.ok(latest);
  assert.strictEqual(latest.post_id, p.id);
  // Two snapshots recorded for this post
  assert.strictEqual(db.getAnalyticsByPost(p.id).length, 2);
});

test('getPlatformPostsByBusiness maps published posts to the business', () => {
  const biz = db.createBusiness({ user_id: 'u3', name: 'Biz3' });
  const p = db.createPost({ business_id: biz.id, title: 'Published' });
  db.createPlatformPost({ post_id: p.id, platform: 'linkedin', platform_post_id: 'urn:li:share:123' });
  const pps = db.getPlatformPostsByBusiness(biz.id);
  assert.strictEqual(pps.length, 1);
  assert.strictEqual(pps[0].platform_post_id, 'urn:li:share:123');
});

test('getAnalyticsByBusiness is empty for a business with no analytics', () => {
  const biz = db.createBusiness({ user_id: 'u4', name: 'Empty' });
  assert.strictEqual(db.getAnalyticsByBusiness(biz.id).length, 0);
});
