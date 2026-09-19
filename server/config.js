/* Configuration comes from the environment. Nothing secret is ever committed. */

import { resolve } from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',

  // Where the SQLite file lives. On a host with a mounted volume, point this at it.
  dataDir: resolve(env.DATA_DIR || './data'),

  production: env.NODE_ENV === 'production',

  // Secure cookies require HTTPS, which local development does not have.
  secureCookies: env.NODE_ENV === 'production' && env.INSECURE_COOKIES !== '1',

  sessionDays: Number(env.SESSION_DAYS || 30),

  /* Admin is granted by email, set on the host — there is no in-app way to become
   * an admin, and no UI that could be tricked into granting it. */
  adminEmails: (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  // Requests that change data must come from this origin (CSRF defence).
  allowedOrigins: (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
};
