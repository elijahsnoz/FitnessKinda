/* Backup: dumps every table to a JSON file.
 *
 * VACUUM INTO only works against a local file, and in production the database is
 * a Turso instance reached over HTTP — so the portable form is a dump. The output
 * restores with scripts/restore.mjs and can be read by anything.
 *
 *   npm run backup                 → ./backups/fitnesskinda-YYYY-MM-DD.json
 *   npm run backup -- /some/path   → that path
 */

import { writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { openDatabase, all, closeDatabase, databaseUrl } from '../server/db.js';

const TABLES = ['schema_migrations', 'users', 'health_entries', 'sessions'];
const keep = Number(process.env.BACKUP_KEEP || 14);

const day = new Date().toISOString().slice(0, 10);
const target = resolve(process.argv[2] || join('backups', `fitnesskinda-${day}.json`));

await openDatabase();

const dump = { app: 'fitnesskinda', takenAt: new Date().toISOString(), tables: {} };
for (const table of TABLES) {
  dump.tables[table] = (await all(`SELECT * FROM ${table}`)).map((row) => ({ ...row }));
}
closeDatabase();

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(dump, null, 2));

const counts = TABLES.map((t) => `${t} ${dump.tables[t].length}`).join(', ');
console.log(`backup written: ${target} (${(statSync(target).size / 1024).toFixed(0)} KB)`);
console.log(`  source: ${databaseUrl().url.replace(/\?.*$/, '')}`);
console.log(`  rows:   ${counts}`);
console.log('  note:   password hashes and session tokens are in this file — keep it somewhere safe.');

// Keep the last N dated dumps in the same directory.
const dir = dirname(target);
readdirSync(dir)
  .filter((f) => /^fitnesskinda-\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .slice(0, -keep)
  .forEach((f) => { unlinkSync(join(dir, f)); console.log(`  removed old backup: ${f}`); });
