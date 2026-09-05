-- FlyCentric schema — PostgreSQL
-- Phase 0/1: identity | Phase 2: content | Phase 3: exams | Phase 4: analytics/ops | Phase 5: payments

CREATE TABLE IF NOT EXISTS institutions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  branding JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','instructor','student','institution')),
  institution_id INTEGER REFERENCES institutions(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  google_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Phase 2: content hierarchy -------------------------------------------------
CREATE TABLE IF NOT EXISTS bundles (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  exam_type TEXT NOT NULL DEFAULT 'CPL', -- CPL, ATPL, RTR(A), SACAA
  price_inr INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  bundle_id INTEGER REFERENCES bundles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('draft','live')),
  order_index INTEGER DEFAULT 0,
  deleted_at TIMESTAMPTZ
);
-- Subjects used to belong to exactly one bundle. They are now shared, global
-- curriculum items that any number of bundles can include (see bundle_subjects
-- below) — relax the old NOT NULL/ownership constraint for existing installs.
ALTER TABLE subjects ALTER COLUMN bundle_id DROP NOT NULL;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'live';
DO $$ BEGIN
  ALTER TABLE subjects ADD CONSTRAINT subjects_status_check CHECK (status IN ('draft','live'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Many-to-many: a bundle "includes" a set of shared subjects.
CREATE TABLE IF NOT EXISTS bundle_subjects (
  bundle_id INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (bundle_id, subject_id)
);
-- Backfill: any pre-existing subject that was created under a bundle keeps
-- that association in the new join table too.
INSERT INTO bundle_subjects (bundle_id, subject_id)
  SELECT bundle_id, id FROM subjects WHERE bundle_id IS NOT NULL
  ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS chapters (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  is_free BOOLEAN NOT NULL DEFAULT false, -- free-preview chapters are visible/unlocked without purchasing the bundle
  deleted_at TIMESTAMPTZ
);
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS sections (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  order_index INTEGER DEFAULT 0,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq','multi_select','true_false','numerical','short_answer','descriptive')),
  options JSONB NOT NULL DEFAULT '[]', -- [{"key":"A","text":"..."}, ...] — empty for numerical/short_answer/descriptive
  correct_option TEXT, -- single key for mcq/true_false, comma-separated keys for multi_select, numeric/text reference answer otherwise
  explanation TEXT,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  tags TEXT[] DEFAULT '{}',
  image_url TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_questions_search ON questions USING GIN (to_tsvector('english', question_text));
-- Existing installs created these as NOT NULL before non-MCQ question types were
-- supported (descriptive/short-answer questions have no options or single correct key).
ALTER TABLE questions ALTER COLUMN options SET DEFAULT '[]';
ALTER TABLE questions ALTER COLUMN correct_option DROP NOT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'mcq';
DO $$ BEGIN
  ALTER TABLE questions ADD CONSTRAINT questions_question_type_check
    CHECK (question_type IN ('mcq','multi_select','true_false','numerical','short_answer','descriptive'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- "Mark FAQ": admins flag frequently-appearing questions so students can be
-- pointed at the highest-value practice set.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_faq BOOLEAN NOT NULL DEFAULT false;
-- Comma-separated exam appearance years, stored as unique year strings so the
-- question bank can show exactly which exam years used this question.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS appearances TEXT[] NOT NULL DEFAULT '{}';

-- Bundle pricing mode. Existing zero-priced bundles remain free; new bundles
-- can choose the mode explicitly in the admin catalogue form.
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;
UPDATE bundles SET is_free = true WHERE price_inr = 0;

-- Question Versioning: content edits to an active question are prohibited at
-- the application layer (see routes/questions.js PATCH /:id). Editing content
-- archives the current row and inserts a brand-new row; appearance-only
-- metadata edits update the existing row so the question ID stays stable.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS root_question_id INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_latest BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS superseded_by INTEGER REFERENCES questions(id);
-- Every pre-existing row is its own root (version 1 of itself).
UPDATE questions SET root_question_id = id WHERE root_question_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_questions_root ON questions (root_question_id);

-- Duplicate Detection: a normalized hash of question_text + options, checked
-- on both single POST and CSV bulk import before insert (see routes/questions.js).
ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_questions_content_hash ON questions (content_hash) WHERE deleted_at IS NULL AND is_latest = true;

CREATE TABLE IF NOT EXISTS discrepancy_reports (
  id SERIAL PRIMARY KEY,
  question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
  reported_by INTEGER REFERENCES users(id),
  reason TEXT NOT NULL, -- typing_error | wrong_answer | doubtful | general
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Existing installs may have created this column as NOT NULL before general
-- (question-less) reports were supported — relax it for those databases.
ALTER TABLE discrepancy_reports ALTER COLUMN question_id DROP NOT NULL;

-- "Report Exam Question": students flag that a question appeared in their
-- real DGCA exam sitting. Admins review these on the Mark FAQ > Pending
-- Reports tab and can mark the underlying question as FAQ.
CREATE TABLE IF NOT EXISTS exam_appearances (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  reported_by INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER REFERENCES subjects(id),
  exam_center TEXT,
  exam_date DATE,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','dismissed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Phase 3: exam engine --------------------------------------------------------
CREATE TABLE IF NOT EXISTS quizzes (
  id SERIAL PRIMARY KEY,
  bundle_id INTEGER REFERENCES bundles(id) ON DELETE CASCADE,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('practice','exam','master','mock','rtr')),
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  -- (legacy CHECK above widened/replaced below — kept here only so a fresh
  -- CREATE TABLE on a brand-new database still succeeds before the DO block
  -- runs; every real install goes through the simplification below.)
  pass_percent INTEGER NOT NULL DEFAULT 70,
  attempt_limit INTEGER DEFAULT 0, -- 0 = unlimited
  question_ids INTEGER[] NOT NULL DEFAULT '{}',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE;

-- Publish workflow: quizzes are built as drafts and only become visible to
-- students once explicitly published. Existing installs (created before this
-- column existed) are backfilled to 'published' exactly once, on first
-- migration, so already-live quizzes don't silently disappear from student
-- views — see the guarded DO block below. Every quiz created after that
-- point defaults to 'draft' until an admin publishes it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quizzes' AND column_name = 'status') THEN
    ALTER TABLE quizzes ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
    UPDATE quizzes SET status = 'published';
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE quizzes ADD CONSTRAINT quizzes_status_check CHECK (status IN ('draft','published'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing databases may still have the original type constraint while they
-- are being converted to the simplified Practice/Exam modes below. Widen it
-- temporarily so the conversion can run before the final constraint is set.
DO $$ BEGIN
  ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_type_check;
  ALTER TABLE quizzes ADD CONSTRAINT quizzes_type_check
    CHECK (type IN ('practice','exam','master','mock','rtr'));
END $$;

-- Practice vs Exam behaviour: show_explanations is derived from `type` at
-- the application layer (routes/exams.js) and is not independently
-- editable by clients — see the note further down on why. It's still a
-- real column (not computed) so existing rows/queries don't need to change.
-- allow_review_after_submit stays admin-configurable (Exam only): once the
-- whole quiz is submitted, let the student see correct answers +
--   explanations on the review screen (the "Exam mode" post-submission
--   review). Defaults to true, matching the review screen's previous
--   always-on behaviour.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS show_explanations BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS allow_review_after_submit BOOLEAN NOT NULL DEFAULT true;

-- Assessment modes simplified to exactly two: Practice and Exam. Existing
-- 'master' quizzes behave like Practice (answers visible as you go); existing
-- 'mock'/'rtr' quizzes behave like Exam (answers protected). This is a
-- one-time, idempotent collapse — re-running it is a no-op once every row
-- is already 'practice'/'exam' and the narrower CHECK is in place.
UPDATE quizzes SET type = 'practice' WHERE type = 'master';
UPDATE quizzes SET type = 'exam' WHERE type IN ('mock', 'rtr');
DO $$ BEGIN
  ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_type_check;
  ALTER TABLE quizzes ADD CONSTRAINT quizzes_type_check CHECK (type IN ('practice','exam'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Mode now strictly determines these two flags at the application layer
-- (routes/exams.js forces them server-side on create/patch regardless of
-- what a client sends) — this backfill just keeps already-existing rows
-- consistent with that rule immediately after the migration runs.
UPDATE quizzes SET show_explanations = true WHERE type = 'practice' AND show_explanations = false;
UPDATE quizzes SET show_explanations = false WHERE type = 'exam' AND show_explanations = true;

CREATE TABLE IF NOT EXISTS attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','expired')),
  answers JSONB NOT NULL DEFAULT '{}', -- {question_id: chosen_option} persisted on every select
  score NUMERIC,
  total_questions INTEGER,
  correct_count INTEGER,
  started_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ
);
-- Historical/assessment integrity: a frozen copy of each question exactly as
-- it read when the attempt started — {question_id: {question_text, options,
-- correct_option, explanation, question_type}}. Scoring and review must use
-- this snapshot, not the live `questions` row, so that an admin editing a
-- question's correct answer *after* a student has already started (or
-- finished) an exam cannot retroactively change that student's grade or
-- rewrite what they were actually shown. Falls back to the live row when
-- empty (attempts created before this column existed).
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS question_snapshot JSONB NOT NULL DEFAULT '{}';

-- Time-Per-Question (TPQ) tracking: {question_id: seconds_spent}, updated
-- incrementally as the student answers each question (see POST
-- /attempts/:id/answer in routes/exams.js) so the post-exam review can show
-- a per-question timing heatmap — which questions were rushed (<20s) vs
-- agonized over (>120s). Best-effort/approximate by nature (client-reported
-- elapsed time since the question was displayed), not used for scoring.
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS question_timings JSONB NOT NULL DEFAULT '{}';

-- Rolling per-student, per-question performance. Updated (not recomputed)
-- on every graded quiz submission — see server/src/routes/exams.js. This is
-- the authoritative input to Topic Mastery: Mastery% = SUM(correct_count) /
-- SUM(attempt_count) * 100, aggregated up to subtopic/chapter/subject level
-- via the `questions` -> `chapters` -> `subjects` hierarchy. See
-- server/src/utils/mastery.js for the shared formula/classification.
CREATE TABLE IF NOT EXISTS student_question_stats (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ,
  UNIQUE(student_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_sqs_student ON student_question_stats (student_id);
CREATE INDEX IF NOT EXISTS idx_sqs_question ON student_question_stats (question_id);

CREATE TABLE IF NOT EXISTS memory_bank (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, question_id)
);

-- Spaced Repetition: a lightweight SM-2-style scheduler for the Memory Bank
-- swipe-review deck (see routes/memorybank.js /due, /:questionId/review and
-- client/src/pages/MemoryBank.jsx). confidence_level climbs by one on every
-- "known" (swipe right) review and resets to 0 on "review again" (swipe
-- left); next_review_at is pushed out further each time confidence climbs,
-- so well-known cards surface less often and struggled cards come back sooner.
ALTER TABLE memory_bank ADD COLUMN IF NOT EXISTS confidence_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memory_bank ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memory_bank ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE memory_bank ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_memory_bank_due ON memory_bank (user_id, next_review_at);

-- Phase 4: instructor / institution / analytics -------------------------------
CREATE TABLE IF NOT EXISTS batches (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER REFERENCES institutions(id),
  instructor_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  schedule TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE batches ADD COLUMN IF NOT EXISTS schedule TEXT;

CREATE TABLE IF NOT EXISTS batch_students (
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (batch_id, student_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
  uploaded_by INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doubts (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id),
  batch_id INTEGER REFERENCES batches(id),
  question_id INTEGER REFERENCES questions(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  response TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_postings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT,
  description TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  posted_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_applications (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed','rejected','accepted')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Phase 5: payments ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  bundle_id INTEGER NOT NULL REFERENCES bundles(id),
  amount_inr INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','refunded')),
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Idempotency: the payment provider's own transaction id is the unique key
-- that prevents a re-delivered webhook from being processed twice (in
-- addition to the terminal-status short-circuit in routes/payments.js). A
-- partial unique index (NULL-safe: many rows never reach 'paid' and so
-- never get a razorpay_payment_id) is used instead of a plain UNIQUE column
-- constraint for exactly that reason.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id
  ON payments (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bundle_access (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bundle_id INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, bundle_id)
);

-- Notifications: notifications themselves are synthesized on the fly from
-- doubts/reports/etc, but "read" state needs to persist per user. A generic
-- key (e.g. "report-14", "doubt-9") is marked read here instead of adding a
-- read flag to every source table.
CREATE TABLE IF NOT EXISTS notification_reads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, notification_key)
);

-- Platform Settings page: generic key/value store for admin-configurable
-- platform settings (site name, support email, theme default, etc).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Password reset: single-use, time-limited, hashed tokens. The raw token is
-- only ever sent to the client/console; the DB stores a SHA-256 hash of it so
-- a leaked row (e.g. via a backup or read-replica) cannot itself be replayed.
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id) WHERE used_at IS NULL;

-- Audit log: append-only record of high-risk administrative and financial
-- operations (role/status changes, refunds, content deletion, settings
-- changes). Never updated or deleted by application code.
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  meta JSONB DEFAULT '{}',
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_id);

-- Object Storage: tracks every direct-to-cloud (S3) upload issued a signed
-- URL, so an admin can audit what was uploaded, by whom, its validated MIME
-- type, and its collision-resistant storage key (see routes/uploads.js).
CREATE TABLE IF NOT EXISTS media_uploads (
  id SERIAL PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE, -- collision-resistant UUID-based S3 object key
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  purpose TEXT, -- 'question_image' | 'note' | 'avatar' | etc.
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_uploads_uploader ON media_uploads (uploaded_by);
