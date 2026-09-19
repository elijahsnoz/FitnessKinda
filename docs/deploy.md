# Deploying fitnesskinda.fit

Host: **Render** — one web service, one persistent disk, SQLite on that disk.
Config lives in `render.yaml`. Domain: Namecheap.

Health records live on that disk. **Read Backups before you need it.**

---

## The one constraint that matters

Render's filesystem is **ephemeral without a disk**. On a free instance the database is
wiped on every deploy, every restart and every idle spin-down — silently, with no error.

A disk requires a paid instance. `render.yaml` sets `plan: starter` for that reason.
Roughly $7/month for the instance plus about $0.25/GB/month for the disk. **Do not
downgrade the plan to free.** If cost is the problem, the alternative is moving the data
layer to a hosted Postgres — a real code change, not a setting.

Two more consequences of having a disk, both expected:

- Deploys are not zero-downtime. Render stops the old instance before starting the new
  one, so there are a few seconds of downtime on each deploy.
- The service cannot run more than one instance.

## First deploy

The blueprint in `render.yaml` describes everything except the secret.

1. Render dashboard → **New** → **Blueprint** → connect `elijahsnoz/FitnessKinda`,
   branch `main`. Render reads `render.yaml` and proposes the service and the disk.
2. When it asks for `ADMIN_EMAILS` (marked `sync: false`), enter the address that should
   be able to open `/admin`. It is not in the repo because the repo is public.
3. Apply. The first build takes a couple of minutes.
4. Check it before touching DNS:

```sh
curl https://fitnesskinda.onrender.com/api/health
# {"status":"ok","database":"ok","time":"..."}
```

If that returns ok, the app and the disk are both working.

## Domain

1. Render → the service → **Settings** → **Custom Domains** → add `fitnesskinda.fit`
   and `www.fitnesskinda.fit`.
2. Render then shows **the exact DNS records to create**. Use those values — the apex
   target is Render's and it is the one they display for your service, not a value to
   copy from anywhere else.
3. Namecheap → Domain List → fitnesskinda.fit → **Advanced DNS**:
   - Apex (`@`): the A or ALIAS record Render gives you. Namecheap supports `ALIAS
     Record`, which is the better choice if Render offers an ALIAS/ANAME target, because
     it survives an IP change.
   - `www`: `CNAME` → the `onrender.com` hostname Render shows.
   - **Delete Namecheap's parking record** (the one pointing at `162.255.119.32`) and any
     URL-redirect record, or they will fight the new ones.
4. Back in Render, the domain shows **Verified** once DNS propagates, and the TLS
   certificate is issued automatically a few minutes later.

`ALLOWED_ORIGINS` in `render.yaml` is already `https://fitnesskinda.fit`. If you serve
the site from `www` as well, add it there, comma-separated, or writes from `www` will be
refused with 403.

## Routine deploys

`autoDeploy: true`, so pushing to `main` deploys.

```sh
git push
```

**Bump `CACHE` in `sw.js` whenever a shell file changes** — `index.html`, `styles.css`,
anything under `js/`, `admin.html`. Skip it and returning visitors keep the old app
indefinitely, because the service worker serves its cached copy first. This is the most
likely reason a deploy "did nothing".

## Backups

Three layers, in the order you will actually rely on them:

**1. The user's own export.** Summary tab → Export backup writes a JSON file the person
keeps. Every account also keeps a full copy in the browser and works offline from it.
For a single user this is the real safety net, and it needs no infrastructure.

**2. Render disk snapshots.** Render snapshots disks automatically. Check the retention
on your plan in the dashboard — do not assume it is long.

**3. A consistent file snapshot, before anything risky.** Render → the service → **Shell**:

```sh
npm run backup
# backup written: /var/data/backups/fitnesskinda-YYYY-MM-DD.db
```

This uses `VACUUM INTO`, so it is safe while the app is running — a plain copy of a live
WAL database can be torn. It keeps the last 14 daily files.

Note the honest limit: that snapshot is on the **same disk** as the original. It protects
against a bad migration or a logical mistake, not against losing the disk. Getting a file
off a Render instance is awkward, so off-machine backup is not solved here — layer 1 is.

## Admin

`/admin` is granted by the `ADMIN_EMAILS` environment variable, never from inside the
app. The role is applied at sign-up and re-checked at every login. Change it in Render →
**Environment**, which restarts the service, then sign in with that address.

## Rollback

Render → **Events** → pick the previous successful deploy → **Rollback**. The disk is
untouched; only the code goes back.

## When something is wrong

| Symptom | Cause |
|---|---|
| Records vanished after a deploy | The service is on a free plan with no disk |
| Writes fail with 403 | `ALLOWED_ORIGINS` does not match the address in the browser (`www` vs apex) |
| Signed out constantly | Cookies are `Secure` in production — the site must be on HTTPS |
| Old version after deploy | `CACHE` in `sw.js` was not bumped |
| Build fails on Node version | `NODE_VERSION` must be 22.5 or newer; `node:sqlite` does not exist before that |
| `/admin` refuses you | The signed-in email is not in `ADMIN_EMAILS` |
| First request slow | Expected on Starter after idle; it is not a cold start from zero |

Logs: Render → **Logs**. They carry method, route pattern and status only — never request
bodies, symptoms, notes or email addresses.

## Not covered yet

- No automated off-machine backup (see Backups, layer 3).
- No staging environment. `main` deploys straight to the site people use.
- No password reset, so a lost password means a lost account.
- One instance in one region. A region outage is an outage.
- Brief downtime on every deploy, because the service has a disk.

These are prototype limits, not oversights. Fix them when there is more than one user.
