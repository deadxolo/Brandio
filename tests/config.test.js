const { test } = require('node:test');
const assert = require('node:assert');
const { corsOptions } = require('../shared/config/corsOptions');

test('corsOptions is permissive (empty) when CORS_ORIGINS is unset', () => {
  delete process.env.CORS_ORIGINS;
  assert.deepStrictEqual(corsOptions(), {});
});

test('corsOptions restricts to the allow-list when CORS_ORIGINS is set', () => {
  process.env.CORS_ORIGINS = 'https://app.example.com, https://admin.example.com';
  const opts = corsOptions();
  assert.strictEqual(typeof opts.origin, 'function');

  const allow = (origin) => new Promise((resolve) => opts.origin(origin, (err, ok) => resolve(!err && ok)));

  return Promise.all([
    allow('https://app.example.com').then((v) => assert.strictEqual(v, true)),
    allow('https://evil.example.com').then((v) => assert.strictEqual(v, false)),
    allow(undefined).then((v) => assert.strictEqual(v, true)) // same-origin / server-to-server
  ]).finally(() => { delete process.env.CORS_ORIGINS; });
});
