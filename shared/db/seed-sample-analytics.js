// Seed realistic SAMPLE analytics for demo/preview purposes.
// Attaches metrics to existing posts of every business, creating platform_posts
// where needed. Re-runnable (adds a fresh snapshot each time).
//
//   node shared/db/seed-sample-analytics.js
//
// To remove later:  node shared/db/seed-sample-analytics.js --clear

const db = require('./database');
const conn = db.db;

const PLATFORMS = ['instagram', 'facebook', 'twitter', 'linkedin'];
const rnd = (min, max) => Math.floor(min + Math.random() * (max - min));

function metricsFor(platform) {
  const impressions = rnd(400, 6000);
  const reach = platform === 'twitter' ? 0 : Math.floor(impressions * (0.6 + Math.random() * 0.3));
  return {
    impressions,
    reach,
    likes: Math.floor(impressions * (0.02 + Math.random() * 0.07)),
    comments: Math.floor(impressions * (0.002 + Math.random() * 0.012)),
    shares: Math.floor(impressions * (0.001 + Math.random() * 0.006)),
    saves: platform === 'instagram' ? Math.floor(impressions * (0.004 + Math.random() * 0.015)) : 0,
    clicks: Math.floor(impressions * (0.005 + Math.random() * 0.02))
  };
}

if (process.argv.includes('--clear')) {
  const a = conn.prepare("DELETE FROM analytics WHERE post_id IN (SELECT id FROM posts)").run().changes;
  const p = conn.prepare("DELETE FROM platform_posts WHERE platform_post_id LIKE 'SAMPLE_%'").run().changes;
  console.log(`Cleared ${a} analytics rows and ${p} sample platform_posts.`);
  process.exit(0);
}

const businesses = conn.prepare('SELECT id, name FROM businesses WHERE is_active = 1').all();
let postsSeeded = 0;
let rowsSeeded = 0;

for (const biz of businesses) {
  const posts = db.getPostsByBusiness(biz.id, null, 100);
  let seededThisBiz = 0;

  for (const post of posts) {
    // Decide which platforms to seed for this post.
    let platforms = Array.isArray(post.platforms) && post.platforms.length
      ? post.platforms.filter((p) => PLATFORMS.includes(p))
      : [];
    if (!platforms.length) {
      // pick 1-2 platforms deterministically-ish
      platforms = [PLATFORMS[rnd(0, PLATFORMS.length)]];
      if (Math.random() > 0.5) platforms.push(PLATFORMS[rnd(0, PLATFORMS.length)]);
    }
    platforms = [...new Set(platforms)].slice(0, 2);

    for (const platform of platforms) {
      // Ensure a platform_post exists so it counts as "published".
      const existing = db.getPlatformPost(post.id, platform);
      if (!existing) {
        db.createPlatformPost({
          post_id: post.id,
          platform,
          platform_post_id: `SAMPLE_${platform}_${post.id.slice(0, 8)}`,
          platform_url: '#'
        });
      }
      db.recordAnalytics({ post_id: post.id, platform, ...metricsFor(platform) });
      rowsSeeded++;
    }
    postsSeeded++;
    seededThisBiz++;
  }
  console.log(`  ${biz.name.slice(0, 32).padEnd(34)} seeded ${seededThisBiz} posts`);
}

console.log(`\nDone. Seeded analytics for ${postsSeeded} posts (${rowsSeeded} metric rows) across ${businesses.length} businesses.`);
