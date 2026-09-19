/* Server-side validation.
 *
 * The rules live in the domain module the frontend already uses
 * (js/domains/malaria.js), so the two can never drift. Everything a client sends
 * is rebuilt from scratch through the domain's own fromValues(): unknown keys are
 * dropped rather than trusted, whatever the request contained.
 */

import { byType } from '../js/registry.js';
import { badRequest } from './util.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const LIMITS = {
  string: 2000,
  arrayItems: 50,
  arrayItemLength: 120,
  tags: 20,
  jsonBytes: 8000
};

/** Recursively clamps whatever a client sent to sane sizes and plain types. */
function clamp(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null) return value;
  if (typeof value === 'string') return value.slice(0, LIMITS.string);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, LIMITS.arrayItems)
      .map((v) => (typeof v === 'string' ? v.slice(0, LIMITS.arrayItemLength) : clamp(v, depth + 1)));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 40)) out[String(k).slice(0, 60)] = clamp(v, depth + 1);
    return out;
  }
  return null;
}

function plainObject(value, field) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw badRequest(`${field} must be an object.`);
  const clamped = clamp(value);
  if (JSON.stringify(clamped).length > LIMITS.jsonBytes) throw badRequest(`${field} is too large.`);
  return clamped;
}

/**
 * Turns an untrusted payload into a canonical entry body, or throws HttpError.
 * Returns { type, startDate, endDate, data, context, tags }.
 */
export function validateEntry(payload, { partial = false, existing = null } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('Expected an episode object.');
  }

  const type = String(payload.type || existing?.type || 'malaria_episode');
  const domain = byType(type);
  if (!domain) throw badRequest(`Unknown entry type: ${type}`);

  // Merge over the existing entry so PATCH can carry only what changed.
  const base = existing
    ? domain.toValues(existing)
    : { startDate: '', endDate: '', ...domain.fromValues({}).data };

  const incoming = {
    ...base,
    ...(payload.startDate !== undefined ? { startDate: String(payload.startDate) } : {}),
    ...(payload.endDate !== undefined ? { endDate: String(payload.endDate ?? '') } : {}),
    ...(payload.data && typeof payload.data === 'object' ? clamp(payload.data) : {})
  };

  if (!partial || payload.startDate !== undefined) {
    if (!DATE.test(incoming.startDate || '')) throw badRequest('startDate must be YYYY-MM-DD.');
  }
  if (incoming.endDate && !DATE.test(incoming.endDate)) throw badRequest('endDate must be YYYY-MM-DD or empty.');

  // The domain's own rules — the same function the phone runs.
  const error = domain.validate(incoming);
  if (error) throw badRequest(error);

  // Rebuild through the domain so only fields it knows about survive.
  const shape = domain.fromValues(incoming);

  const tags = Array.isArray(payload.tags)
    ? payload.tags.slice(0, LIMITS.tags).map((t) => String(t).slice(0, 60))
    : existing?.tags || [];

  return {
    type,
    startDate: shape.startDate,
    endDate: shape.endDate || '',
    data: shape.data,
    context: payload.context !== undefined ? plainObject(payload.context, 'context') : existing?.context || {},
    tags
  };
}

/* ── Account fields ─────────────────────────────────────────────── */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCredentials({ email, name, password }, { requireName = false } = {}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!EMAIL.test(cleanEmail) || cleanEmail.length > 254) throw badRequest('Enter a valid email address.');

  const pw = String(password || '');
  if (pw.length < 8) throw badRequest('Use a password of at least 8 characters.');
  if (pw.length > 200) throw badRequest('That password is too long.');

  let cleanName = String(name || '').trim().slice(0, 80);
  if (requireName && cleanName.length < 1) throw badRequest('Enter your name.');

  return { email: cleanEmail, name: cleanName, password: pw };
}
