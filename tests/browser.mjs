/* End-to-end in a real browser, driven over the DevTools Protocol.
 *
 * Covers: the original MVP signed out, sign-up, migration, the dashboard,
 * offline queueing, and the three viewports. */

import { suite, startTestServer } from './harness.mjs';
import { launchChrome, openPage } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function run() {
  const { ok, results } = suite('browser');
  const server = await startTestServer();
  const chrome = await launchChrome();
  const page = await openPage(chrome.port, server.origin);
  await page.enableNetwork();
  await page.setViewport(390, 700);
  await page.goto(server.origin);

  const $ = (sel) => `document.querySelector(${JSON.stringify(sel)})`;

  /* ── 1. The MVP still works with no account ── */
  ok(await page.eval(`return !!${$('#wrap-startDate')}`), 'the log form renders');
  ok(await page.eval(`return ${$('#view-log .note')}.textContent.includes('stays on this device')`),
    'the privacy line is still above the form');

  await page.eval(`
    document.querySelector('#f-startDate').value = '2026-09-10';
    document.querySelector('input[name="symptoms"][value="Fever"]').checked = true;
    const pos = document.querySelector('input[name="testResult"][value="positive"]');
    pos.click(); pos.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#f-testType').value = 'RDT';
    document.querySelector('#episode-form').requestSubmit();
    return true;
  `);
  await wait(200);
  ok(await page.eval(`return document.querySelectorAll('.event').length === 1`), 'an episode saves without an account');
  ok(await page.eval(`return ${$('.tag')}.textContent === 'Positive'`), 'the timeline badge shows the result');

  await page.eval(`document.querySelector('.event-actions .quick').click(); return true;`);
  await wait(150);
  ok(await page.eval(`return !document.querySelector('.event-actions')`), '"Mark as recovered" still works offline of an account');

  ok(await page.eval(`
    document.querySelector('.tab[data-view="trends"]').click();
    await new Promise(r => setTimeout(r, 120));
    return document.querySelectorAll('#trends-body svg.chart').length >= 1;
  `), 'trends still render');
  ok(await page.eval(`
    document.querySelector('.tab[data-view="summary"]').click();
    await new Promise(r => setTimeout(r, 120));
    return document.querySelector('#summary-text').textContent.includes('does not recommend any medication');
  `), 'the doctor summary still carries its disclaimer');

  /* ── 2. Sign up, then migrate this device's record ── */
  ok(await page.eval(`
    document.querySelector('.tab[data-view="account"]').click();
    await new Promise(r => setTimeout(r, 150));
    return !!document.querySelector('#auth-form');
  `), 'the account tab offers a sign-in form');

  await page.eval(`
    document.querySelector('input[name="authmode"][value="signup"]').click();
    document.querySelector('input[name="authmode"][value="signup"]').dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `);
  ok(await page.eval(`return !${$('#wrap-authname')}.hidden`), 'creating an account asks for a name');

  await page.eval(`
    document.querySelector('#auth-name').value = 'Elijah';
    document.querySelector('#auth-email').value = 'first@user.test';
    document.querySelector('#auth-password').value = 'a-good-password';
    document.querySelector('#auth-form').requestSubmit();
    return true;
  `);
  await wait(900);

  ok(await page.eval(`return !!${$('#do-migrate')}`), "signing up offers to import this device's records");
  ok(await page.eval(`return ${$('.migrate-facts')}.textContent.includes('1 episode')`), 'the prompt states what will be imported');
  ok(await page.eval(`return JSON.parse(localStorage.getItem('fitnesskinda.record.v1')).entries.length === 1`),
    'nothing is uploaded before the user agrees');

  await page.eval(`document.querySelector('#do-migrate').click(); return true;`);
  await wait(900);

  ok(await page.eval(`return !!${$('.quick-grid')}`), 'a successful import lands on the dashboard');
  ok(await page.eval(`return !!localStorage.getItem('fitnesskinda.premigration.v1')`), 'a pre-migration backup is kept on the device');
  ok(await page.eval(`return JSON.parse(localStorage.getItem('fitnesskinda.record.v1')).entries.length === 1`),
    'the device still holds the record after migrating');

  const server_count = await page.eval(`
    const r = await fetch('/api/episodes', { credentials: 'same-origin' });
    return (await r.json()).episodes.length;
  `);
  ok(server_count === 1, 'the account now holds the episode');

  /* ── 3. Dashboard (Phase 7) ── */
  const dash = await page.eval(`return document.querySelector('#account-body').textContent`);
  ['Episodes logged', 'Confirmed positive', 'Avg days between', 'Days since last recovery',
   'Quick actions', 'Recent activity', 'Patterns'].forEach((label) =>
    ok(dash.includes(label), `dashboard shows "${label}"`));
  ok(dash.includes('saved to your account'), 'dashboard states the sync position');
  ok(await page.eval(`
    document.querySelector('[data-goto="timeline"]').click();
    await new Promise(r => setTimeout(r, 120));
    return !document.querySelector('#view-timeline').hidden;
  `), 'a quick action navigates');

  /* ── 4. Writing while signed in reaches the server ── */
  await page.eval(`
    document.querySelector('.tab[data-view="log"]').click();
    await new Promise(r => setTimeout(r, 100));
    document.querySelector('#f-startDate').value = '2026-06-01';
    document.querySelector('#episode-form').requestSubmit();
    return true;
  `);
  await wait(900);
  ok(await page.eval(`
    const r = await fetch('/api/episodes', { credentials: 'same-origin' });
    return (await r.json()).episodes.length;
  `) === 2, 'a new episode syncs to the account');

  /* ── 5. Offline (Phase 10) ── */
  await page.setOffline(true);
  await page.eval(`
    document.querySelector('.tab[data-view="log"]').click();
    await new Promise(r => setTimeout(r, 100));
    document.querySelector('#f-startDate').value = '2026-07-15';
    document.querySelector('#episode-form').requestSubmit();
    return true;
  `);
  await wait(700);
  ok(await page.eval(`return document.querySelectorAll('.event').length === 3`), 'logging still works offline');
  ok(await page.eval(`return JSON.parse(localStorage.getItem('fitnesskinda.queue.v1') || '[]').length >= 1`),
    'the offline write is queued');
  ok(await page.eval(`return !!document.querySelector('.pending')`), 'the card says it is not yet in the account');

  await page.setOffline(false);
  await page.eval(`window.dispatchEvent(new Event('online')); return true;`);
  await wait(1200);
  ok(await page.eval(`return JSON.parse(localStorage.getItem('fitnesskinda.queue.v1') || '[]').length === 0`),
    'the queue drains when the connection returns');
  const drained = await page.eval(`
    const acc = await import('/js/account.js');
    const store = await import('/js/store.js');
    const r = await fetch('/api/episodes', { credentials: 'same-origin' });
    const episodes = (await r.json()).episodes;
    return { server: episodes.length, serverIds: episodes.map(e => e.id),
             localIds: store.all().map(e => e.id), lastError: acc.state.lastError,
             queue: localStorage.getItem('fitnesskinda.queue.v1') };
  `);
  if (drained.server !== 3) console.error('  diagnostics:', JSON.stringify(drained));
  ok(drained.server === 3, 'the queued episode reaches the account');

  /* ── 6. Reload keeps the session and the record ── */
  await page.reload();
  await wait(900);
  ok(await page.eval(`
    document.querySelector('.tab[data-view="account"]').click();
    await new Promise(r => setTimeout(r, 400));
    return document.querySelector('#account-body').textContent.includes('first@user.test');
  `), 'the session survives a reload');
  ok(await page.eval(`return document.querySelectorAll('#view-timeline .event, .recent li').length > 0`),
    'the record is there after a reload');

  /* ── 7. Sign out leaves the device copy alone ── */
  await page.eval(`document.querySelector('#sign-out').click(); return true;`);
  await wait(700);
  ok(await page.eval(`return JSON.parse(localStorage.getItem('fitnesskinda.record.v1')).entries.length === 3`),
    'signing out does not delete the device copy');
  ok(await page.eval(`return !!document.querySelector('#auth-form')`), 'signing out returns to the sign-in form');

  /* ── 8. Viewports ── */
  for (const [w, h, name] of [[390, 700, 'mobile 390×700'], [768, 1024, 'tablet 768'], [1280, 900, 'desktop 1280']]) {
    await page.setViewport(w, h, w < 700);
    await page.eval(`document.querySelector('.tab[data-view="log"]').click(); return true;`);
    await wait(200);
    const layout = await page.eval(`
      const doc = document.documentElement;
      const save = document.querySelector('#save-btn').getBoundingClientRect();
      const bar = document.querySelector('.tabbar').getBoundingClientRect();
      window.scrollTo(0, 320);
      await new Promise(r => setTimeout(r, 60));
      const scrolled = document.querySelector('#save-btn').getBoundingClientRect();
      return {
        hScroll: doc.scrollWidth > doc.clientWidth + 1,
        saveClear: scrolled.bottom <= bar.top + 1,
        tabs: document.querySelectorAll('.tab').length,
        tabWidth: Math.round(document.querySelector('.tab').getBoundingClientRect().width)
      };
    `);
    ok(!layout.hScroll, `${name}: no horizontal scrolling`);
    ok(layout.saveClear, `${name}: Save clears the tab bar while scrolled`);
    ok(layout.tabs === 5 && layout.tabWidth >= 48, `${name}: five tabs fit (${layout.tabWidth}px each)`);
  }

  /* ── 9. Stored XSS, CSP, and what the service worker keeps ── */
  await page.eval(`
    await fetch('/api/auth/login', { method:'POST', credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email:'first@user.test', password:'a-good-password' }) });
    await fetch('/api/episodes', { method:'POST', credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ startDate:'2026-02-02', data:{ notes:'<img src=x onerror="window.__pwned=1">',
        treatment:'<script>window.__pwned=1<\\/script>' } }) });
    return true;
  `);
  await page.reload();
  await wait(1200);
  const xss = await page.eval(`
    document.querySelector('.tab[data-view="timeline"]').click();
    await new Promise(r => setTimeout(r, 200));
    document.querySelectorAll('.event-more summary').forEach(s => s.click());
    await new Promise(r => setTimeout(r, 150));
    return {
      pwned: !!window.__pwned,
      injectedNodes: document.querySelectorAll('#timeline img, #timeline script').length,
      textShown: document.body.textContent.includes('<img src=x')
    };
  `);
  ok(!xss.pwned, 'a stored script payload does not execute');
  ok(xss.injectedNodes === 0, 'a stored script payload creates no elements');
  ok(xss.textShown, 'it is shown as text instead');

  const csp = await page.eval(`
    window.__inline = 0;
    const s = document.createElement('script');
    s.textContent = 'window.__inline = 1';
    document.body.appendChild(s);
    await new Promise(r => setTimeout(r, 100));
    return window.__inline;
  `);
  ok(csp === 0, 'the Content-Security-Policy blocks an injected inline script');

  const cached = await page.eval(`
    const names = await caches.keys();
    const out = [];
    for (const n of names) {
      const keys = await (await caches.open(n)).keys();
      out.push(...keys.map(k => new URL(k.url).pathname));
    }
    return out;
  `);
  ok(cached.length > 0, 'the app shell is cached for offline use');
  ok(!cached.some((p) => p.startsWith('/api/')), 'no API response is stored in the cache');

  /* ── 10. Admin page refuses a normal account ── */
  await page.setViewport(390, 700);
  await page.goto(`${server.origin}/admin`);
  await wait(600);
  ok(await page.eval(`return document.body.textContent.includes('Sign in with an admin account')
     || document.body.textContent.includes('does not have admin access')`),
    'the admin page refuses anyone without admin access');

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
