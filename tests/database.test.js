const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Point the DB at a throwaway file BEFORE requiring the module (the module
// constructs its singleton on require). node --test runs each test file in its
// own process, so this stays isolated from the real database.
const TMP_DB = path.join(os.tmpdir(), `brandio_test_${process.pid}.db`);
process.env.DB_PATH = TMP_DB;
const db = require('../shared/db/database');

after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TMP_DB + suffix); } catch { /* ignore */ }
  }
});

test('demo user is seeded on init', () => {
  const u = db.getUser('user_demo_001');
  assert.ok(u);
  assert.strictEqual(u.email, 'demo@example.com');
});

test('createBusiness stores and returns nested JSON fields as objects', () => {
  const b = db.createBusiness({ user_id: 'user_A', name: 'Acme', brand_colors: { primary: '#fff' } });
  assert.ok(b.id);
  assert.strictEqual(typeof b.brand_colors, 'object');
  assert.strictEqual(b.brand_colors.primary, '#fff');

  const fetched = db.getBusiness(b.id);
  assert.strictEqual(typeof fetched.brand_colors, 'object'); // round-trips, not a string
  assert.strictEqual(fetched.name, 'Acme');
});

test('getBusinessesByUser filters by owner and active flag', () => {
  db.createBusiness({ user_id: 'user_B', name: 'B1' });
  db.createBusiness({ user_id: 'user_B', name: 'B2' });
  db.createBusiness({ user_id: 'user_C', name: 'C1' });
  assert.strictEqual(db.getBusinessesByUser('user_B').length, 2);
  assert.strictEqual(db.getBusinessesByUser('user_C').length, 1);
});

test('deleteBusiness soft-deletes (hidden from reads)', () => {
  const b = db.createBusiness({ user_id: 'user_D', name: 'Temp' });
  db.deleteBusiness(b.id);
  assert.strictEqual(db.getBusiness(b.id), undefined);
  assert.strictEqual(db.getBusinessesByUser('user_D').length, 0);
});

test('templates round-trip arrays (elements)', () => {
  const b = db.createBusiness({ user_id: 'user_E', name: 'E' });
  const t = db.createTemplate({
    business_id: b.id, name: 'T', platform: 'instagram', content_type: 'post',
    elements: [{ type: 'text', value: 'hi' }]
  });
  const fetched = db.getTemplate(t.id);
  assert.ok(Array.isArray(fetched.elements));
  assert.strictEqual(fetched.elements[0].value, 'hi');
});

test('user create + case-insensitive email lookup', () => {
  const u = db.createUser({ email: 'Mixed@Case.com', name: 'Mixy', password_hash: 'x' });
  assert.ok(u.id.startsWith('user_'));
  assert.strictEqual(db.getUserByEmail('mixed@case.com').id, u.id);
});

test('reassignBusinesses transfers ownership; userOwnsBusiness reflects it', () => {
  const b = db.createBusiness({ user_id: 'old_owner', name: 'Transferable' });
  assert.strictEqual(db.userOwnsBusiness('old_owner', b.id), true);
  const moved = db.reassignBusinesses('old_owner', 'new_owner');
  assert.ok(moved >= 1);
  assert.strictEqual(db.userOwnsBusiness('new_owner', b.id), true);
  assert.strictEqual(db.userOwnsBusiness('old_owner', b.id), false);
});

test('raw SQL via db.db.prepare works and auto-parses JSON columns', () => {
  const b = db.createBusiness({ user_id: 'user_F', name: 'RawQuery', brand_colors: { primary: '#123456' } });
  const row = db.db.prepare('SELECT * FROM businesses WHERE id = ?').get(b.id);
  assert.strictEqual(row.name, 'RawQuery');
  assert.strictEqual(typeof row.brand_colors, 'object'); // auto-parsed from TEXT
  assert.strictEqual(row.brand_colors.primary, '#123456');
});
