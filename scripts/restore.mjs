/* Restores a dump produced by scripts/backup.mjs into the configured database.
 *
 *   node scripts/restore.mjs backups/fitnesskinda-2026-09-20.json
 *
 * Refuses to run against a database that already holds users, unless --force is
 * passed, so a restore cannot quietly overwrite a live record.
 */

import { readFileSync } from 'node:fs';
import { openDatabase, all, run, count, closeDatabase, databaseUrl } from '../server/db.js';

const file = process.argv[2];
const force = process.argv.includes('--force');
if (!file) {
  console.error('usage: node scripts/restore.mjs <dump.json> [--force]');
  process.exit(1);
}

const dump = JSON.parse(readFileSync(file, 'utf8'));
if (dump.app !== 'fitnesskinda' || !dump.tables) {
  console.error('That does not look like a FitnessKinda dump.');
  process.exit(1);
}

await openDatabase();
const existing = await count('SELECT COUNT(*) FROM users');
if (existing > 0 && !force) {
  console.error(`Refusing: the target already has ${existing} user(s). Pass --force to overwrite.`);
  closeDatabase();
  process.exit(1);
}

console.log(`restoring into ${databaseUrl().url.replace(/\?.*$/, '')}`);

// Children first, so foreign keys never dangle.
for (const table of ['sessions', 'health_entries', 'users']) {
  await run(`DELETE FROM ${table}`);
}

for (const table of ['users', 'health_entries', 'sessions']) {
  const rows = dump.tables[table] || [];
  for (const row of rows) {
    const cols = Object.keys(row);
    await run(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => row[c])
    );
  }
  console.log(`  ${table}: ${rows.length} rows`);
}

console.log('restore complete');
closeDatabase();
