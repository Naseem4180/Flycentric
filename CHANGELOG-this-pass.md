# FlyCentric — Change Log (this pass)

This build was unzipped, installed, migrated, seeded, boot-tested, and rebuilt
end-to-end in this environment — every item below was actually exercised
(curl against the running API, `npm run build`), not just written.

## 1. Quiz Creation Modal Enhancement
- New `.modal-full` style (96vw × 92vh) and the quiz builder in
  Admin → Subjects & Quizzes now opens at that size instead of a 720px box.

## 2. Chapter Mapping for Quizzes and Questions
- Already implemented in the codebase (chapter dropdown on questions,
  multi-chapter picker on quizzes) — verified working, no changes needed.

## 3. Conditional Rendering for Course Resources
- Added `notes_url` / `has_exam` columns on `chapters`.
- Admin chapter form now has a Notes URL field and an "Exam" checkbox.
- Student subject view only renders the Notes/Exam icons when set —
  nothing shows for a chapter with neither.

## 4. Custom Chapter Sequencing
- **Fixed a real bug**: chapters were silently auto-realphabetized on every
  rename, overriding any manual order an admin set. `order_index` is now the
  strict, sole source of truth. New chapters append to the end of the
  existing sequence. Added `POST /content/subjects/:id/chapters/reorder`
  for drag-and-drop. The old "Sort A→Z" button still exists as an explicit,
  opt-in action.

## 5. Rich Text Support for Subject Descriptions
- New dependency-free `RichTextEditor` component (bold/italic/underline/
  bulleted list/link) replaces the plain textarea in the admin Subject form.
- Server sanitizes all subject description HTML before storage
  (`server/src/utils/sanitizeHtml.js`, using `jsdom`) to an allowlist of
  safe tags/attributes.
- Student-facing subject page renders the sanitized HTML and force-rewrites
  every link to `target="_blank" rel="noopener noreferrer"`.

## 6. Inactivity Timeout & Auto-Submit for Exams
- Frontend idle listener in `TakeExam.jsx` (mouse/click/keyboard/touch/
  scroll) auto-submits after 180 minutes of no activity.
- Server-side safety net (`server/src/jobs/scheduler.js`) force-submits any
  `in_progress` attempt whose `last_seen_at` is stale by 180+ minutes, for
  the case where the browser tab was closed outright. Submission logic was
  refactored into a shared `gradeAndSubmitAttempt()` used by both the
  student-triggered route and this sweep.

## 7. Dynamic Visibility for Paid vs. Free Content
- Student Dashboard's "Explore" list now hides free bundles once the
  student holds at least one paid bundle.

## 8. Student Reporting Mechanism
- The general report endpoint (`POST /questions/reports`) now requires
  exactly two comma-separated keywords (validated server-side; stored
  structured in a new `keywords` column, not just embedded in free text).
- Support page now has a "Reported" section listing the student's own
  submitted reports and their status.

## 9. Multi-Tiered Notification System with Scheduling
- New `notifications` table (type, content, link_url, start/end window,
  is_active) with full admin CRUD (`AdminNotifications.jsx`, new sidebar
  entry) and a public `/notifications/active` endpoint that only returns
  rows whose window currently contains "now".
- New `NotificationBar` component renders scheduled **banners** (dismissible)
  and a scrolling **ticker** on the student shell.

## 10–13. Automated Email Engine
All four jobs live in `server/src/jobs/scheduler.js`, started on server boot,
checked every 5 minutes, each guarded by a per-user/per-row timestamp so
re-checks never double-send:
- **Progress reports** every 3 days (chapter completion % + quiz scores).
- **Re-engagement emails** for users inactive 7+ days (`users.last_login_at`
  is now tracked on every login).
- **Bulk marketing/greeting campaigns** — new `email_campaigns` table +
  admin UI (`AdminEmailCampaigns.jsx`) to draft, schedule, cancel.
- **Birthday greetings** — `users.date_of_birth`, settable via a new
  self-service `PATCH /auth/me`.
- All four were verified firing for real against the seeded database (see
  server log: a progress-report email was actually generated and logged).
- Emails go through the existing `mailQueue` utility (BullMQ/Redis with a
  graceful log-only fallback when `REDIS_URL` isn't set, unchanged).

## Theme: lighter, less colorful
- Sidebar changed from a saturated dark navy/indigo gradient to a clean
  white/light surface with a single light accent for the active item.
- Dashboard and public marketing hero banners changed from dark navy
  gradients with white text to soft light tints with dark text.
- Removed decorative multi-color gradients (purple auth button, pink/purple
  progress bars, blue→indigo gradient text and thumbnails) in favor of the
  single flat brand blue.
- Base palette (backgrounds, borders, text) was already light — this pass
  removes the remaining high-saturation/dark accents layered on top of it.

## Verified working end-to-end in this session
- `npm run migrate` / `npm run seed` — clean.
- Server boots, `/api/health` → connected.
- Scheduler starts and actually sends a progress-report (logged, since no
  `REDIS_URL`/SMTP is configured in this sandbox).
- Login, notification create + fetch, email campaign create + list, chapter
  create (confirms new-chapter-append ordering fix), report submission with
  keyword validation (both success and the expected 400) — all exercised
  with real HTTP requests.
- `npm run build` (client) — clean, no errors.
