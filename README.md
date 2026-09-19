# FitnessKinda

**fitnesskinda.fit** — a personal health memory and pattern tracker.

The product answers one question: *what has been happening to my body over time?*
It records what you notice, lays it out on a timeline, shows the trends in your own
data, and produces a summary you can hand to a doctor.

It does **not** diagnose anything and does **not** recommend medication.

## Status

Prototype 2: full-stack. **Malaria episodes are the only signal implemented.** Sleep,
exercise, hydration, nutrition and exposure are designed for but deliberately not built
(see `js/registry.js`).

The app still works with no account and no server — that was the MVP and it is intact.
An account adds a durable copy in a database.

## Running it

Needs **Node 22.5+** (for the built-in SQLite driver). No npm dependencies.

```sh
cp .env.example .env     # optional for local work
npm start                # http://localhost:3000
npm run dev              # same, restarting on change
```

The database file is created on first run under `DATA_DIR` (default `./data`).

## Tests

```sh
npm test            # logic + API + security   (131 checks, no browser needed)
npm run test:browser   # end-to-end in headless Chrome (51 checks)
```

`npm test` runs three suites: the original MVP logic, the API, and a security suite
that tries to break ownership, leak health data into logs and forge sessions. The
browser suite drives a real Chrome over the DevTools Protocol and covers sign-up,
migration, the dashboard, offline queueing, stored-XSS, CSP, and three viewports
(390×700, 768, 1280). It needs Chrome installed; set `CHROME_PATH` if it is not in
the usual macOS location.

## Architecture

```
index.html          the four original views + the account tab
admin.html          aggregate metrics, admin only
styles.css          mobile-first, light + dark, no framework
sw.js               caches the app shell for offline use (never the API)
js/
  app.js            wiring: views, tabs, save/edit/delete, export/import
  store.js          the device's working copy — the entry envelope, in localStorage
  account.js        session, the write queue, and migration
  api.js            fetch wrapper for /api
  account-view.js   the account tab: sign in, migrate, dashboard
  admin.js          the admin page
  registry.js       the signal registry: which domains exist
  form.js           builds a form from a domain's field specs
  analytics.js      generic analysis over entries
  charts.js         SVG bar charts
  summary.js        the doctor summary (shared with the server)
  domains/
    malaria.js      everything malaria-specific — including its validation rules
server/
  start.js          entry point: version guard, then listen
  index.js          http server: static files + /api, security headers, CSRF
  routes.js         the API surface
  repo.js           data access, every statement scoped by userId
  auth.js           scrypt passwords, hashed session tokens, cookies, throttling
  validate.js       server-side validation — reuses js/domains/malaria.js
  metrics.js        admin aggregates (counts only)
  db.js             SQLite schema and migrations
  config.js         environment
tests/              logic, api, security, browser, cdp client, harness
```

### The entry envelope

One shape, client and server. Every signal FitnessKinda will ever track uses it and
differs only in `type` and `data`:

```js
{ id, type, startDate, endDate, data, context, tags, createdAt, updatedAt }
```

`data`, `context` and `tags` are JSON columns in SQLite. The database never learns
what a malaria episode is — that is what lets a new signal arrive without a migration
of existing rows.

### One set of rules

`js/domains/malaria.js` has no DOM dependency, so **the server imports it and runs the
same `validate()` the phone runs**. Requests are rebuilt through the domain's own
`fromValues()`, so unknown fields are dropped rather than trusted. `js/summary.js`
likewise takes an optional source, so the doctor summary has one implementation used
by both sides.

### How the frontend reaches the backend

```
app.js ──sync──> store.js (localStorage)          ← the UI never waits on a network
                    │
                    └──async──> account.js ──> api.js ──> /api/* ──> SQLite
```

The device stays the working copy. Writes land locally first, then a queue pushes them
up. Signed out, nothing subscribes and the behaviour is exactly the original MVP.

### Adding the next signal

Write `js/domains/<signal>.js` implementing the same interface `malaria.js` does, and
add it to `DOMAINS` in `js/registry.js`. The form, timeline, trends, summary, dashboard
and the server's validation all pick it up without further changes.

## Data and privacy

- Signed out: everything stays in `localStorage` under `fitnesskinda.record.v1`.
- Signed in: the record is also stored in SQLite, owned by that user id.
- The API is never cached by the service worker, and API responses are `no-store`.
- Logs record method, route pattern and status. No bodies, no symptoms, no emails.
- The admin dashboard is aggregate counts only. There is no endpoint that returns
  another person's health record.

### Migration from a device

`POST /api/migrate` imports a device's records in a single transaction. If any entry is
rejected, nothing is imported and the device copy remains the only source of truth. The
app writes a `fitnesskinda.premigration.v1` backup before sending, and never deletes
local data — including on sign-out.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | — | liveness |
| POST | `/api/auth/signup` | — | create an account |
| POST | `/api/auth/login` | — | start a session |
| POST | `/api/auth/logout` | — | end a session |
| GET | `/api/auth/me` | — | current user or `null` |
| GET | `/api/episodes` | yes | this user's episodes |
| POST | `/api/episodes` | yes | create |
| GET | `/api/episodes/:id` | yes | read one |
| PATCH | `/api/episodes/:id` | yes | update |
| DELETE | `/api/episodes/:id` | yes | delete |
| GET | `/api/summary` | yes | doctor summary as text |
| POST | `/api/migrate` | yes | import a device's records |
| GET | `/api/admin/metrics` | admin | aggregate counters |

## Database

SQLite, via `node:sqlite`. Tables: `users`, `health_entries`, `sessions`, `error_log`,
`schema_migrations`. Foreign keys on, WAL journal.

Migrations are an append-only list in `server/db.js`. They run automatically at start-up
inside a transaction and are recorded in `schema_migrations`. To change the schema, add
a new `{ id, sql }` entry — never edit an applied one.

Back up by copying the SQLite file (stop the process first, or use `sqlite3 .backup`).

## Deployment

Any host that runs Node 22 with a persistent disk: Fly.io, Render, Railway, a VPS.
Serverless platforms will not work as-is, because SQLite needs a real filesystem.

1. Set the environment (see `.env.example`): `NODE_ENV=production`, `DATA_DIR` pointing
   at the mounted volume, `ALLOWED_ORIGINS=https://fitnesskinda.fit`, and `ADMIN_EMAILS`
   for whoever may open `/admin`.
2. Terminate TLS in front of the app. `NODE_ENV=production` marks the session cookie
   `Secure`, so the app will not work over plain HTTP in that mode.
3. Mount a volume at `DATA_DIR` and deploy. The schema is created on first start.
4. Point `fitnesskinda.fit` at the host.

A `Dockerfile` is included: it runs as a non-root user and expects a volume at `/data`.

```sh
docker build -t fitnesskinda .
docker run -p 3000:3000 -v fk-data:/data --env-file .env fitnesskinda
```

### Service worker versioning

`sw.js` caches the app shell. **Bump `CACHE` in `sw.js` whenever any shell file
changes**, or returning visitors keep the old version. The API is never cached.

## Boundaries

Insights are descriptive only: counts, averages, gaps and timing computed from what the
user entered. No inference about cause, no diagnosis, no medication guidance. The
disclaimer on the Trends view and in the exported summary states this to the user and to
any doctor reading it. Keep it that way.
