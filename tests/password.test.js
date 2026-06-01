const { test } = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword } = require('../shared/auth/password');

test('hashPassword produces scrypt$salt$hash format', () => {
  const h = hashPassword('correct horse battery');
  const parts = h.split('$');
  assert.strictEqual(parts.length, 3);
  assert.strictEqual(parts[0], 'scrypt');
  assert.ok(parts[1].length > 0 && parts[2].length > 0);
});

test('hash is salted (two hashes of same password differ)', () => {
  assert.notStrictEqual(hashPassword('samePass1'), hashPassword('samePass1'));
});

test('verifyPassword accepts the correct password', () => {
  const h = hashPassword('s3cret-pass');
  assert.strictEqual(verifyPassword('s3cret-pass', h), true);
});

test('verifyPassword rejects the wrong password', () => {
  const h = hashPassword('s3cret-pass');
  assert.strictEqual(verifyPassword('wrong', h), false);
});

test('verifyPassword rejects malformed / null stored hashes', () => {
  assert.strictEqual(verifyPassword('x', 'not-a-hash'), false);
  assert.strictEqual(verifyPassword('x', null), false);
  assert.strictEqual(verifyPassword('x', ''), false);
});

test('hashPassword rejects empty input', () => {
  assert.throws(() => hashPassword(''));
});
