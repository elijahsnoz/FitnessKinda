/* End-to-end in a real browser, over the DevTools Protocol.
 *
 * Covers the five screens, recording every kind of signal, the timeline and its
 * filters, Kinda Insights, accounts and migration, offline queueing, the health
 * summary, stored-XSS, CSP, and three viewports. */

import { suite, startTestServer } from './harness.mjs';
import { launchChrome, openPage } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function run() {
  const { ok, results } = suite('browser');
  const server = await startTestServer();
  const chrome = await launchChrome();
  const page = await openPage(chrome.port, server.origin);
  await page.enableNetwork();
  await page.setViewport(390, 780);
  await page.goto(server.origin);

  const text = () => page.eval('return document.body.textContent');
  const tap = async (sel, pause = 220) => {
    await page.eval(`document.querySelector(${JSON.stringify(sel)}).click(); return true;`);
    await wait(pause);
  };

  /* ── 1. Home, with nothing recorded ── */
  ok(await page.eval(`return !!document.querySelector('#view-home .empty')`), 'home opens on an empty state, not a dashboard');
  ok((await text()).includes('Your story starts here'), 'the empty state invites rather than reports nothing');
  ok((await text()).includes('Know your body. Keep your history.'), 'the tagline is on the home screen');
  ok(await page.eval(`return document.querySelectorAll('.tab').length === 5`), 'five sections');
  ok(await page.eval(`return [...document.querySelectorAll('.tab span')].map(s => s.textContent).join(',') === 'Home,Timeline,Move,Health,Profile'`),
    'the sections are Home, Timeline, Move, Health, Profile');

  /* ── 2. The add sheet ── */
  await tap('[data-add]');
  ok(await page.eval(`return !!document.querySelector('.sheet')`), 'Add opens a sheet');
  ok(await page.eval(`return document.querySelectorAll('.sheet-item').length === 7`), 'every signal is offered');
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true;`);
  await wait(150);
  ok(await page.eval(`return !document.querySelector('.sheet')`), 'Escape closes the sheet');

  /* ── 3. Recording movement ── */
  await tap('[data-add]');
  await tap('[data-record="movement"]');
  ok(await page.eval(`return !!document.querySelector('#record-form')`), 'picking a kind opens one form');
  ok(await page.eval(`return document.querySelector('#f-startDate').value === new Date().toISOString().slice(0,10)`),
    'the date is already today');
  await page.eval(`
    document.querySelector('input[name="activity"][value="Walk"]').checked = true;
    document.querySelector('#f-minutes').value = '35';
    document.querySelector('input[name="effort"][value="steady"]').click();
    document.querySelector('#record-form').requestSubmit();
    return true;`);
  await wait(400);
  ok(await page.eval(`return !document.querySelector('#view-timeline').hidden`), 'saving lands on the timeline');
  ok(await page.eval(`return document.querySelectorAll('#view-timeline .event').length === 1`), 'the record is there');
  ok((await text()).includes('Added to your timeline'), 'the confirmation says where it went');
  ok((await text()).includes('35 min'), 'the timeline shows what was recorded');

  /* ── 4. Every other kind records too ── */
  const kinds = [
    ['sleep', `document.querySelector('#f-hours').value='7.5'; document.querySelector('input[name="quality"][value="good"]').click();`],
    ['health_event', `document.querySelector('input[name="kind"][value="symptom"]').click(); document.querySelector('#f-what').value='Headache';`],
    ['measurement', `document.querySelector('#f-kind').value='Weight'; document.querySelector('#f-value').value='72.4 kg';`],
    ['medication', `document.querySelector('#f-name').value='Paracetamol'; document.querySelector('#f-dose').value='500mg';`],
    ['note', `document.querySelector('#f-text').value='Felt steady all week.';`]
  ];
  for (const [type, fill] of kinds) {
    await tap('[data-add]');
    await tap(`[data-record="${type}"]`);
    await page.eval(`${fill} document.querySelector('#record-form').requestSubmit(); return true;`);
    await wait(320);
  }
  ok(await page.eval(`return document.querySelectorAll('#view-timeline .event').length === 6`), 'all six kinds are on the timeline');
  ok(await page.eval(`return JSON.parse(localStorage.getItem('fitnesskinda.record.v1')).entries.length === 6`),
    'and all six are on the device');

  /* ── 5. A note needs words ── */
  await tap('[data-add]');
  await tap('[data-record="note"]');
  await page.eval(`document.querySelector('#record-form').requestSubmit(); return true;`);
  await wait(250);
  ok(await page.eval(`return !document.querySelector('#record-error').hidden`), 'an empty note is refused with a reason');
  await tap('[data-cancel]');

  /* ── 6. Timeline filters ── */
  await tap('.tab[data-view="timeline"]');
  ok(await page.eval(`return document.querySelectorAll('.filter').length === 6`), 'the timeline offers filters');
  await tap('[data-filter="move"]');
  ok(await page.eval(`return document.querySelectorAll('#view-timeline .event').length === 1`), 'filtering to Move shows one record');
  await tap('[data-filter="health"]');
  ok(await page.eval(`return document.querySelectorAll('#view-timeline .event').length === 2`), 'Health covers events and medication');
  await tap('[data-filter="all"]');
  ok(await page.eval(`return document.querySelectorAll('#view-timeline .event').length === 6`), 'All brings everything back');
  ok(await page.eval(`return document.querySelectorAll('.day').length >= 1`), 'entries are grouped under day headings');

  /* ── 7. Malaria keeps its own behaviour ── */
  await tap('[data-add]');
  await tap('[data-record="malaria_episode"]');
  await page.eval(`
    document.querySelector('#f-startDate').value = '2026-09-10';
    document.querySelector('input[name="symptoms"][value="Fever"]').checked = true;
    const pos = document.querySelector('input[name="testResult"][value="positive"]');
    pos.click(); pos.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#record-form').requestSubmit();
    return true;`);
  await wait(400);
  ok(await page.eval(`return !!document.querySelector('[data-action="recover"]')`), 'an open episode offers "mark as recovered"');
  await tap('[data-action="recover"]', 350);
  ok(await page.eval(`return !document.querySelector('[data-action="recover"]')`), 'and the action goes once it is closed');

  /* ── 8. Edit and remove ── */
  await page.eval(`document.querySelectorAll('#view-timeline .event-more summary')[0].click(); return true;`);
  await wait(150);
  await tap('[data-edit]');
  ok(await page.eval(`return document.querySelector('#record-title').textContent.startsWith('Edit')`), 'editing says so');
  await tap('[data-cancel]');
  const before = await page.eval(`return document.querySelectorAll('#view-timeline .event').length`);
  await page.eval(`window.confirm = () => true; document.querySelectorAll('#view-timeline .event-more summary')[0].click(); return true;`);
  await wait(150);
  await tap('[data-delete]', 320);
  ok(await page.eval(`return document.querySelectorAll('#view-timeline .event').length`) === before - 1, 'removing takes one away');

  /* ── 9. Kinda Insights ── */
  await page.eval(`
    const mk = (t, startDate, data) => ({ id: t + startDate, type: t, startDate, endDate: '', data, context: {}, tags: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const entries = [];
    for (let i = 1; i <= 8; i++) entries.push(mk('movement', iso(i * 3), { activity: ['Walk'], minutes: '30', effort: 'steady', notes: '' }));
    for (let i = 1; i <= 5; i++) entries.push(mk('sleep', iso(i), { hours: String(7 + (i % 2) * 0.5), quality: 'good', notes: '' }));
    localStorage.setItem('fitnesskinda.record.v1', JSON.stringify({ app: 'fitnesskinda', schema: 1, created: iso(30), entries }));
    return true;`);
  await page.reload();
  await wait(900);
  const home = await text();
  ok(!!(await page.eval(`return document.querySelectorAll('#view-home .insight').length`)), 'home surfaces observations');
  ok(home.includes('Lately'), 'home shows a snapshot');
  ok(/consistent|hours/.test(home), 'an observation describes the sleep that was recorded');
  ok(!/you have|diagnos|you should|because/i.test(home.replace(/Know your body[^.]*\./, '')),
    'no observation diagnoses, prescribes or claims a cause');

  /* ── 10. Move and Health screens ── */
  await tap('.tab[data-view="move"]', 300);
  ok((await text()).includes('How you use your body'), 'Move has its own question');
  ok(await page.eval(`return !!document.querySelector('#view-move svg.chart')`), 'Move shows minutes a week');
  await tap('.tab[data-view="health"]', 300);
  ok((await text()).includes('My health record'), 'Health reads as a record, not a database');
  ok((await text()).includes('does not diagnose'), 'the boundary is stated on the health screen');

  /* ── 11. Summary ── */
  await tap('[data-goto="summary"]', 400);
  const summary = await page.eval(`return document.querySelector('#summary-text').textContent`);
  ok(summary.includes('PERSONAL HEALTH SUMMARY'), 'the summary generates');
  ok(summary.includes('MOVEMENT') && summary.includes('SLEEP'), 'it covers every signal recorded');
  ok(summary.includes('does not recommend any medication'), 'and carries the disclaimer');

  /* ── 12. Profile, accounts, migration ── */
  await tap('.tab[data-view="profile"]', 400);
  ok(await page.eval(`return !!document.querySelector('#auth-form')`), 'profile offers an account');
  ok(await page.eval(`return getComputedStyle(document.querySelector('#wrap-consent')).display === 'none'`),
    'and does not ask signing-in people to re-accept the terms');
  ok(await page.eval(`return getComputedStyle(document.querySelector('#wrap-authconfirm')).display === 'none'`),
    'signing in does not ask for the password twice');
  ok(await page.eval(`return getComputedStyle(document.querySelector('#wrap-forgot')).display !== 'none'`),
    'signing in offers a way out of a forgotten password');
  await tap('#forgot', 250);
  ok((await page.eval(`return document.querySelector('#auth-error').textContent`)).includes('Enter your email'),
    'and asks for the address first rather than failing quietly');

  /* The password can be checked before it is committed to. */
  ok(await page.eval(`return document.querySelector('#auth-password').type === 'password'`), 'the password starts hidden');
  await tap('[data-reveal="auth-password"]', 150);
  ok(await page.eval(`return document.querySelector('#auth-password').type === 'text'`), 'the eye reveals it');
  ok(await page.eval(`return document.querySelector('[data-reveal="auth-password"]').getAttribute('aria-label') === 'Hide password'`),
    'and the button says what it will do next');
  await tap('[data-reveal="auth-password"]', 150);
  ok(await page.eval(`return document.querySelector('#auth-password').type === 'password'`), 'tapping again hides it');
  ok(await page.eval(`
    const b = document.querySelector('[data-reveal="auth-password"]').getBoundingClientRect();
    return Math.round(b.height) >= 44 && Math.round(b.width) >= 44;`), 'the eye is a comfortable target');
  ok((await text()).includes('Your body. Your history. Your data.'), 'privacy is on the screen, not buried');

  /* The documents are reachable before signing up, and look like ours rather
     than like browser-default links. */
  ok(await page.eval(`return document.querySelectorAll('.small-print .link-row').length === 2`),
    'terms and privacy are reachable from a signed-out profile');
  ok(await page.eval(`
    const rows = [...document.querySelectorAll('.link-row')];
    return rows.every(a => {
      const cs = getComputedStyle(a);
      return cs.textDecorationLine === 'none' && a.getBoundingClientRect().height >= 44;
    });`), 'and are unstyled-link free with comfortable targets');
  await page.eval(`
    document.querySelector('input[name="authmode"][value="signup"]').click();
    document.querySelector('input[name="authmode"][value="signup"]').dispatchEvent(new Event('change', { bubbles: true }));
    return true;`);
  await wait(200);
  ok(await page.eval(`return getComputedStyle(document.querySelector('#wrap-consent')).display !== 'none'`),
    'creating an account asks you to accept the terms');
  ok(await page.eval(`return getComputedStyle(document.querySelector('#wrap-forgot')).display === 'none'`),
    'and does not offer a password reset to someone without an account yet');
  ok(await page.eval(`return !!document.querySelector('#wrap-consent a[href="/terms"]') && !!document.querySelector('#wrap-consent a[href="/privacy"]')`),
    'both documents are linked from the box');
  await page.eval(`
    document.querySelector('#auth-name').value = 'Elijah';
    document.querySelector('#auth-email').value = 'first@user.test';
    document.querySelector('#auth-password').value = 'a-good-password';
    document.querySelector('#auth-form').requestSubmit();
    return true;`);
  await wait(500);
  ok(await page.eval(`return !document.querySelector('#auth-error').hidden`), 'signing up without accepting is refused in the browser');
  ok(!(await page.eval(`return !!document.querySelector('#do-migrate')`)), 'and no account is created');

  /* Typing the password twice, and being told where it stands. */
  ok(await page.eval(`return getComputedStyle(document.querySelector('#wrap-authconfirm')).display !== 'none'`),
    'creating an account asks for the password twice');
  await page.eval(`
    const again = document.querySelector('#auth-confirm');
    again.value = 'a-good-passwerd';
    again.dispatchEvent(new Event('input', { bubbles: true }));
    return true;`);
  await wait(150);
  ok((await page.eval(`return document.querySelector('#confirm-hint').textContent`)).includes('do not match'),
    'a mismatch says so while you type');
  ok(await page.eval(`return document.querySelector('#confirm-hint').classList.contains('is-mismatch')`),
    'and is not carried by colour alone');
  await page.eval(`
    document.querySelector('#auth-terms').checked = true;
    document.querySelector('#auth-form').requestSubmit();
    return true;`);
  await wait(300);
  ok((await page.eval(`return document.querySelector('#auth-error').textContent`)).includes('not the same'),
    'and a mismatched sign-up is refused');
  await page.eval(`
    const again = document.querySelector('#auth-confirm');
    again.value = 'a-good-password';
    again.dispatchEvent(new Event('input', { bubbles: true }));
    return true;`);
  await wait(150);
  ok((await page.eval(`return document.querySelector('#confirm-hint').textContent`)).includes('match'),
    'and a match says so too');

  await page.eval(`
    document.querySelector('input[name="authmode"][value="signup"]').click();
    document.querySelector('input[name="authmode"][value="signup"]').dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#auth-name').value = 'Elijah';
    document.querySelector('#auth-email').value = 'first@user.test';
    document.querySelector('#auth-password').value = 'a-good-password';
    document.querySelector('#auth-terms').checked = true;
    document.querySelector('#auth-form').requestSubmit();
    return true;`);
  await wait(1100);
  ok(await page.eval(`return !!document.querySelector('#do-migrate')`), 'signing up offers to bring the device record over');
  ok(await page.eval(`return JSON.parse(localStorage.getItem('fitnesskinda.record.v1')).entries.length === 13`),
    'nothing is uploaded before the person agrees');
  await tap('#do-migrate', 1200);
  ok(await page.eval(`
    const r = await fetch('/api/episodes', { credentials: 'same-origin' });
    return (await r.json()).episodes.length;`) === 13, 'the account now holds every entry');
  ok(await page.eval(`return !!localStorage.getItem('fitnesskinda.premigration.v1')`), 'a pre-migration backup stays on the device');
  ok((await text()).includes('Confirm your email'), 'an unverified account is asked to confirm, not blocked');
  ok(await page.eval(`return !!document.querySelector('#resend-verify')`), 'and can ask for the link again');

  /* ── 13. Offline ── */
  await page.setOffline(true);
  await tap('[data-add]');
  await tap('[data-record="note"]');
  await page.eval(`document.querySelector('#f-text').value = 'Written with no signal.'; document.querySelector('#record-form').requestSubmit(); return true;`);
  await wait(700);
  ok(await page.eval(`return document.querySelectorAll('#view-timeline .event').length === 14`), 'recording works offline');
  ok(await page.eval(`return JSON.parse(localStorage.getItem('fitnesskinda.queue.v1') || '[]').length >= 1`), 'the write is queued');
  await page.setOffline(false);
  await page.eval(`window.dispatchEvent(new Event('online')); return true;`);
  await wait(1400);
  ok(await page.eval(`return JSON.parse(localStorage.getItem('fitnesskinda.queue.v1') || '[]').length === 0`), 'the queue drains on reconnect');
  ok(await page.eval(`
    const r = await fetch('/api/episodes', { credentials: 'same-origin' });
    return (await r.json()).episodes.length;`) === 14, 'and the entry reaches the account');

  /* ── 14. Stored XSS and CSP ── */
  await page.eval(`
    await fetch('/api/episodes', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'note', startDate: '2026-02-02', data: { text: '<img src=x onerror="window.__pwned=1">' } }) });
    return true;`);
  await page.reload();
  await wait(1200);
  await tap('.tab[data-view="timeline"]', 400);
  ok(!(await page.eval(`return !!window.__pwned`)), 'a stored script payload does not run');
  ok(await page.eval(`return document.querySelectorAll('#view-timeline img, #view-timeline script').length === 0`), 'and creates no elements');
  ok(await page.eval(`
    window.__inline = 0;
    const s = document.createElement('script');
    s.textContent = 'window.__inline = 1';
    document.body.appendChild(s);
    await new Promise(r => setTimeout(r, 120));
    return window.__inline;`) === 0, 'the CSP blocks an injected inline script');
  const cached = await page.eval(`
    const out = [];
    for (const n of await caches.keys()) out.push(...(await (await caches.open(n)).keys()).map(k => new URL(k.url).pathname));
    return out;`);
  ok(cached.length > 0, 'the app shell is cached for offline use');
  ok(!cached.some((p) => p.startsWith('/api/')), 'no API response is cached');

  /* ── 15. The documents behind the checkbox ── */
  await page.goto(`${server.origin}/terms`);
  await wait(400);
  ok((await text()).includes('not medical advice'), 'the terms lead with what this is not');
  ok((await text()).includes('ends every other session'), 'and say what a password reset actually does');
  await page.goto(`${server.origin}/privacy`);
  await wait(400);
  ok((await text()).includes('Your body. Your history. Your data.'), 'the privacy notice opens with the promise');
  ok((await text()).includes('We run no analytics'), 'and states what is not done');
  await page.goto(`${server.origin}/reset`);
  await wait(600);
  ok((await text()).includes('incomplete'), 'the reset page handles a missing token gracefully');
  await page.goto(`${server.origin}/reset?token=not-real`);
  await wait(600);
  ok(!!(await page.eval(`return document.querySelector('#reset-form')`)), 'with a token it offers the form');
  await page.eval(`
    document.querySelector('#reset-password').value = 'a-new-password';
    const again = document.querySelector('#reset-confirm');
    again.value = 'a-new-passwerd';
    again.dispatchEvent(new Event('input', { bubbles: true }));
    return true;`);
  await wait(200);
  ok((await page.eval(`return document.querySelector('#reset-hint').textContent`)).includes('do not match'),
    'the reset form checks the two passwords as you type');
  await page.eval(`document.querySelector('#reset-form').requestSubmit(); return true;`);
  await wait(300);
  ok((await page.eval(`return document.querySelector('#reset-error').textContent`)).includes('not the same'),
    'and refuses a mismatch');

  await page.goto(`${server.origin}/verify`);
  await wait(600);
  ok((await text()).includes('incomplete'), 'the verify page handles a missing token gracefully');
  ok(await page.eval(`return !!document.querySelector('.topbar-mark')`), 'and still looks like FitnessKinda');
  /* What a person would notice, not which display keyword won: a flex item's
     inline-flex blockifies to flex, so asserting the keyword proves nothing. */
  ok(await page.eval(`
    const a = document.querySelector('a.btn');
    const cs = getComputedStyle(a);
    const r = a.getBoundingClientRect();
    return cs.textDecorationLine === 'none'
      && /flex/.test(cs.display)
      && cs.justifyContent === 'center'
      && r.height >= 44;`),
    'a link styled as a button renders as a button');
  await page.goto(server.origin);
  await wait(900);

  /* ── 16. Nothing may depend on an inline style ── */
  await page.goto(server.origin);
  await wait(900);
  const inlineStyles = await page.eval(`
    const seen = [];
    for (const view of ['home', 'timeline', 'move', 'health', 'profile']) {
      document.querySelector('.tab[data-view="' + view + '"]').click();
      await new Promise(r => setTimeout(r, 150));
      document.querySelectorAll('#view-' + view + ' [style]').forEach((el) =>
        seen.push(view + ': ' + el.tagName.toLowerCase() + ' ' + el.getAttribute('style')));
    }
    return seen;`);
  if (inlineStyles.length) console.error('  inline styles found:', inlineStyles.join(' | '));
  ok(inlineStyles.length === 0,
    'no screen relies on a style attribute, which our CSP silently drops');

  /* ── 17. Viewports ── */
  for (const [w, h, name] of [[390, 780, 'mobile 390'], [768, 1024, 'tablet 768'], [1280, 900, 'desktop 1280']]) {
    await page.setViewport(w, h, w < 700);
    await tap('.tab[data-view="home"]', 320);
    const layout = await page.eval(`
      const doc = document.documentElement;
      const nav = document.querySelector('.tabbar').getBoundingClientRect();
      return {
        hScroll: doc.scrollWidth > doc.clientWidth + 1,
        navSide: nav.height > 200,
        tabs: document.querySelectorAll('.tab').length,
        tap: Math.min(...[...document.querySelectorAll('.tab')].map(t => Math.round(t.getBoundingClientRect().height)))
      };`);
    ok(!layout.hScroll, `${name}: no horizontal scrolling`);
    ok(layout.tabs === 5 && layout.tap >= 44, `${name}: five sections, comfortable targets (${layout.tap}px)`);
    if (w >= 900) ok(layout.navSide, `${name}: navigation moves to the side`);
  }

  await page.close();
  chrome.close();
  await server.stop();
  return results;
}

/* Run directly: node tests/browser.mjs */
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const results = await run();
  console.log(`\n${results.passed} passed, ${results.failed} failed`);
  if (results.failures.length) console.log(' - ' + results.failures.join('\n - '));
  process.exit(results.failed ? 1 : 0);
}
