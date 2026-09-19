/* Vercel entry point.
 *
 * Every /api/* request lands here and is handed to the same request handler the
 * local server uses, so there is one implementation of the API, not two.
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

export default async function handler(req, res) {
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
