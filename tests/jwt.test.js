const { test } = require('node:test');
const assert = require('node:assert');

// Ensure a known secret regardless of environment.
process.env.JWT_SECRET = 'test-secret-for-jwt-unit-tests';
const { signJwt, validateJwt } = require('../shared/middleware/auth');

test('signJwt produces a 3-part token', () => {
  const t = signJwt({ sub: 'u1' });
  assert.strictEqual(t.split('.').length, 3);
});

test('validateJwt accepts a freshly signed token and returns claims', () => {
  const t = signJwt({ sub: 'u1', id: 'u1', email: 'a@b.com' }, { expiresInSec: 60 });
  const r = validateJwt(t);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.user.sub, 'u1');
  assert.strictEqual(r.user.email, 'a@b.com');
});

test('validateJwt rejects a tampered signature', () => {
  const t = signJwt({ sub: 'u1' }, { expiresInSec: 60 });
  const tampered = t.slice(0, -2) + (t.slice(-2) === 'AA' ? 'BB' : 'AA');
  assert.strictEqual(validateJwt(tampered).valid, false);
});

test('validateJwt rejects a token whose payload was altered', () => {
  const t = signJwt({ sub: 'u1', role: 'user' }, { expiresInSec: 60 });
  const [h, , s] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'u1', role: 'admin' })).toString('base64url');
  assert.strictEqual(validateJwt(`${h}.${forged}.${s}`).valid, false);
});

test('validateJwt rejects an expired token', () => {
  const t = signJwt({ sub: 'u1' }, { expiresInSec: -10 });
  assert.strictEqual(validateJwt(t).valid, false);
});

test('validateJwt rejects malformed tokens', () => {
  assert.strictEqual(validateJwt('not.a.jwt').valid, false);
  assert.strictEqual(validateJwt('only-one-part').valid, false);
});
