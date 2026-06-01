const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = 'test-secret-for-mw-tests';
const express = require('../manager/node_modules/express');
const { createAuthMiddleware, requireUser, signJwt } = require('../shared/middleware/auth');

// Build an app that mounts auth EXACTLY like manager/server.js does, i.e.
// app.use('/api/', mw) — which strips the /api prefix from req.path. This is
// the configuration that previously made every route look "public".
let server;
let base;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/', createAuthMiddleware({ allowServiceToken: true }));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/businesses', requireUser, (req, res) => res.json({ ok: true, userId: req.user.id }));

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(() => server && server.close());

test('public health route is reachable without a token', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.strictEqual(r.status, 200);
});

test('protected route returns 401 without a token', async () => {
  const r = await fetch(`${base}/api/businesses`);
  assert.strictEqual(r.status, 401);
});

test('protected route returns 401 with an invalid token', async () => {
  const r = await fetch(`${base}/api/businesses`, { headers: { Authorization: 'Bearer abc.def.ghi' } });
  assert.strictEqual(r.status, 401);
});

// Regression: mounting at app.use('/api/') strips the prefix; the middleware
// must reconstruct the full path so a valid token is honoured and req.user set.
test('protected route returns 200 and sets req.user with a valid token', async () => {
  const token = signJwt({ sub: 'user_42', id: 'user_42' }, { expiresInSec: 60 });
  const r = await fetch(`${base}/api/businesses`, { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(r.status, 200);
  const body = await r.json();
  assert.strictEqual(body.userId, 'user_42');
});
