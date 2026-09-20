/* One process: serves the existing static app and the API.
 *
 * The frontend files are served exactly as they are on disk — the MVP is not
 * rebuilt, bundled or transformed. Everything under /api is JSON.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { openDatabase } from './db.js';
import { matchRoute } from './routes.js';
import { parseCookies, userForToken, COOKIE, purgeExpiredSessions } from './auth.js';
import { logError } from './metrics.js';
import { HttpError } from './util.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* ── Static files: an explicit allow-list, never a directory walk ── */
const STATIC = new Set(['/index.html', '/admin.html', '/verify.html', '/reset.html', '/terms.html', '/privacy.html',
  '/styles.css', '/sw.js', '/manifest.json', '/icon.svg', '/icon-tile.svg',
  '/og.png', '/robots.txt', '/sitemap.xml']);
const ALIASES = { '/': '/index.html', '/admin': '/admin.html', '/verify': '/verify.html', '/reset': '/reset.html',
  '/terms': '/terms.html', '/privacy': '/privacy.html' };

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'self'"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

const MAX_BODY = 64 * 1024;
const MAX_MIGRATE_BODY = 4 * 1024 * 1024;

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...headers
  });
  res.end(payload);
}

async function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'That request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Expected JSON.'));
      }
    });
    req.on('error', reject);
  });
}

/* Same-origin check for anything that writes. Combined with SameSite=Lax cookies
 * this is the prototype's CSRF defence. */
function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) throw new HttpError(403, 'Missing Origin header.');
  if (config.allowedOrigins.length) {
    if (!config.allowedOrigins.includes(origin)) throw new HttpError(403, 'Origin not allowed.');
    return;
  }
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Bad Origin header.');
  }
  if (host !== req.headers.host) throw new HttpError(403, 'Cross-origin request refused.');
}

async function serveStatic(req, res, pathname) {
  const wanted = ALIASES[pathname] || pathname;
  const isModule = wanted.startsWith('/js/') && wanted.endsWith('.js');
  if (!STATIC.has(wanted) && !isModule) return false;

  const safe = normalize(wanted).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, safe);
  if (!file.startsWith(ROOT)) return false;

  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    const body = await readFile(file);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Content-Length': body.length,
      // The service worker owns caching; always revalidate so a deploy lands.
      'Cache-Control': 'no-cache',
      // A service worker may only control the scope it is served from.
      ...(safe === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {})
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  } catch {
    return false;
  }
}

async function handleApi(req, res, url) {
  const match = matchRoute(req.method, url.pathname);
  if (!match) return send(res, 404, { error: 'No such endpoint.' });

  const { route, params } = match;
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE];
  const user = token ? await userForToken(token) : null;

  if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req);
  if (route.auth && !user) throw new HttpError(401, 'Sign in to continue.');

  const limit = url.pathname === '/api/migrate' ? MAX_MIGRATE_BODY : MAX_BODY;
  const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req, limit);

  const result = await route.handler({
    user,
    body,
    params,
    query: url.searchParams,
    token,
    origin: `${req.headers['x-forwarded-proto'] || (config.production ? 'https' : 'http')}://${req.headers.host || 'localhost'}`,
    ip: req.socket.remoteAddress || 'unknown'
  });

  const headers = { 'Cache-Control': 'no-store' };
  if (result.cookie) headers['Set-Cookie'] = result.cookie;
  send(res, result.status || 200, result.body, headers);
}

/** The whole app as one request handler, so it can run behind node:http locally
 *  and as a serverless function on Vercel without two copies of the logic. */
export async function handleRequest(req, res) {
  {
    const started = Date.now();
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      return send(res, 400, { error: 'Bad request.' });
    }

    try {
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        const served = await serveStatic(req, res, url.pathname);
        if (!served) send(res, 404, { error: 'Not found.' }, { 'Content-Type': 'text/plain; charset=utf-8' });
      } else {
        send(res, 405, { error: 'Method not allowed.' });
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      // Route pattern only: no ids, no query strings, never a request body.
      const pattern = url.pathname.replace(/\/api\/episodes\/[^/]+/, '/api/episodes/:id');
      await logError(pattern, status, err instanceof HttpError ? 'client' : err.name || 'error');
      if (status >= 500) console.error(`[error] ${req.method} ${pattern}: ${err.message}`);
      if (!res.headersSent) {
        send(res, status, { error: status >= 500 ? 'Something went wrong.' : err.message }, { 'Cache-Control': 'no-store' });
      }
    } finally {
      if (process.env.ACCESS_LOG === '1') {
        const pattern = url.pathname.replace(/\/api\/episodes\/[^/]+/, '/api/episodes/:id');
        console.log(`${req.method} ${pattern} ${res.statusCode} ${Date.now() - started}ms`);
      }
    }
  }
}

export function createApp() {
  return createServer(handleRequest);
}
