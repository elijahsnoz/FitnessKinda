/* Configuration comes from the environment. Nothing secret is ever committed. */

import { resolve } from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',

  // Where the SQLite file lives when running against a local file.
  dataDir: resolve(env.DATA_DIR || './data'),

  /* The database. On Vercel this is a Turso URL; locally it is a plain file, and
   * the same client speaks to both, so there is one code path either way. */
  database: {
    url: env.TURSO_DATABASE_URL || '',
    authToken: env.TURSO_AUTH_TOKEN || ''
  },

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

  /* Email. With no key the sender logs instead of sending, so development and
   * tests need no account. */
  email: {
    apiKey: env.RESEND_API_KEY || '',
    from: env.EMAIL_FROM || '',
    // Where verification links point. Falls back to the request's own origin.
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, '')
  },

  /* The terms a new account agrees to. Bump this when they change materially. */
  termsVersion: env.TERMS_VERSION || '2026-09-20',

  // Requests that change data must come from this origin (CSRF defence).
  allowedOrigins: (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
};
