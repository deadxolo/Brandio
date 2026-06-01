const { test } = require('node:test');
const assert = require('node:assert');
const { validateBody } = require('../shared/middleware/validate');

function run(schema, body) {
  const mw = validateBody(schema);
  return new Promise((resolve) => {
    const res = {
      statusCode: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ blocked: true, statusCode: this.statusCode, body: b }); }
    };
    mw({ body }, res, () => resolve({ blocked: false }));
  });
}

const schema = {
  name: { required: true, type: 'string', maxLength: 5 },
  platform: { enum: ['instagram', 'facebook'] }
};

test('valid body passes', async () => {
  const r = await run(schema, { name: 'abc', platform: 'instagram' });
  assert.strictEqual(r.blocked, false);
});

test('missing required field -> 400 with details', async () => {
  const r = await run(schema, { platform: 'instagram' });
  assert.strictEqual(r.statusCode, 400);
  assert.ok(r.body.details.some((d) => d.includes('name')));
});

test('too-long string -> 400', async () => {
  const r = await run(schema, { name: 'waytoolong' });
  assert.strictEqual(r.statusCode, 400);
});

test('wrong type -> 400', async () => {
  const r = await run(schema, { name: 12345 });
  assert.strictEqual(r.statusCode, 400);
});

test('value outside enum -> 400', async () => {
  const r = await run(schema, { name: 'ok', platform: 'tiktok' });
  assert.strictEqual(r.statusCode, 400);
});

test('optional field absent is fine', async () => {
  const r = await run(schema, { name: 'ok' });
  assert.strictEqual(r.blocked, false);
});
