/* A very small test harness. No dependencies, same as the rest of the project. */

export function suite(name) {
  const results = { name, passed: 0, failed: 0, failures: [] };

  const ok = (condition, message) => {
    if (condition) {
      results.passed += 1;
      if (process.env.VERBOSE === '1') console.log(`  ok   ${message}`);
    } else {
      results.failed += 1;
      results.failures.push(message);
      console.error(`  FAIL ${message}`);
    }
    return !!condition;
  };

  const throws = async (fn, message) => {
    try {
      await fn();
      return ok(false, message + ' (no error thrown)');
    } catch {
      return ok(true, message);
    }
  };

  return { ok, throws, results };
}

/** Browser-free localStorage, so the client modules run under Node. */
export function fakeLocalStorage() {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear()
  };
  return globalThis.localStorage;
}

/** Boots the API on an ephemeral port with a throwaway in-memory database. */
export async function startTestServer() {
  const { openDatabase, closeDatabase } = await import('../server/db.js');
  const { createApp } = await import('../server/index.js');
  const { resetAllThrottles } = await import('../server/auth.js');

  closeDatabase();
  await openDatabase(':memory:');
  resetAllThrottles();

  const server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    stop: () => new Promise((resolve) => server.close(resolve)),
    /** A client with its own cookie jar — one per simulated person. */
    client() {
      let cookie = '';
      return {
        get cookie() { return cookie; },
        set cookie(v) { cookie = v; },
        async request(method, path, body, extra = {}) {
          const headers = { Origin: origin, ...extra.headers };
          if (body !== undefined) headers['Content-Type'] = 'application/json';
          if (cookie && extra.headers?.Cookie === undefined) headers.Cookie = cookie;

          const res = await fetch(origin + path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
          });
          const setCookie = res.headers.get('set-cookie');
          if (setCookie) cookie = setCookie.split(';')[0];

          const text = await res.text();
          let json = null;
          try { json = JSON.parse(text); } catch { /* not json */ }
          return { status: res.status, body: json, text, headers: res.headers };
        },
        get(p, extra) { return this.request('GET', p, undefined, extra); },
        post(p, b, extra) { return this.request('POST', p, b ?? {}, extra); },
        patch(p, b, extra) { return this.request('PATCH', p, b ?? {}, extra); },
        del(p, extra) { return this.request('DELETE', p, undefined, extra); }
      };
    }
  };
}
