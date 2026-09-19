# Deploying fitnesskinda.fit

One machine, one volume, SQLite on disk. Host: Fly.io. Config lives in `fly.toml`.

Health records are on that volume. **Read the Backups section before you need it.**

---

## Prerequisites

- `flyctl` installed (`brew install flyctl`)
- A Fly account with a payment method (the smallest machine plus a 1 GB volume is a
  few dollars a month; the app sleeps when idle)
- The domain at Namecheap, DNS managed there

## One-time setup

```sh
fly auth login                                  # opens a browser

fly apps create fitnesskinda --org personal
fly volumes create fk_data --region lhr --size 1 --yes

# Secrets are not in fly.toml, because this repo is public.
fly secrets set ADMIN_EMAILS=you@example.com

fly deploy --ha=false                           # one machine: only one can hold the volume
```

`--ha=false` matters. Fly creates two machines by default, and a second machine cannot
attach the same volume.

Check it before touching DNS:

```sh
fly status
curl https://fitnesskinda.fly.dev/api/health    # {"status":"ok","database":"ok",...}
```

## DNS

```sh
fly certs add fitnesskinda.fit
fly ips list                                    # note the v4 and v6 addresses
```

In Namecheap → Domain List → fitnesskinda.fit → **Advanced DNS**:

| Type | Host | Value |
|---|---|---|
| A | `@` | the IPv4 from `fly ips list` |
| AAAA | `@` | the IPv6 from `fly ips list` |

Delete the parking record Namecheap created (the one pointing at 162.255.119.32) or it
will fight the new one. Then:

```sh
fly certs check fitnesskinda.fit                # "Ready" once the certificate is issued
```

DNS usually settles in minutes; the certificate follows within a few more.

## Routine deploys

```sh
git push                    # the repo is the source of truth
fly deploy --ha=false
```

**Bump `CACHE` in `sw.js` whenever a shell file changes** — `index.html`, `styles.css`,
anything under `js/`, `admin.html`. Skip it and returning visitors keep the old app
indefinitely, because the service worker serves the cached copy first.

## Backups

Fly takes daily volume snapshots (5-day retention) automatically. That is a floor, not a
plan. For anything you would mind losing:

```sh
fly ssh console -C "npm run backup"             # consistent snapshot inside the machine
fly ssh sftp get /data/backups/fitnesskinda-$(date +%F).db ./
```

`npm run backup` uses `VACUUM INTO`, so it is safe while the app is running — a plain
copy of a live WAL database can be torn. It keeps the last 14 daily files.

**Restore:**

```sh
fly scale count 0                               # stop writes first
fly ssh sftp shell                              # put the file back as /data/fitnesskinda.db
fly scale count 1
```

Users also hold their own copy: every account keeps working offline from localStorage,
and the Summary tab exports JSON. That is the real safety net for a single user.

## Admin

`/admin` is granted by the `ADMIN_EMAILS` secret, never from inside the app. The role is
applied at sign-up and re-checked at every login, so:

```sh
fly secrets set ADMIN_EMAILS=you@example.com    # triggers a restart
```

then sign in with that address and open `https://fitnesskinda.fit/admin`.

## Rollback

```sh
fly releases                                    # find the previous version
fly deploy --image <image-ref-from-releases>
```

The volume is untouched by a rollback. Only the code goes back.

## When something is wrong

| Symptom | Cause |
|---|---|
| Writes fail with 403 | `ALLOWED_ORIGINS` in `fly.toml` does not match the address in the browser |
| Signed out constantly | Cookies are `Secure` in production — the site must be on HTTPS |
| First request is slow | The machine sleeps when idle; it wakes in a second or two |
| Old version after deploy | `CACHE` in `sw.js` was not bumped |
| Deploy fails on the volume | A second machine exists — `fly scale count 1` |
| `/admin` refuses you | The signed-in email is not in `ADMIN_EMAILS` |

Logs: `fly logs`. They carry method, route pattern and status only — never request
bodies, symptoms, notes or email addresses.

## Not covered yet

- No automated off-machine backup. The snapshot above is manual.
- No staging environment. Deploys go straight to the one people use.
- No password reset, so a lost password means a lost account.
- One machine in one region. A Fly region outage is an outage.

These are prototype limits, not oversights. Fix them when there is more than one user.
