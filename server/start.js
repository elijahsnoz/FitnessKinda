/* Entry point for running the app as a normal server (local development, or any
 * host with a long-running process). On Vercel, api/index.js is the entry instead. */

const { config } = await import('./config.js');
const { openDatabase } = await import('./db.js');
const { createApp } = await import('./index.js');
const { purgeExpiredSessions } = await import('./auth.js');

await openDatabase();
await purgeExpiredSessions();
setInterval(() => { purgeExpiredSessions().catch(() => {}); }, 6 * 60 * 60 * 1000).unref();

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
