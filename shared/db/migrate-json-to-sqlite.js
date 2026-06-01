// One-time migration: import the legacy JSON store (data.json) into the new
// SQLite database (social_manager.db). Safe to re-run — it uses INSERT OR
// REPLACE, so rows are upserted by id. The original data.json is never modified.
//
//   node shared/db/migrate-json-to-sqlite.js [path/to/data.json]

const fs = require('fs');
const path = require('path');
const db = require('./database'); // constructing this creates the SQLite schema

const jsonPath = process.argv[2] || path.join(__dirname, 'data.json');

if (!fs.existsSync(jsonPath)) {
  console.error(`No JSON file found at ${jsonPath} — nothing to migrate.`);
  process.exit(0);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
} catch (err) {
  console.error(`Failed to read/parse ${jsonPath}:`, err.message);
  process.exit(1);
}

console.log(`Migrating ${jsonPath} -> SQLite ...`);
const summary = db.bulkImport(data);

console.log('Imported row counts:');
let total = 0;
for (const [table, count] of summary) {
  console.log(`  ${table.padEnd(18)} ${count}`);
  total += count;
}
console.log(`Done. ${total} rows imported.`);
