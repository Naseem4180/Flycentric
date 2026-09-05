# FlyCentric — Working Build

This is a running implementation of the FlyCentric BRD, built and tested end-to-end
in this environment: PostgreSQL database, Node/Express API, and a React (Vite) frontend.

Every endpoint below was hit with real requests during the build (not just written —
verified) and every core screen was rendered and screenshotted in an actual browser.

## What's fully working (Phases 0–5)

- **Phase 0/1 — Foundation & Identity**: PostgreSQL schema (replaces the SQLite prototype),
  JWT auth with access/refresh tokens, formal RBAC (admin/instructor/student/institution),
  Google OAuth endpoint (accepts a verified profile — wire up `GOOGLE_CLIENT_ID` for a live
  deploy), institution-scoped data access.
- **Phase 2 — Content & Question Bank**: Bundles → Subjects → Chapters → Sections CRUD,
  draft/live publish workflow, question bank with CSV bulk import/export, full-text search,
  soft-delete + trash bin with restore, student discrepancy reporting → admin review queue.
- **Phase 3 — Exam Engine**: timed mock exams, per-answer persistence (every click is saved,
  not just on submit), auto-scoring, pass/fail against a configurable threshold, attempt
  limits, review screen with correct answers + explanations, resume-on-reconnect, Memory
  Bank bookmarking.
- **Phase 4 — Analytics, Instructor & Institution tools**: student self-analytics with
  weak-topic detection, instructor batch/student dashboards, doubt queue, notes metadata,
  the **Unified Admin Control Center** (platform analytics, all-user management with bulk
  upload/role assignment, job board management, trash bin) and admin per-user deep-dive
  (exam history, weak topics, payment history in one screen).
- **Phase 5 — Payments**: order creation, a webhook endpoint that is the source of truth
  for payment confirmation (not client-side verification), bundle-access grants tied to
  payment status, admin-initiated refunds with audit trail.

## What's scaffolded but needs real external accounts to go live (Phases 6–8)

These need infrastructure/accounts this sandbox can't provision — Razorpay live keys, a
real domain, an Apple Developer account — so they're structured but not "functionally
working" the way Phases 0–5 are:

- **Phase 5 payments**: the webhook handler works and was tested, but is running against
  a locally-simulated order rather than Razorpay's real API. Set `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and swap the `/order` route to call
  Razorpay's Orders API to go live.
- **Phase 6 — Public site & SEO**: not built. The BRD calls for a separate Next.js SSR
  marketing site on a custom domain — that's a second app, out of scope for this pass.
- **Phase 7 — Go-live readiness**: no load testing, Sentry, or automated backups configured
  — these are deployment-environment concerns (Cloud Run + Cloud SQL), not something a
  local sandbox build can meaningfully exercise.
- **Phase 8 — Mobile app**: not built. Needs React Native + Expo, a monorepo split from
  this codebase, and an Apple Developer account for App Store submission.

## Architecture as built

- `server/` — Node.js + Express (the BRD specifies NestJS; this build uses plain Express
  with the same modular route-per-domain structure, to keep the build fast and dependency-light
  — swapping to NestJS modules later is straightforward since the route logic and SQL are
  already isolated per file in `server/src/routes/`)
- PostgreSQL 16, raw `pg` driver with parameterized queries (Prisma was intentionally
  skipped — its query-engine binary download requires network access this sandbox doesn't
  allow; for a live deploy, introducing Prisma over this schema is a mechanical change)
- `client/` — React 19 + Vite + React Router, no UI framework, hand-built CSS design system
  (aviation instrument theme: navy/sky-blue, circular score gauges, timed-exam countdown)

## Running it locally

### 1. Database
```bash
# Postgres 16 must be running with a `flycentric` db owned by a `flycentric` user
# (see server/.env for the exact connection string used during this build)
cd server
npm install
npm run migrate   # applies src/db/schema.sql
npm run seed       # creates demo users, one course, questions, a quiz, a batch, a job
```

### 2. API server
```bash
cd server
npm start           # listens on :4000
```

### 3. Frontend
```bash
cd client
npm install
npm run dev          # Vite dev server on :5173, proxies API calls to localhost:4000
```

### Demo logins (password for all: `Password123!`)
| Role | Email |
|---|---|
| Admin | admin@flycentric.in |
| Instructor | instructor@flycentric.in |
| Student | student@flycentric.in |
| Institution | institution@flycentric.in |

## Known simplifications vs. the BRD's confirmed stack

- Express instead of NestJS (see above) — RBAC and modularity requirements are still met.
- File uploads (notes, question images) store a `file_url` field only; wiring actual bytes
  to Google Cloud Storage needs GCP credentials this sandbox doesn't have.
- CORS is wide-open (`cors()` with no origin restriction) for local development — the BRD's
  Phase 0 security-hardening requirement to scope this to the production domain still needs
  doing before any real deployment.

---

## Update: UI overhaul, exam fullscreen fix, general reporting (this pass)

Real bugs found and fixed, each verified with actual browser tests (not just code review):

- **2.1MB logo file removed.** The old `/icons.svg` was a 2.1MB painterly illustration loaded
  as a tiny navbar icon on every page. Replaced with a ~500-byte inline SVG mark used
  consistently in the navbar, admin sidebar, and favicon.
- **Body font was silently broken.** `font-family: 'Plus Jakarta Sans'` was set but that font
  was never loaded via Google Fonts, so the whole app was quietly falling back to system fonts.
  Fixed to use the actually-loaded font stack.
- **Exam fullscreen bug fixed.** The old fullscreen button called
  `document.documentElement.requestFullscreen()`, which fullscreens the entire page — navbar
  included. It also silently failed to trigger reliably because it was called after an `await`,
  by which point the browser had lost the "trusted user gesture" context tied to the click.
  Fixed by requesting fullscreen on the exam container **synchronously inside the click
  handler**, with the container always mounted in the DOM so the ref is never null at the
  moment of the click. Now: click "Start" → confirm modal → automatic fullscreen (navbar
  genuinely hidden, confirmed via `document.fullscreenElement`) → automatic exit on submit.
- **General reporting added.** Students previously could only flag an issue from the exam
  review screen (tied to a specific question). `discrepancy_reports.question_id` is now
  nullable, and a new "Report an issue" section on the Support page lets students report
  anything, any time — not gated behind having completed a test. Admin's Reports section and
  notification bell both handle these general reports (shown as "no question" rows) alongside
  question-specific ones.
- **Navy color mismatch fixed.** Navbar and admin sidebar previously used two different
  hardcoded navy hex values; both now reference one shared `--brand-navy` variable.
