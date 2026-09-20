/* Vercel entry point.
 *
 * Every /api/* request is rewritten here by vercel.json, which carries the real
 * path in a `__path` query parameter. That indirection is deliberate: relying on
 * Vercel's catch-all filename semantics silently 404'd nested routes such as
 * /api/auth/me while single-segment ones worked. The parameter is explicit and
 * behaves the same everywhere.
 *
 * The request is then handed to the same handler the local server uses, so there
 * is one implementation of the API, not two.
 *
 * Static files (index.html, styles.css, js/**, admin.html) are served by Vercel's
 * CDN and never reach this function — their security headers come from vercel.json.
 */

import { openDatabase } from '../server/db.js';
import { handleRequest } from '../server/index.js';

/* A serverless instance is reused across requests, so open the database once per
 * cold start and share the promise. */
let ready = null;
const ensureDatabase = () => (ready ??= openDatabase().catch((err) => {
  ready = null; // let the next request try again rather than wedging the instance
  throw err;
}));

/** Restores the original path from the rewrite, if there is one. */
function restorePath(req) {
  const url = new URL(req.url, 'http://internal');
  const original = url.searchParams.get('__path');
  if (!original || !original.startsWith('/')) return;
  url.searchParams.delete('__path');
  const query = url.searchParams.toString();
  req.url = original + (query ? `?${query}` : '');
}

export default async function handler(req, res) {
  restorePath(req);

  try {
    await ensureDatabase();
  } catch (err) {
    console.error('[startup] database unavailable:', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'The service is starting up. Try again in a moment.' }));
    return;
  }
  return handleRequest(req, res);
}
