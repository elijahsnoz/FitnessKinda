/* Choosing a new password from an emailed link. */

import { api } from './api.js';

const $ = (sel) => document.querySelector(sel);
const body = $('#reset-body');
const token = new URL(location.href).searchParams.get('token');

const SORRY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v6M12 16.5v.5"></path><circle cx="12" cy="12" r="9"></circle></svg>';
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"></path></svg>';

const outcome = ({ mark, tone = '', title, line, action = 'Open FitnessKinda' }) => {
  body.className = 'outcome';
  body.innerHTML = `<div class="outcome-mark ${tone}">${mark}</div><h1>${title}</h1><p>${line}</p>
    <a class="btn primary" href="/">${action}</a>`;
  document.title = title;
};

if (!token) {
  outcome({
    mark: SORRY, tone: 'is-sorry',
    title: 'That link is incomplete.',
    line: 'Open the link from your email again, or ask for a new one from the sign-in screen.'
  });
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-reveal]');
  if (!button) return;
  const input = $(`#${button.dataset.reveal}`);
  const showing = button.getAttribute('aria-pressed') === 'true';
  input.type = showing ? 'password' : 'text';
  button.setAttribute('aria-pressed', String(!showing));
  button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  input.focus();
});

document.addEventListener('input', () => {
  const hint = $('#reset-hint');
  if (!hint) return;
  const again = $('#reset-confirm').value;
  hint.classList.remove('is-match', 'is-mismatch');
  if (!again) {
    hint.textContent = 'Your records are not touched by this.';
  } else if ($('#reset-password').value === again) {
    hint.textContent = 'They match.';
    hint.classList.add('is-match');
  } else {
    hint.textContent = 'These do not match yet.';
    hint.classList.add('is-mismatch');
  }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id !== 'reset-form') return;
  event.preventDefault();

  const password = $('#reset-password').value;
  const again = $('#reset-confirm').value;
  const error = $('#reset-error');
  const button = $('#reset-submit');
  error.hidden = true;

  if (password.length < 8) {
    error.textContent = 'Use a password of at least 8 characters.';
    error.hidden = false;
    return;
  }
  if (password !== again) {
    error.textContent = 'Those two passwords are not the same.';
    error.hidden = false;
    $('#reset-confirm').focus();
    return;
  }

  button.disabled = true;
  button.textContent = 'Setting it…';
  try {
    await api.resetPassword(token, password);
    outcome({
      mark: TICK,
      title: 'Your password is set.',
      line: 'You are signed in, and any other session on your account has been ended.'
    });
  } catch (err) {
    error.textContent = err.message || 'That did not work. Ask for a new link.';
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Set my new password';
  }
});
