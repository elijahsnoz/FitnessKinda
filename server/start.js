/* Entry point.
 *
 * The Node version is checked here, before anything imports node:sqlite, so an
 * old runtime produces a sentence rather than a stack trace.
 */

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`FitnessKinda needs Node 22.5 or newer — this is ${process.versions.node}.`);
  console.error('Node 22.5 introduced the built-in SQLite driver this server uses.');
  process.exit(1);
}

const { config } = await import('./config.js');
const { openDatabase } = await import('./db.js');
const { createApp } = await import('./index.js');
const { purgeExpiredSessions } = await import('./auth.js');

openDatabase();
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 6 * 60 * 60 * 1000).unref();

const server = createApp();
server.listen(config.port, config.host, () => {
  console.log(`FitnessKinda on http://localhost:${config.port}  (data: ${config.dataDir})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
