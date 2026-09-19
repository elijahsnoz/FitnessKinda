/* A very small Chrome DevTools Protocol client: enough to open a page, run code
 * inside it and set a device viewport. Node 22 ships a WebSocket, so this needs
 * no dependencies either. */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'fk-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 400);

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore' });

  // Wait for the debugging endpoint to answer.
  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {
      await sleep(150);
    }
  }
  if (!version) {
    chrome.kill('SIGKILL');
    throw new Error('Chrome did not start a debugging endpoint');
  }

  return {
    port,
    close() {
      chrome.kill('SIGKILL');
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  };
}

/** Opens a tab and returns a handle for evaluating code in it. */
export async function openPage(port, url) {
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  ).json();

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const waiting = new Map();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (waiting.has(id)) { waiting.delete(id); reject(new Error(`${method} timed out`)); }
      }, 30000);
    });

  await send('Page.enable');
  await send('Runtime.enable');

  const page = {
    send,
    /** Runs an async function body inside the page and returns its value. */
    async eval(code) {
      const result = await send('Runtime.evaluate', {
        expression: `(async () => { ${code} })()`,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || 'page threw');
      }
      return result.result.value;
    },
    async goto(target) {
      await send('Page.navigate', { url: target });
      await page.waitForLoad();
    },
    async reload() {
      await send('Page.reload', {});
      await page.waitForLoad();
    },
    async waitForLoad() {
      for (let i = 0; i < 80; i++) {
        try {
          const ready = await page.eval('return document.readyState');
          if (ready === 'complete') { await sleep(120); return; }
        } catch { /* navigating */ }
        await sleep(80);
      }
    },
    /** A real mobile viewport — not a cropped screenshot. */
    setViewport(width, height, mobile = true) {
      return send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile
      });
    },
    setOffline(offline) {
      return send('Network.emulateNetworkConditions', {
        offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1
      });
    },
    enableNetwork() { return send('Network.enable'); },
    clearStorage(origin) {
      return send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
    },
    close() { ws.close(); return fetch(`http://127.0.0.1:${port}/json/close/${target.id}`); }
  };

  await page.waitForLoad();
  return page;
}
