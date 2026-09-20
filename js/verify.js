/* The page an email link lands on. Reads the token from the URL, hands it to the
 * API once, and says plainly what happened. One outcome, one action. */

import { api } from './api.js';

const body = document.getElementById('verify-body');
const token = new URL(location.href).searchParams.get('token');

const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"></path></svg>';
const SORRY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v6M12 16.5v.5"></path><circle cx="12" cy="12" r="9"></circle></svg>';

function show({ mark, tone = '', title, line, action = 'Open FitnessKinda' }) {
  body.innerHTML = `
    <div class="outcome-mark ${tone}">${mark}</div>
    <h1>${title}</h1>
    <p>${line}</p>
    <a class="btn primary" href="/">${action}</a>`;
  document.title = title;
}

if (!token) {
  show({
    mark: SORRY, tone: 'is-sorry',
    title: 'That link is incomplete.',
    line: 'Open the link from your email again, or ask for a new one from your profile.'
  });
} else {
  api
    .verifyEmail(token)
    .then(() =>
      show({
        mark: TICK,
        title: 'Your email is confirmed.',
        line: 'Thank you. That is all it needed, and your account can be recovered now if you ever lose your password.'
      })
    )
    .catch((err) =>
      show({
        mark: SORRY, tone: 'is-sorry',
        title: 'That link did not work.',
        line: err.message || 'Ask for a new one from your profile.'
      })
    );
}
