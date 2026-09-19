/* Consistent SQLite snapshot.
 *
 * A plain file copy of a live WAL database can be torn. VACUUM INTO writes a
 * complete, consistent copy while the app keeps running, with no extra tooling.
 *
 *   npm run backup                 → DATA_DIR/backups/fitnesskinda-YYYY-MM-DD.db
 *   npm run backup -- /some/path   → that path
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dataDir = resolve(process.env.DATA_DIR || './data');
const source = join(dataDir, 'fitnesskinda.db');
const keep = Number(process.env.BACKUP_KEEP || 14);

const day = new Date().toISOString().slice(0, 10);
const target = process.argv[2] || join(dataDir, 'backups', `fitnesskinda-${day}.db`);

mkdirSync(join(target, '..'), { recursive: true });

const db = new DatabaseSync(source, { readOnly: true });
try {
  // VACUUM INTO refuses to overwrite, so a same-day rerun replaces cleanly.
  try { unlinkSync(target); } catch { /* not there yet */ }
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

const size = (statSync(target).size / 1024).toFixed(0);
console.log(`backup written: ${target} (${size} KB)`);

// Keep the last N daily files; anything older is the volume snapshot's problem.
const dir = join(target, '..');
const old = readdirSync(dir)
  .filter((f) => /^fitnesskinda-\d{4}-\d{2}-\d{2}\.db$/.test(f))
  .sort()
  .slice(0, -keep);
old.forEach((f) => { unlinkSync(join(dir, f)); console.log(`removed old backup: ${f}`); });
