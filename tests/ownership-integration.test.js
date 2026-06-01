const { test, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('../manager/node_modules/express');
const requireBusinessOwnership = require('../shared/middleware/ownership');

// Mock db: 'owned-biz' belongs to 'user_owner'.
const db = {
  userOwnsBusiness: (userId, bizId) => userId === 'user_owner' && bizId === 'owned-biz'
};

let server;
let base;

before(async () => {
  const app = express();
  app.use(express.json());

  // Simulate auth: a test header sets req.user (stands in for the JWT middleware).
  app.use((req, res, next) => {
    const uid = req.headers['x-test-user'];
    if (uid) req.user = { id: uid };
    next();
  });

  const router = express.Router();
  // This is the configuration the real route files use.
  router.param('businessId', requireBusinessOwnership.param(db));
  router.use(requireBusinessOwnership(db));
  router.get('/:businessId', (req, res) => res.json({ ok: true, businessId: req.params.businessId }));
  router.post('/', (req, res) => res.json({ ok: true, created: req.body.business_id }));
  app.use('/api/templates', router);

  await new Promise((resolve) => {
    server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; resolve(); });
  });
});

after(() => server && server.close());

test('GET /:businessId — owner gets 200 (param guard)', async () => {
  const r = await fetch(`${base}/api/templates/owned-biz`, { headers: { 'x-test-user': 'user_owner' } });
  assert.strictEqual(r.status, 200);
});

test('GET /:businessId — non-owner gets 403 (the bug this locks in)', async () => {
  const r = await fetch(`${base}/api/templates/owned-biz`, { headers: { 'x-test-user': 'someone_else' } });
  assert.strictEqual(r.status, 403);
});

test('GET /:businessId — no auth context passes through (lenient)', async () => {
  const r = await fetch(`${base}/api/templates/owned-biz`);
  assert.strictEqual(r.status, 200);
});

test('POST / — body business_id ownership enforced for non-owner (403)', async () => {
  const r = await fetch(`${base}/api/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-user': 'someone_else' },
    body: JSON.stringify({ business_id: 'owned-biz' })
  });
  assert.strictEqual(r.status, 403);
});

test('POST / — owner can create (200)', async () => {
  const r = await fetch(`${base}/api/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-user': 'user_owner' },
    body: JSON.stringify({ business_id: 'owned-biz' })
  });
  assert.strictEqual(r.status, 200);
});
