const { test } = require('node:test');
const assert = require('node:assert');
const requireBusinessOwnership = require('../shared/middleware/ownership');

// Mock db: only 'owned-biz' belongs to 'user_owner'.
const db = {
  userOwnsBusiness: (userId, bizId) => userId === 'user_owner' && bizId === 'owned-biz'
};
const mw = requireBusinessOwnership(db);

function run(req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: null,
      status(c) { this.statusCode = c; return this; },
      json(body) { resolve({ blocked: true, statusCode: this.statusCode, body }); }
    };
    mw(req, res, () => resolve({ blocked: false }));
  });
}

test('no authenticated user -> passes through (service/dev call)', async () => {
  const r = await run({ params: { businessId: 'owned-biz' } });
  assert.strictEqual(r.blocked, false);
});

test('owner accessing their business -> passes', async () => {
  const r = await run({ user: { id: 'user_owner' }, params: { businessId: 'owned-biz' } });
  assert.strictEqual(r.blocked, false);
});

test("non-owner accessing someone else's business -> 403", async () => {
  const r = await run({ user: { id: 'user_owner' }, params: { businessId: 'someone-else' } });
  assert.strictEqual(r.blocked, true);
  assert.strictEqual(r.statusCode, 403);
});

test('authenticated user but no resolvable business id -> passes', async () => {
  const r = await run({ user: { id: 'user_owner' }, params: {} });
  assert.strictEqual(r.blocked, false);
});

test('resolves business id from body and query too', async () => {
  const fromBody = await run({ user: { id: 'user_owner' }, params: {}, body: { business_id: 'someone-else' } });
  assert.strictEqual(fromBody.statusCode, 403);
  const fromQuery = await run({ user: { id: 'user_owner' }, params: {}, query: { business_id: 'owned-biz' } });
  assert.strictEqual(fromQuery.blocked, false);
});
