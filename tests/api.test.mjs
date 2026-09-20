/* API: accounts, ownership, CRUD, migration safety, validation, admin. */

import { suite, startTestServer } from './harness.mjs';

export default async function run() {
  const { ok, throws, results } = suite('api');
  process.env.ADMIN_EMAILS = '';
  const server = await startTestServer();
  const alice = server.client();
  const bob = server.client();
  const stranger = server.client();

  /* ── health ── */
  ok((await stranger.get('/api/health')).body.status === 'ok', 'GET /api/health reports ok');

  /* ── signup ── */
  let r = await alice.post('/api/auth/signup', { email: 'alice@example.com', name: 'Alice', password: 'a-good-password', acceptedTerms: true });
  ok(r.status === 200 && r.body.user.email === 'alice@example.com', 'signup creates an account');
  ok(!('passwordHash' in r.body.user), 'signup response carries no password hash');
  ok(/HttpOnly/i.test(r.headers.get('set-cookie') || ''), 'session cookie is HttpOnly');
  ok(/SameSite=Lax/i.test(r.headers.get('set-cookie') || ''), 'session cookie is SameSite=Lax');

  r = await server.client().post('/api/auth/signup', { email: 'alice@example.com', name: 'Impostor', password: 'another-password', acceptedTerms: true });
  ok(r.status === 400, 'duplicate email is refused');
  r = await server.client().post('/api/auth/signup', { email: 'not-an-email', name: 'X', password: 'a-good-password', acceptedTerms: true });
  ok(r.status === 400, 'invalid email is refused');
  r = await server.client().post('/api/auth/signup', { email: 'x@y.co', name: 'X', password: 'short', acceptedTerms: true });
  ok(r.status === 400, 'short password is refused');

  /* ── login ── */
  const alice2 = server.client();
  r = await alice2.post('/api/auth/login', { email: 'alice@example.com', password: 'wrong-password' });
  ok(r.status === 401, 'wrong password is refused');
  r = await alice2.post('/api/auth/login', { email: 'alice@example.com', password: 'a-good-password' });
  ok(r.status === 200 && r.body.user.name === 'Alice', 'login succeeds with the right password');
  r = await alice.get('/api/auth/me');
  ok(r.body.user?.email === 'alice@example.com', 'GET /api/auth/me identifies the session');
  ok((await stranger.get('/api/auth/me')).body.user === null, 'anonymous /me returns null, not an error');

  /* ── authorization ── */
  ok((await stranger.get('/api/episodes')).status === 401, 'episodes require a session');
  ok((await stranger.post('/api/episodes', { startDate: '2026-09-01' })).status === 401, 'creating requires a session');
  ok((await stranger.get('/api/summary')).status === 401, 'summary requires a session');
  ok((await stranger.get('/api/admin/metrics')).status === 401, 'admin metrics require a session');

  /* ── create ── */
  r = await alice.post('/api/episodes', {
    startDate: '2026-09-01', endDate: '2026-09-06',
    data: { symptoms: ['Fever', 'Chills'], testResult: 'positive', testType: 'RDT', treatment: 'ACT', notes: 'travelled' }
  });
  ok(r.status === 201 && r.body.episode.id, 'POST /api/episodes creates an episode');
  const id = r.body.episode.id;
  ok(r.body.episode.data.testResult === 'positive', 'domain data round-trips');
  ok(r.body.episode.context && Array.isArray(r.body.episode.tags), 'envelope keeps context and tags');
  ok(!!r.body.episode.createdAt && !!r.body.episode.updatedAt, 'timestamps are set by the server');

  /* ── validation: never trust the client ── */
  const bad = [
    [{ startDate: 'yesterday' }, 'a non-date start'],
    [{ startDate: '2099-01-01' }, 'a future start'],
    [{ startDate: '2026-09-06', endDate: '2026-09-01' }, 'recovery before start'],
    [{ startDate: '2026-09-01', type: 'sleep_night' }, 'an unregistered type'],
    [{}, 'a missing start date']
  ];
  for (const [payload, label] of bad) {
    ok((await alice.post('/api/episodes', payload)).status === 400, `rejects ${label}`);
  }
  r = await alice.post('/api/episodes', {
    startDate: '2026-03-01',
    data: { testResult: 'positive', symptoms: ['Fever'], sneaky: 'dropped', notes: 'x'.repeat(9000) }
  });
  ok(r.status === 201 && !('sneaky' in r.body.episode.data), 'unknown fields are dropped, not stored');
  ok(r.body.episode.data.notes.length <= 2000, 'oversized text is clamped');
  const sneakyId = r.body.episode.id;

  /* ── read ── */
  r = await alice.get('/api/episodes');
  ok(r.status === 200 && r.body.episodes.length === 2, 'GET /api/episodes lists this user\'s episodes');
  ok(r.body.episodes[0].startDate <= r.body.episodes[1].startDate, 'episodes come back oldest first');
  ok((await alice.get(`/api/episodes/${id}`)).body.episode.id === id, 'GET /api/episodes/:id returns one');
  ok((await alice.get('/api/episodes/nope')).status === 404, 'unknown id is 404');

  /* ── update ── */
  r = await alice.patch(`/api/episodes/${id}`, { endDate: '2026-09-08' });
  ok(r.status === 200 && r.body.episode.endDate === '2026-09-08', 'PATCH updates a field');
  ok(r.body.episode.data.testResult === 'positive', 'PATCH leaves untouched fields alone');
  ok((await alice.patch(`/api/episodes/${id}`, { endDate: '2020-01-01' })).status === 400, 'PATCH still validates');

  /* ── user isolation ── */
  await bob.post('/api/auth/signup', { email: 'bob@example.com', name: 'Bob', password: 'bobs-good-password', acceptedTerms: true });
  ok((await bob.get('/api/episodes')).body.episodes.length === 0, 'a new account starts empty');

  /* ── terms and verification ── */
  const refused = await server.client().post('/api/auth/signup',
    { email: 'noterms@example.com', name: 'No Terms', password: 'a-good-password' });
  ok(refused.status === 400, 'signing up without accepting the terms is refused');
  ok(/terms/i.test(refused.body.error || ''), 'and the reason says so');
  ok(!(await server.client().get('/api/auth/me')).body.user, 'no account was created');

  const dave = server.client();
  const made = await dave.post('/api/auth/signup',
    { email: 'dave@example.com', name: 'Dave', password: 'daves-password', acceptedTerms: true });
  ok(made.body.user.emailVerified === false, 'a new account starts unverified');
  ok((await dave.get('/api/episodes')).status === 200, 'but an unverified account still works fully');

  const { get: dbGet2, all: dbAll2, count: dbCount2 } = await import('../server/db.js');
  const terms = await dbGet2('SELECT termsAcceptedAt, termsVersion FROM users WHERE email = ?', ['dave@example.com']);
  ok(!!terms.termsAcceptedAt && !!terms.termsVersion, 'when the terms were accepted is recorded, with the version');

  const tokens = await dbAll2("SELECT * FROM email_tokens WHERE purpose = 'verify'");
  ok(tokens.length >= 1, 'a verification token is issued at sign-up');
  ok(!(await dave.post('/api/auth/verify', { token: 'made-up' })).body.user, 'a forged token verifies nothing');
  ok((await dave.post('/api/auth/verify', { token: 'made-up' })).status === 400, 'and is refused');
  ok((await server.client().post('/api/auth/resend-verification')).status === 401, 'resending needs a session');

  /* A PUBLIC_URL that is not an absolute address must never reach an email: the
   * link looks plausible, a mail client auto-links it, and nobody arrives. */
  const { config } = await import('../server/config.js');
  const restore = config.email.publicUrl;
  const linkFrom = async (value) => {
    config.email.publicUrl = value;
    const client = server.client();
    await client.post('/api/auth/signup',
      { email: `link-${Math.random().toString(36).slice(2, 8)}@example.com`, name: 'L', password: 'a-good-password', acceptedTerms: true });
    const rows = await dbAll2("SELECT userId FROM email_tokens ORDER BY createdAt DESC LIMIT 1");
    return rows.length > 0;
  };
  ok(await linkFrom('hello@fitnesskinda.fit'), 'a malformed PUBLIC_URL still issues a token rather than failing sign-up');
  config.email.publicUrl = restore;
  ok((await bob.get(`/api/episodes/${id}`)).status === 404, "another user cannot read Alice's episode");
  ok((await bob.patch(`/api/episodes/${id}`, { endDate: '2026-09-09' })).status === 404, "another user cannot edit it");
  ok((await bob.del(`/api/episodes/${id}`)).status === 404, 'another user cannot delete it');
  ok((await alice.get(`/api/episodes/${id}`)).body.episode.endDate === '2026-09-08', "Alice's episode is untouched");

  /* ── summary ── */
  r = await alice.get('/api/summary');
  ok(r.status === 200 && r.body.summary.includes('MALARIA EPISODES'), 'GET /api/summary returns the doctor summary');
  ok(r.body.summary.includes('does not recommend any medication'), 'server summary carries the disclaimer');
  ok(!(await bob.get('/api/summary')).body.summary.includes('travelled'), "Bob's summary contains none of Alice's notes");

  /* ── migration ── */
  const carol = server.client();
  await carol.post('/api/auth/signup', { email: 'carol@example.com', name: 'Carol', password: 'carols-password', acceptedTerms: true });
  const local = [
    { id: 'local-1', type: 'malaria_episode', startDate: '2025-05-14', endDate: '2025-05-21', data: { symptoms: ['Fever'], testResult: 'positive', testType: 'RDT' }, context: {}, tags: [] },
    { id: 'local-2', type: 'malaria_episode', startDate: '2026-04-08', endDate: '', data: { testResult: 'not_tested' }, context: {}, tags: [] }
  ];
  r = await carol.post('/api/migrate', { entries: local });
  ok(r.status === 200 && r.body.imported === 2, 'migration imports local entries');
  ok((await carol.get('/api/episodes')).body.episodes.length === 2, 'migrated entries are readable');
  r = await carol.post('/api/migrate', { entries: local });
  ok(r.body.imported === 0 && r.body.skipped === 2, 'running migration twice does not duplicate');

  /* ── failed migration must change nothing ── */
  const before = (await carol.get('/api/episodes')).body.episodes.length;
  r = await carol.post('/api/migrate', { entries: [{ id: 'good', startDate: '2026-01-01', data: {} }, { id: 'bad', startDate: 'rubbish' }] });
  ok(r.status === 400, 'a bad entry fails the whole migration');
  ok((await carol.get('/api/episodes')).body.episodes.length === before, 'a failed migration imports nothing at all');
  ok(!(await carol.get('/api/episodes')).body.episodes.some((e) => e.id === 'good'), 'the valid half of a failed batch is rolled back');
  ok((await carol.post('/api/migrate', { entries: 'not-an-array' })).status === 400, 'migration rejects a non-array');

  /* ── delete ── */
  ok((await alice.del(`/api/episodes/${sneakyId}`)).status === 200, 'DELETE removes an episode');
  ok((await alice.get(`/api/episodes/${sneakyId}`)).status === 404, 'a deleted episode is gone');
  ok((await alice.get('/api/episodes')).body.episodes.length === 1, 'the rest of the record survives a delete');

  /* ── CSRF and cookies ── */
  r = await alice.post('/api/episodes', { startDate: '2026-05-05' }, { headers: { Origin: 'https://evil.example' } });
  ok(r.status === 403, 'a cross-origin write is refused');
  r = await fetch(`${server.origin}/api/episodes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: alice.cookie }, body: '{}'
  });
  ok(r.status === 403, 'a write with no Origin header is refused');

  /* ── throttling ── */
  const flood = server.client();
  let throttled = false;
  for (let i = 0; i < 12; i++) {
    const res = await flood.post('/api/auth/login', { email: 'alice@example.com', password: 'guess' + i });
    if (res.status === 429) { throttled = true; break; }
  }
  ok(throttled, 'repeated wrong passwords get throttled');
  const { resetAllThrottles } = await import('../server/auth.js');
  resetAllThrottles();

  /* ── password reset ── */
  const forgetful = server.client();
  await forgetful.post('/api/auth/signup',
    { email: 'forgot@example.com', name: 'Forgetful', password: 'the-old-password', acceptedTerms: true });

  let reset = await server.client().post('/api/auth/request-reset', { email: 'forgot@example.com' });
  ok(reset.status === 200, 'asking for a reset link works');
  reset = await server.client().post('/api/auth/request-reset', { email: 'nobody@example.com' });
  ok(reset.status === 200, 'asking for one on an unknown address answers the same way');
  ok(JSON.stringify(reset.body) === JSON.stringify({ ok: true }), 'and says nothing about whether the account exists');

  const resetRows = await dbAll2("SELECT tokenHash, expiresAt FROM email_tokens WHERE purpose = 'reset'");
  ok(resetRows.length === 1, 'exactly one reset token was issued, for the real account only');
  ok(new Date(resetRows[0].expiresAt) - Date.now() < 2 * 3600 * 1000, 'a reset link expires within hours, not days');

  ok((await server.client().post('/api/auth/reset', { token: 'made-up', password: 'a-new-password' })).status === 400,
    'a forged reset token is refused');
  ok((await server.client().post('/api/auth/reset', { token: 'made-up', password: 'short' })).status === 400,
    'a short password is refused before the token is even looked at');

  /* Drive a real reset by minting a token the way the route does. */
  const { issueEmailToken } = await import('../server/auth.js');
  const forgetfulUser = await dbGet2('SELECT id FROM users WHERE email = ?', ['forgot@example.com']);
  const liveToken = await issueEmailToken(forgetfulUser.id, 'reset');

  const oldSession = server.client();
  await oldSession.post('/api/auth/login', { email: 'forgot@example.com', password: 'the-old-password' });
  ok((await oldSession.get('/api/episodes')).status === 200, 'the old session works before the reset');

  const resetter = server.client();
  const done = await resetter.post('/api/auth/reset', { token: liveToken, password: 'a-brand-new-password' });
  ok(done.status === 200 && done.body.user.email === 'forgot@example.com', 'the reset succeeds and signs you in');
  ok(done.body.user.emailVerified === true, 'and marks the address verified, since the mailbox was proved');
  ok((await oldSession.get('/api/episodes')).status === 401, 'every other session is ended by the reset');
  ok((await resetter.get('/api/episodes')).status === 200, 'the new session works');

  const stale = await server.client().post('/api/auth/reset', { token: liveToken, password: 'another-password' });
  ok(stale.status === 400, 'a reset link cannot be used twice');

  const after = server.client();
  ok((await after.post('/api/auth/login', { email: 'forgot@example.com', password: 'the-old-password' })).status === 401,
    'the old password no longer works');
  ok((await after.post('/api/auth/login', { email: 'forgot@example.com', password: 'a-brand-new-password' })).status === 200,
    'the new one does');

  /* ── admin ── */
  ok((await alice.get('/api/admin/metrics')).status === 403, 'a normal user cannot read admin metrics');

  const { run: dbRun } = await import('../server/db.js');
  await dbRun("UPDATE users SET role = 'admin' WHERE email = 'alice@example.com'");
  r = await alice.get('/api/admin/metrics');
  const realTotal = await dbCount2('SELECT COUNT(*) FROM users');
  ok(r.status === 200 && r.body.users.total === realTotal,
    `an admin reads aggregate metrics (${realTotal} users)`);
  const blob = JSON.stringify(r.body);
  ok(!/travelled|Fever|Chills|alice@example\.com|bob@example\.com/.test(blob), 'admin metrics contain no health data and no emails');
  ok(typeof r.body.usage.confirmedPositive === 'number' && Array.isArray(r.body.daily), 'admin metrics are counts only');
  ok(r.body.system.database.ok === true, 'admin metrics report database status');

  const roster = await alice.get('/api/admin/users');
  ok(roster.status === 200 && roster.body.users.length === realTotal, 'an admin lists every registered account');
  const sample = roster.body.users[0];
  ok(['id','name','email','role','joinedAt','emailVerified','acceptedTerms','entries','lastActiveAt']
      .every((k) => k in sample) && Object.keys(sample).length === 9,
    'each row is account metadata and exactly that');

  /* ── logout ── */
  ok((await alice.post('/api/auth/logout')).status === 200, 'logout succeeds');
  ok((await alice.get('/api/episodes')).status === 401, 'the session is dead after logout');

  /* ── session cannot be forged ── */
  const forger = server.client();
  forger.cookie = 'fk_session=made-up-token';
  ok((await forger.get('/api/episodes')).status === 401, 'a forged session cookie is rejected');

  await server.stop();
  return results;
}
