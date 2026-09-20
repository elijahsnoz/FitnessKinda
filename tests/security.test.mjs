/* Security checks. These try to break the rules, not just confirm them. */

import { suite, startTestServer } from './harness.mjs';

export default async function run() {
  const { ok, results } = suite('security');
  const server = await startTestServer();
  const { get: dbGet, all: dbAll, run: dbRun, count: dbCount } = await import('../server/db.js');

  const alice = server.client();
  const mallory = server.client();
  await alice.post('/api/auth/signup', { email: 'alice@sec.test', name: 'Alice', password: 'alice-password', acceptedTerms: true });
  await mallory.post('/api/auth/signup', { email: 'mallory@sec.test', name: 'Mallory', password: 'mallory-password', acceptedTerms: true });

  const created = await alice.post('/api/episodes', {
    startDate: '2026-08-01', data: { testResult: 'positive', notes: 'SECRET-SYMPTOM-NOTE' }
  });
  const aliceId = created.body.episode.id;

  /* ── Passwords and sessions at rest ── */
  const row = await dbGet('SELECT * FROM users WHERE email = ?', ['alice@sec.test']);
  ok(!row.passwordHash.includes('alice-password'), 'the password is not stored in plaintext');
  ok(row.passwordHash.startsWith('scrypt$'), 'passwords are stored as scrypt hashes');
  const cookieToken = alice.cookie.split('=')[1];
  const sessions = await dbAll('SELECT tokenHash FROM sessions');
  ok(sessions.length > 0 && !sessions.some((s) => s.tokenHash === cookieToken),
    'the session cookie value is not what is stored — only its hash is');

  /* ── Ownership cannot be talked into changing ── */
  let r = await mallory.post('/api/episodes', { startDate: '2026-08-02', userId: row.id, data: {} });
  ok(r.status === 201, 'a userId in the payload is accepted but ignored');
  ok((await dbGet('SELECT userId FROM health_entries WHERE id = ?', [r.body.episode.id])).userId !== row.id,
    'a client cannot assign its entry to another user');

  r = await mallory.post('/api/episodes', { id: aliceId, startDate: '2026-08-03', data: { notes: 'overwritten' } });
  ok(r.status === 201 && r.body.episode.id !== aliceId, "reusing another user's entry id gets a fresh id instead");
  ok((await alice.get(`/api/episodes/${aliceId}`)).body.episode.data.notes === 'SECRET-SYMPTOM-NOTE',
    "the other user's episode is untouched");

  /* ── Roles cannot be self-granted ── */
  r = await mallory.post('/api/auth/signup', { email: 'admin2@sec.test', name: 'X', password: 'password-here', acceptedTerms: true, role: 'admin' });
  const sneaky = await dbGet('SELECT role FROM users WHERE email = ?', ['admin2@sec.test']);
  ok(!sneaky || sneaky.role === 'user', 'a signup cannot ask for the admin role');
  ok((await mallory.get('/api/admin/metrics')).status === 403, 'a normal account cannot read admin metrics');

  /* ── Headers ── */
  const page = await server.client().get('/');
  ok(/default-src 'self'/.test(page.headers.get('content-security-policy') || ''), 'pages carry a Content-Security-Policy');
  ok(!/unsafe-inline|unsafe-eval/.test(page.headers.get('content-security-policy') || ''),
    'the CSP allows no inline or eval script');
  ok(page.headers.get('x-content-type-options') === 'nosniff', 'responses set nosniff');
  const apiRes = await alice.get('/api/episodes');
  ok((apiRes.headers.get('cache-control') || '').includes('no-store'), 'API responses are not cacheable');

  /* ── Static surface ── */
  for (const path of ['/server/db.js', '/server/auth.js', '/.env', '/data/fitnesskinda.db', '/package.json', '/tests/api.test.mjs']) {
    ok((await server.client().get(path)).status === 404, `${path} is not served`);
  }
  ok((await server.client().get('/js/../server/auth.js')).status === 404, 'path traversal is refused');

  /* ── Errors say little ── */
  r = await alice.get('/api/episodes/%27%20OR%201%3D1--');
  ok(r.status === 404 && !/SQL|sqlite|stack|at Object/i.test(r.text), 'a SQL-ish id returns a plain 404 with no internals');
  ok((await dbCount('SELECT COUNT(*) FROM health_entries')) > 0, 'the table is still there afterwards');

  /* ── Health data never reaches the logs ── */
  const logged = [];
  const realLog = console.log;
  const realError = console.error;
  console.log = (...a) => logged.push(a.join(' '));
  console.error = (...a) => logged.push(a.join(' '));
  process.env.ACCESS_LOG = '1';
  await alice.post('/api/episodes', { startDate: '2026-08-05', data: { notes: 'LOG-LEAK-CANARY', symptoms: ['Fever'] } });
  await alice.get(`/api/episodes/${aliceId}`);
  await alice.post('/api/episodes', { startDate: 'rubbish' });
  process.env.ACCESS_LOG = '0';
  console.log = realLog;
  console.error = realError;
  const logText = logged.join('\n');
  ok(!/LOG-LEAK-CANARY|SECRET-SYMPTOM-NOTE|Fever/.test(logText), 'logs contain no symptoms, notes or other health data');
  ok(!/alice@sec\.test/.test(logText), 'logs contain no email addresses');
  ok(!logText.includes(aliceId), 'logs carry the route pattern, not entry ids');

  /* ── Admin metrics stay aggregate ── */
  await dbRun("UPDATE users SET role = 'admin' WHERE email = 'alice@sec.test'");
  const metrics = await alice.get('/api/admin/metrics');
  const blob = JSON.stringify(metrics.body);
  ok(!/SECRET-SYMPTOM-NOTE|LOG-LEAK-CANARY|Fever|@sec\.test/.test(blob), 'admin metrics expose no health data and no emails');
  ok(!/"userId"|"id":/.test(blob), 'admin metrics expose no user or entry identifiers');

  /* ── Sessions end ── */
  /* A verification token must be stored hashed, like a session. */
  const liveTokens = await dbAll("SELECT tokenHash FROM email_tokens");
  ok(liveTokens.every((t) => t.tokenHash.length === 64), 'email tokens are stored as hashes, not as links');

  await alice.post('/api/auth/logout');
  ok((await alice.get('/api/episodes')).status === 401, 'a logged-out session cannot read records');
  ok((await dbCount('SELECT COUNT(*) FROM sessions WHERE userId = ?', [row.id])) === 0,
    'logging out removes the session row');

  await server.stop();
  return results;
}
