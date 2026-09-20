/* The page an email link lands on. Reads the token from the URL, hands it to the
 * API once, and says plainly what happened. */

import { api } from './api.js';

const body = document.getElementById('verify-body');
const token = new URL(location.href).searchParams.get('token');

const show = (title, line, action = '') => {
  body.innerHTML = `<p class="empty-title">${title}</p><p class="hint">${line}</p>${action}`;
};

const backToApp = '<div class="actions" style="justify-content:center;margin-top:20px">' +
  '<a class="btn primary" href="/" style="flex:0 0 auto">Open FitnessKinda</a></div>';

if (!token) {
  show('That link is incomplete.', 'Ask for a new one from your profile.', backToApp);
} else {
  api
    .verifyEmail(token)
    .then(() => show('Your email is confirmed.', 'Thanks. That is all it needed.', backToApp))
    .catch((err) =>
      show('That link did not work.', err.message || 'Ask for a new one from your profile.', backToApp)
    );
}
