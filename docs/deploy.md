# Deploying fitnesskinda.fit

Host: **Vercel**. Database: **Turso** (hosted libSQL — SQLite over HTTP).
Config lives in `vercel.json`. Domain: Namecheap.

Vercel is serverless, so there is no disk to keep a database file on. That is the only
reason the data lives in Turso rather than in a local SQLite file — the SQL, the schema
and the migrations are unchanged, and running locally still uses a plain file.

---

## Environment

| Variable | Where | Value |
|---|---|---|
| `TURSO_DATABASE_URL` | Vercel | `libsql://…` from Turso |
| `TURSO_AUTH_TOKEN` | Vercel | a Turso token — **secret** |
| `ALLOWED_ORIGINS` | Vercel | `https://fitnesskinda.fit` |
| `ADMIN_EMAILS` | Vercel | who may open `/admin` |
| `ACCESS_LOG` | Vercel | `1` to log method, route and status |
| `NODE_ENV` | — | Vercel sets `production` itself, which marks the cookie `Secure` |

Locally, leave `TURSO_DATABASE_URL` unset and the app uses `data/fitnesskinda.db`.

## 1. The database

```sh
brew install tursodatabase/tap/turso
turso auth signup

turso db create fitnesskinda --location <near-your-vercel-region>
turso db show fitnesskinda --url                # → TURSO_DATABASE_URL
turso db tokens create fitnesskinda             # → TURSO_AUTH_TOKEN
```

**Put the database in the same region as the function.** Every request makes several
database round trips, so a function in one continent talking to a database in another is
slow for no reason.

On the Hobby plan the function region is whatever Vercel picks (commonly `iad1`,
Washington) and is not set in `vercel.json` — region pinning there is a Pro feature. Check
the actual region on the deployment page under **Functions**, then create the Turso
database near it: `iad1` → `--location iad`, `fra1` → `--location fra`, `lhr1` → `--location lhr`.

The schema is created automatically on the first request after a deploy — migrations run
inside `openDatabase()`. There is no separate migration step.

## 2. Vercel

1. Vercel → **Add New** → **Project** → import `elijahsnoz/FitnessKinda`.
2. Framework preset: **Other**. No build command, no output directory — the frontend is
   served as static files exactly as it sits in the repo.
3. Add the environment variables from the table above, for **Production** (and Preview if
   you want previews to work — point them at a *separate* Turso database, never the real one).
4. Deploy, then check:

```sh
curl https://<your-deployment>.vercel.app/api/health
# {"status":"ok","database":"ok","time":"..."}
```

If `database` says `error`, the Turso URL or token is wrong. That is the usual first failure.

## 3. Domain

1. Vercel → the project → **Settings** → **Domains** → add `fitnesskinda.fit` and
   `www.fitnesskinda.fit`.
2. Vercel displays **the exact DNS records to create**. Use those values.
3. Namecheap → Domain List → fitnesskinda.fit → **Advanced DNS**:
   - Apex (`@`): the `A` record Vercel gives you.
   - `www`: `CNAME` → the target Vercel gives you.
   - **Delete Namecheap's parking record** (pointing at `162.255.119.32`) and any URL
     redirect record, or they will fight the new ones.
4. TLS is issued automatically once DNS resolves.

If you serve the site from `www` as well as the apex, add both to `ALLOWED_ORIGINS`,
comma-separated — otherwise writes from the other one are refused with 403.

## 4. Routine deploys

Pushing to `main` deploys.

```sh
git push
```

**Bump `CACHE` in `sw.js` whenever a shell file changes** — `index.html`, `styles.css`,
anything under `js/`, `admin.html`. Skip it and returning visitors keep the old app
indefinitely, because the service worker serves its cached copy first. This is the most
likely reason a deploy appears to do nothing.

## Backups

```sh
TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run backup
# → backups/fitnesskinda-YYYY-MM-DD.json
```

Dumps every table to JSON. Keeps the last 14 dated files. **The dump contains password
hashes and session tokens — treat the file as sensitive.** `backups/` is gitignored.

Restore into an empty database:

```sh
TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… node scripts/restore.mjs backups/fitnesskinda-2026-09-20.json
```

It refuses to run against a database that already has users unless you pass `--force`, so
a restore cannot quietly overwrite a live record.

Turso also keeps its own point-in-time history; check the retention on your plan. And the
user's own copy remains the best safety net for a single person: the app works offline
from localStorage, and the Summary tab exports JSON.

## Admin

`/admin` is granted by `ADMIN_EMAILS`, never from inside the app. The role is applied at
sign-up and re-checked at every login. Change the variable in Vercel → Settings →
Environment Variables, redeploy, then sign in with that address.

## Local development

```sh
npm install
npm run dev            # http://localhost:3000, data in ./data
npm test               # 131 checks
npm run test:browser   # 51 checks, needs Chrome
```

`server/start.js` runs the same request handler that `api/[...path].js` hands to Vercel,
so local and production are the same code with a different entry point.

## When something is wrong

| Symptom | Cause |
|---|---|
| `/api/health` says `database: error` | `TURSO_DATABASE_URL` or `TURSO_AUTH_TOKEN` wrong or missing |
| Writes fail with 403 | `ALLOWED_ORIGINS` does not match the address in the browser (`www` vs apex) |
| Signed out constantly | Cookies are `Secure` in production — the site must be on HTTPS |
| Old version after deploy | `CACHE` in `sw.js` was not bumped |
| Everything is slow | The Turso location and the Vercel function region are not the same |
| Build fails mentioning regions | `regions` in `vercel.json` is a Pro feature; it is not set for that reason |
| First request after idle is slow | Serverless cold start plus the first database connection |
| `/admin` refuses you | The signed-in email is not in `ADMIN_EMAILS` |
| Preview deploys mutate real data | Preview env points at the production database — give it its own |

Logs: Vercel → the project → **Logs**. They carry method, route pattern and status only —
never request bodies, symptoms, notes or email addresses.

## Not covered yet

- Backups are manual. Nothing runs them on a schedule.
- No staging environment. `main` deploys straight to the site people use.
- No password reset, so a lost password means a lost account.
- The dump file contains password hashes; there is no encryption around it.

These are prototype limits, not oversights. Fix them when there is more than one user.
