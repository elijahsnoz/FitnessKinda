/* Sending email.
 *
 * Resend, over plain HTTPS — no SDK. With no RESEND_API_KEY the sender becomes a
 * no-op that logs the link instead, so local development and the test suite work
 * without an account and without ever sending a real message.
 *
 * Nothing here puts health information in an email. The only content is the
 * person's name and a link.
 */

import { config } from './config.js';

const ENDPOINT = 'https://api.resend.com/emails';

export const canSend = () => Boolean(config.email.apiKey && config.email.from);

async function send({ to, subject, text, html }) {
  if (!canSend()) {
    // Developer convenience only; never reached in production.
    console.log(`[email] not configured, would have sent: ${subject}`);
    console.log(`[email] ${text.split('\n').find((l) => l.startsWith('http')) || ''}`);
    return { sent: false, reason: 'not-configured' };
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.email.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: config.email.from, to: [to], subject, text, html })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // The status and nothing else: a body could echo the address back into the log.
    console.error(`[email] send failed with ${response.status}`);
    throw new Error(`Email could not be sent (${response.status})${detail ? '' : ''}`);
  }
  return { sent: true };
}

const shell = (heading, body, action, url) => `<!doctype html>
<html><body style="margin:0;padding:32px;background:#F7F8F5;font-family:ui-sans-serif,system-ui,sans-serif;color:#263330">
  <div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #E4E7E0;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-size:15px;font-weight:600;letter-spacing:-.02em">Fitness<span style="color:#2F8F83">Kinda</span></p>
    <h1 style="margin:0 0 12px;font-size:21px;font-weight:600;letter-spacing:-.02em">${heading}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#5A6B66">${body}</p>
    <a href="${url}" style="display:inline-block;padding:13px 22px;background:#2F8F83;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px">${action}</a>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#8A9995">If the button does not work, paste this into your browser:<br>${url}</p>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#8A9995">If you did not ask for this, ignore it. Nothing changes.</p>
  </div>
</body></html>`;

export function sendVerification({ to, name, url }) {
  const hello = name ? `Hi ${name},` : 'Hi,';
  return send({
    to,
    subject: 'Confirm your email for FitnessKinda',
    text: `${hello}\n\nConfirm this address so your FitnessKinda account can be recovered if you ever lose your password.\n\n${url}\n\nThe link works for 48 hours. If you did not ask for this, ignore it.\n`,
    html: shell(
      'Confirm your email',
      `${hello} confirm this address so your account can be recovered if you ever lose your password. The link works for 48 hours.`,
      'Confirm my email',
      url
    )
  });
}
