/* Small server helpers. */

import { randomBytes } from 'node:crypto';

export const uid = () => randomBytes(12).toString('base64url');
export const nowISO = () => new Date().toISOString();

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorised = (msg = 'Sign in to continue.') => new HttpError(401, msg);
export const forbidden = (msg = 'Not allowed.') => new HttpError(403, msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, msg);
