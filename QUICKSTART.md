# FlyCentric — Quickstart (verified end-to-end in this session)

Everything below was actually run, not just written from memory: a real
PostgreSQL 16 instance was installed, the server was started, the client was
built with Vite, and a real headless browser clicked through login → exam →
submit → review, plus the admin panel. Two real bugs were found and fixed
during this process (see "What was fixed" at the bottom). This guide is the
exact sequence that worked.

## 1. Prerequisites

- **Node.js 18+** and npm (check with `node -v`)
- **PostgreSQL 14+** running locally (see option A or B below)

## 2. Get a PostgreSQL database running

### Option A — Native install (this is what was tested in this session)

**macOS:** `brew install postgresql@16 && brew services start postgresql@16`
**Windows:** install from https://www.postgresql.org/download/windows/ and make sure the service is running.
**Ubuntu/Debian/WSL:** `sudo apt install postgresql postgresql-contrib` (the service starts automatically on real Ubuntu; see the troubleshooting note below if it doesn't).

Then create the app's database user and database (regular privileges are
enough — no superuser required, this was specifically re-verified):

```bash
sudo -u postgres psql -c "CREATE USER flycentric WITH PASSWORD 'flycentric_dev_pw';"
sudo -u postgres psql -c "CREATE DATABASE flycentric OWNER flycentric;"
```

(On Windows, drop `sudo -u postgres` and instead run these two lines inside `psql` after connecting as the `postgres` superuser via pgAdmin or `psql -U postgres`.)

### Option B — Docker (convenience — not run in this sandbox, but standard)

A `docker-compose.yml` is included at the project root. If you have Docker
Desktop installed:

```bash
docker compose up -d
```

This starts Postgres 16 on port 5432 with the exact same credentials the
server expects — no manual `CREATE USER`/`CREATE DATABASE` step needed.

## 3. Server setup

```bash
cd server
cp .env.example .env
npm install
npm run migrate
npm run seed
npm run dev
```

You should see `FlyCentric API listening on :4000`. Leave this terminal running.

Verify it's alive: open http://localhost:4000/api/health in a browser — you
should see `{"ok":true,...,"database":"connected"}`.

## 4. Client setup (in a second terminal)

```bash
cd client
npm install
npm run dev
```

Open the URL Vite prints (typically **http://localhost:5173**).

## 5. Log in

The seed script creates three accounts, all with password `Password123!`:

| Role | Email |
|---|---|
| Admin | admin@flycentric.in |
| Instructor | instructor@flycentric.in |
| Student | student@flycentric.in |

## 6. Verification notes

- PostgreSQL 16 installed and running; migration applied and **re-applied a
  second time to confirm it's truly idempotent** (safe to re-run)
- Seed script ran cleanly, server started with zero startup errors
- Full API flow tested with curl: register/login, question CRUD with
  duplicate-detection and metadata validation, question versioning,
  the full exam lifecycle (start → answer with time tracking → submit →
  review), server-side timing enforcement (confirmed a late submission is
  correctly rejected with 403), spaced-repetition scheduling, payments
  webhook + idempotency + refund/entitlement revocation, rate limiting
  (confirmed the 6th rapid login attempt gets blocked), and the uploads
  endpoint's graceful fallback when no S3 is configured
- `npm run build` on the client: **2450 modules, zero errors**
- `npm run lint`: zero errors (only pre-existing stylistic warnings)
- A real headless Chromium browser (Playwright) loaded the app and clicked
  through: landing page, login, student dashboard (readiness gauge +
  breakdown rendered with live numbers), analytics page (radar chart
  rendered), Memory Bank (swipe deck rendered with real due-card data), a
  complete practice exam from start to submission (gradient timer, question
  navigator, palette color states, immediate feedback all confirmed
  working), the review page (time-per-question heatmap rendered with real
  captured timings), and the admin panel (quiz management, question bank,
  and the student deep-dive with the new Strong/Weak chapter panels) —
  **zero JavaScript errors** in every page (the only console messages seen
  were Google Fonts requests blocked by this sandbox's own network
  restrictions, which will load normally on a real machine with internet
  access).

## Two real bugs found and fixed during this verification

1. `POST /questions` returned a stale `root_question_id: null` in its JSON
   response even though the database row was correct — a follow-up DB write
   updated the row but the in-memory object returned to the client wasn't
   updated to match. Fixed.
2. **CSV bulk question import would crash with a 400 "duplicatesSkipped is
   not defined" on every request** — a variable was declared inside a nested
   `try` block but read outside it. This was a genuine runtime bug that
   static syntax checking cannot catch (it's valid JavaScript syntax, just a
   scoping mistake). Found by actually running an import, fixed, and
   re-verified working.

Both fixes are already in the code you're looking at — nothing further to
do for these.

## Known non-issues (not bugs, just things to know)

- **Google Fonts blocked in this sandbox**: this environment's network
  policy blocks `fonts.googleapis.com`; the app will fall back to system
  fonts here, but will load Poppins/Inter/JetBrains Mono normally on any
  machine with normal internet access.
- **Optional integrations degrade gracefully by design**: without
  `REDIS_URL` set, emails are logged instead of queued; without
  `S3_BUCKET`/AWS credentials set, the uploads endpoint returns a clear 501
  instead of crashing. Neither is required for the app to run.
- The large client JS bundle warning (`993kB`) from `vite build` is a
  performance advisory, not an error — the app works correctly, it would
  just benefit from code-splitting in a future pass if load time matters to you.
