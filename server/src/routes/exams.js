const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { quizSubmitLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// ---- Quiz / Test-paper management (admin) ----------------------------------
// Covers "Test Paper / Mock Exam Upload": a full structured set uploaded as one unit.
router.post('/quizzes', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  const {
    bundle_id, chapter_id, subject_id, title, type, duration_minutes, pass_percent, attempt_limit, question_ids,
    status, show_explanations, allow_review_after_submit,
  } = req.body;
  if (!title || !type || !Array.isArray(question_ids) || !question_ids.length) {
    return res.status(400).json({ error: 'title, type, and non-empty question_ids[] required' });
  }
  if (!['practice', 'exam'].includes(type)) {
    return res.status(400).json({ error: "type must be 'practice' or 'exam'" });
  }
  // Every new quiz starts life as a draft unless the caller explicitly asks
  // to publish it immediately — a quiz shouldn't go live to students purely
  // as a side effect of being created.
  const initialStatus = status === 'published' ? 'published' : 'draft';
  // Mode strictly determines answer-visibility-while-answering: Practice
  // always shows immediate feedback, Exam never does. This is intentionally
  // NOT client-overridable — a previous version let show_explanations drift
  // independently of type, which is exactly what made Practice/Exam behave
  // inconsistently ("toggle not working correctly"). allow_review_after_submit
  // (the post-submission answer key) is still admin-configurable, and only
  // meaningful for Exam — Practice already showed everything live.
  const forcedShowExplanations = type === 'practice';
  const result = await pool.query(
    `INSERT INTO quizzes (bundle_id, chapter_id, subject_id, title, type, duration_minutes, pass_percent, attempt_limit, question_ids, created_by, status, show_explanations, allow_review_after_submit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [bundle_id || null, chapter_id || null, subject_id || null, title, type, duration_minutes || 30, pass_percent || 70,
     attempt_limit || 0, question_ids, req.user.id, initialStatus,
     forcedShowExplanations,
     allow_review_after_submit != null ? !!allow_review_after_submit : true]
  );
  res.status(201).json({ quiz: result.rows[0] });
});

router.get('/quizzes', authenticate, async (req, res) => {
  const { bundle_id, chapter_id, subject_id, type, status } = req.query;
  const clauses = ['q.deleted_at IS NULL'];
  const params = [];
  if (chapter_id) { params.push(chapter_id); clauses.push(`q.chapter_id = $${params.length}`); }
  if (subject_id) { params.push(subject_id); clauses.push(`q.subject_id = $${params.length}`); }
  if (type) { params.push(type); clauses.push(`q.type = $${params.length}`); }
  if (bundle_id) {
    // A quiz belongs to a bundle either directly (legacy) or via its subject
    // being included in the bundle (bundle_subjects).
    params.push(bundle_id);
    clauses.push(`(q.bundle_id = $${params.length} OR q.subject_id IN (SELECT subject_id FROM bundle_subjects WHERE bundle_id = $${params.length}))`);
  }
  // Students only ever see published quizzes. Admins/instructors manage the
  // full list (drafts included) and can additionally filter by status.
  if (req.user.role === 'student') {
    clauses.push(`q.status = 'published'`);
  } else if (status) {
    params.push(status); clauses.push(`q.status = $${params.length}`);
  }
  const result = await pool.query(
        `SELECT q.id, q.bundle_id, q.chapter_id, q.subject_id, q.title, q.type, q.duration_minutes, q.pass_percent, q.attempt_limit,
          q.status, q.show_explanations, q.allow_review_after_submit,
          q.question_ids, array_length(q.question_ids,1) AS question_count, q.created_at
     FROM quizzes q WHERE ${clauses.join(' AND ')} ORDER BY q.created_at DESC`,
    params
  );
  res.json({ quizzes: result.rows });
});

router.patch('/quizzes/:id', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  const { question_ids, title, type, duration_minutes, pass_percent, attempt_limit, status, allow_review_after_submit } = req.body;
  if (type && !['practice', 'exam'].includes(type)) {
    return res.status(400).json({ error: "type must be 'practice' or 'exam'" });
  }
  // show_explanations is derived from the (possibly-updated) type, never
  // taken from the request body directly — see POST /quizzes above for why.
  const forcedShowExplanations = type ? (type === 'practice') : null;
  const result = await pool.query(
    `UPDATE quizzes SET
       question_ids = COALESCE($1, question_ids),
       title = COALESCE($2, title),
       type = COALESCE($3, type),
       duration_minutes = COALESCE($4, duration_minutes),
       pass_percent = COALESCE($5, pass_percent),
       attempt_limit = COALESCE($6, attempt_limit),
       status = COALESCE($7, status),
       show_explanations = COALESCE($8, show_explanations),
       allow_review_after_submit = COALESCE($9, allow_review_after_submit)
     WHERE id = $10 AND deleted_at IS NULL RETURNING *`,
    [question_ids || null, title || null, type || null, duration_minutes || null, pass_percent || null, attempt_limit ?? null,
     status || null, forcedShowExplanations, allow_review_after_submit ?? null, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Quiz not found' });
  res.json({ quiz: result.rows[0] });
});

// Quick Publish / Unpublish toggle — a lighter-weight sibling of the general
// PATCH above, used by the one-click status pill in the admin quiz table.
router.patch('/quizzes/:id/status', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  const { status } = req.body;
  if (!['draft', 'published'].includes(status)) return res.status(400).json({ error: "status must be 'draft' or 'published'" });
  const result = await pool.query(
    `UPDATE quizzes SET status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
    [status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Quiz not found' });
  res.json({ quiz: result.rows[0] });
});

router.delete('/quizzes/:id', authenticate, authorize('admin'), async (req, res) => {
  await pool.query('UPDATE quizzes SET deleted_at = now() WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ---- Attempts ----------------------------------------------------------------
router.post('/quizzes/:id/start', authenticate, authorize('student'), async (req, res) => {
  const quizResult = await pool.query('SELECT * FROM quizzes WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  const quiz = quizResult.rows[0];
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  if (quiz.status !== 'published') return res.status(403).json({ error: 'This quiz is not published yet' });

  if (quiz.attempt_limit > 0) {
    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS c FROM attempts WHERE user_id = $1 AND quiz_id = $2 AND status = 'submitted'",
      [req.user.id, quiz.id]
    );
    if (countResult.rows[0].c >= quiz.attempt_limit) {
      return res.status(403).json({ error: 'Attempt limit reached for this quiz' });
    }
  }

  // A deliberate start is always a new attempt. Any abandoned attempt is
  // closed first so it cannot keep appearing as an active online session.
  await pool.query(
    "UPDATE attempts SET status = 'expired' WHERE user_id = $1 AND quiz_id = $2 AND status = 'in_progress'",
    [req.user.id, quiz.id]
  );

  const deadline = new Date(Date.now() + quiz.duration_minutes * 60000);

  // Freeze every question exactly as it reads right now. This is what
  // /submit and /review score and display against — never the live
  // `questions` table — so a question edited mid-exam (or edited between
  // submission and later review) cannot change this student's result or
  // rewrite what they were actually shown. See schema.sql for the rationale.
  const snapshotResult = await pool.query(
    `SELECT id, question_text, question_type, options, correct_option, explanation FROM questions WHERE id = ANY($1)`,
    [quiz.question_ids]
  );
  const questionSnapshot = {};
  for (const q of snapshotResult.rows) {
    questionSnapshot[q.id] = {
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options,
      correct_option: q.correct_option,
      explanation: q.explanation,
    };
  }

  const attemptResult = await pool.query(
    `INSERT INTO attempts (user_id, quiz_id, total_questions, deadline_at, question_snapshot) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.id, quiz.id, quiz.question_ids.length, deadline, JSON.stringify(questionSnapshot)]
  );

  // Return questions without the correct answer / explanation while exam is live
  const qResult = await pool.query(
    `SELECT id, question_text, question_type, options, difficulty, image_url FROM questions WHERE id = ANY($1) ORDER BY array_position($1, id)`,
    [quiz.question_ids]
  );
  res.json({ attempt: attemptResult.rows[0], quiz, questions: qResult.rows, resumed: false });
});

// Persist a single answer immediately on selection — not only on submit.
// selected_option may be an empty string to explicitly clear a previous answer.
router.post('/attempts/:id/answer', authenticate, async (req, res) => {
  const { question_id, selected_option, time_spent_seconds } = req.body;
  if (!question_id || selected_option == null) return res.status(400).json({ error: 'question_id and selected_option required' });
  const attemptResult = await pool.query('SELECT * FROM attempts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  const attempt = attemptResult.rows[0];
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.status !== 'in_progress') return res.status(409).json({ error: 'Attempt already finalized' });
  if (attempt.deadline_at && new Date(attempt.deadline_at) < new Date()) {
    return res.status(409).json({ error: 'Time is up for this attempt' });
  }
  // Time-Per-Question (TPQ) tracking: client reports how long this question
  // was on screen before being answered/changed. Accumulated (not
  // overwritten) per question so revisiting and re-answering a question adds
  // to its running total rather than losing earlier time on it. Best-effort
  // and approximate — never used for scoring, only for the review heatmap.
  const timingUpdate = (Number.isFinite(Number(time_spent_seconds)) && Number(time_spent_seconds) > 0)
    ? Math.round(Number(time_spent_seconds))
    : 0;
  const updated = await pool.query(
    `UPDATE attempts SET
       answers = jsonb_set(answers, $1, $2::jsonb, true),
       question_timings = jsonb_set(
         question_timings, $1,
         (COALESCE((question_timings->>$4)::int, 0) + $3)::text::jsonb, true
       )
     WHERE id = $5 RETURNING *`,
    [`{${question_id}}`, JSON.stringify(selected_option), timingUpdate, String(question_id), req.params.id]
  );

  // Practice mode: "Immediate Feedback" — when the quiz has explanations
  // enabled, tell the student right away whether that answer was correct
  // and surface the explanation, instead of waiting until the whole quiz is
  // submitted. Mock/exam quizzes (show_explanations = false) never get this
  // — the answer key stays protected until /submit.
  let feedback = null;
  const quizResult = await pool.query('SELECT type, show_explanations FROM quizzes WHERE id = $1', [attempt.quiz_id]);
  const quiz = quizResult.rows[0];
  if (quiz && quiz.show_explanations) {
    const frozen = attempt.question_snapshot && attempt.question_snapshot[question_id];
    let q = frozen;
    if (!q) {
      const live = await pool.query('SELECT question_type, correct_option, explanation FROM questions WHERE id = $1', [question_id]);
      q = live.rows[0];
    }
    if (q) {
      const type = q.question_type || 'mcq';
      let isCorrect = null;
      if (type === 'multi_select') {
        const givenSet = String(selected_option).split(',').map((s) => s.trim()).filter(Boolean).sort().join(',');
        const correctSet = String(q.correct_option || '').split(',').map((s) => s.trim()).filter(Boolean).sort().join(',');
        isCorrect = !!givenSet && givenSet === correctSet;
      } else if (type === 'numerical') {
        const givenNum = parseFloat(selected_option);
        const correctNum = parseFloat(q.correct_option);
        isCorrect = !Number.isNaN(givenNum) && !Number.isNaN(correctNum) && Math.abs(givenNum - correctNum) < 0.01;
      } else if (type === 'short_answer' || type === 'descriptive') {
        isCorrect = null; // needs manual grading — no auto answer key to reveal
      } else {
        isCorrect = selected_option === q.correct_option;
      }
      feedback = { is_correct: isCorrect, correct_option: q.correct_option, explanation: q.explanation || null };
    }
  }

  res.json({ attempt: updated.rows[0], feedback });
});

router.post('/attempts/:id/submit', authenticate, quizSubmitLimiter, async (req, res) => {
  const attemptResult = await pool.query('SELECT * FROM attempts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  const attempt = attemptResult.rows[0];
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  // Already graded — return as-is (idempotent, e.g. a resubmit from a slow
  // network retry). An 'expired' attempt (e.g. superseded by a fresh /start
  // on the same quiz, or the tab was left open past the server deadline) is
  // NOT terminal here: its already-recorded answers are still gradable, and
  // treating it as a dead end used to leave it permanently unscored with no
  // error shown to the student — this now grades it exactly once instead.
  if (attempt.status === 'submitted') return res.json({ attempt });

  const quizResult = await pool.query('SELECT * FROM quizzes WHERE id = $1', [attempt.quiz_id]);
  const quiz = quizResult.rows[0];

  // Server-Authoritative Timing: the client's own clock/timer is never
  // trusted for grading. The server independently computes elapsed time
  // from the DB-recorded started_at and rejects a submission that arrives
  // far past the configured time_limit — a small grace period absorbs
  // normal network/auto-submit latency (the client's own countdown already
  // triggers /submit at 0:00; this only catches tampering or a client that
  // never called /submit at all until long after the deadline).
  const GRACE_MS = 2 * 60 * 1000; // 2 minutes
  const elapsedMs = Date.now() - new Date(attempt.started_at).getTime();
  const allowedMs = quiz.duration_minutes * 60000 + GRACE_MS;
  if (elapsedMs > allowedMs) {
    await pool.query("UPDATE attempts SET status = 'expired' WHERE id = $1 AND status = 'in_progress'", [req.params.id]);
    return res.status(403).json({ error: 'Submission rejected: time limit (plus grace period) has been exceeded.' });
  }
  // Live rows are only a fallback for attempts started before question_snapshot
  // existed (see schema.sql) — normal scoring uses the frozen snapshot below
  // so a question edited after this attempt started cannot change its grade.
  const liveResult = await pool.query('SELECT id, question_type, correct_option FROM questions WHERE id = ANY($1)', [quiz.question_ids]);
  const liveById = Object.fromEntries(liveResult.rows.map((q) => [q.id, q]));

  // Auto-gradable types are scored immediately. Short-answer / descriptive
  // questions need a human to grade them, so they're excluded from the
  // score but still counted as "pending review" for the review screen.
  let correct = 0;
  let gradable = 0;
  let pendingReview = 0;
  // Per-question outcomes for gradable, attempted questions — feeds the
  // rolling student_question_stats table that Topic Mastery is computed
  // from (see server/src/utils/mastery.js). Only auto-gradable types with an
  // actual answer count, matching the "valid question responses" semantics
  // documented on that table.
  const statsUpdates = [];
  for (const questionId of quiz.question_ids) {
    const frozen = attempt.question_snapshot && attempt.question_snapshot[questionId];
    const live = liveById[questionId];
    const q = frozen || live;
    if (!q) continue; // question was hard-removed entirely; nothing to score
    const given = attempt.answers[questionId];
    const type = q.question_type || 'mcq';
    if (type === 'short_answer' || type === 'descriptive') {
      if (given) pendingReview += 1;
      continue;
    }
    gradable += 1;
    if (!given) continue;
    let isCorrect = false;
    if (type === 'multi_select') {
      const givenSet = String(given).split(',').map((s) => s.trim()).filter(Boolean).sort().join(',');
      const correctSet = String(q.correct_option || '').split(',').map((s) => s.trim()).filter(Boolean).sort().join(',');
      isCorrect = !!givenSet && givenSet === correctSet;
    } else if (type === 'numerical') {
      const givenNum = parseFloat(given);
      const correctNum = parseFloat(q.correct_option);
      isCorrect = !Number.isNaN(givenNum) && !Number.isNaN(correctNum) && Math.abs(givenNum - correctNum) < 0.01;
    } else {
      isCorrect = given === q.correct_option;
    }
    if (isCorrect) correct += 1;
    statsUpdates.push({ questionId, isCorrect });
  }
  const total = quiz.question_ids.length;
  const score = gradable ? Math.round((correct / gradable) * 10000) / 100 : 0;

  const updated = await pool.query(
    `UPDATE attempts SET status = 'submitted', submitted_at = now(), correct_count = $1, total_questions = $2, score = $3
     WHERE id = $4 RETURNING *`,
    [correct, total, score, req.params.id]
  );

  // Update rolling per-question mastery stats. Best-effort: a failure here
  // must not fail the submission the student is waiting on.
  try {
    for (const { questionId, isCorrect } of statsUpdates) {
      await pool.query(
        `INSERT INTO student_question_stats (student_id, question_id, attempt_count, correct_count, wrong_count, last_attempt)
         VALUES ($1, $2, 1, $3, $4, now())
         ON CONFLICT (student_id, question_id) DO UPDATE SET
           attempt_count = student_question_stats.attempt_count + 1,
           correct_count = student_question_stats.correct_count + $3,
           wrong_count = student_question_stats.wrong_count + $4,
           last_attempt = now()`,
        [req.user.id, questionId, isCorrect ? 1 : 0, isCorrect ? 0 : 1]
      );
    }
  } catch (err) {
    console.error('Failed to update student_question_stats', err);
  }

  res.json({ attempt: updated.rows[0], passed: score >= quiz.pass_percent, pendingReview });
});

// Review screen — correct answers + explanations + the student's own choice.
// Reads from the frozen question_snapshot captured at attempt start (falling
// back to the live question for pre-snapshot attempts) so this always shows
// exactly what the student was scored against, even if the question has
// since been edited or the correct option changed.
router.get('/attempts/:id/review', authenticate, async (req, res) => {
  const attemptResult = await pool.query('SELECT * FROM attempts WHERE id = $1', [req.params.id]);
  const attempt = attemptResult.rows[0];
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.user_id !== req.user.id && !['admin', 'instructor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (attempt.status !== 'submitted') return res.status(409).json({ error: 'Attempt not yet submitted' });

  const quizResult = await pool.query('SELECT * FROM quizzes WHERE id = $1', [attempt.quiz_id]);
  const quiz = quizResult.rows[0];
  const liveResult = await pool.query(
    'SELECT id, question_text, question_type, options, correct_option, explanation FROM questions WHERE id = ANY($1)',
    [quiz.question_ids]
  );
  const liveById = Object.fromEntries(liveResult.rows.map((q) => [q.id, q]));

  // Exam-mode "answer protection": if this quiz has post-submission review
  // turned off, a student cannot see the answer key / explanations at all —
  // only their own selections. Admins/instructors reviewing on the admin
  // side always see the full key regardless of this setting.
  const reviewLocked = quiz.allow_review_after_submit === false && req.user.role === 'student';

  const review = quiz.question_ids.map((questionId) => {
    const frozen = attempt.question_snapshot && attempt.question_snapshot[questionId];
    const q = frozen || liveById[questionId];
    if (!q) return null; // question was hard-removed entirely
    const given = attempt.answers[questionId] || null;
    const type = q.question_type || 'mcq';
    let isCorrect = null; // null = not auto-graded (needs manual review)
    if (type === 'multi_select') {
      const givenSet = given ? String(given).split(',').map((s) => s.trim()).filter(Boolean).sort().join(',') : '';
      const correctSet = String(q.correct_option || '').split(',').map((s) => s.trim()).filter(Boolean).sort().join(',');
      isCorrect = !!givenSet && givenSet === correctSet;
    } else if (type === 'numerical') {
      const givenNum = parseFloat(given);
      const correctNum = parseFloat(q.correct_option);
      isCorrect = !Number.isNaN(givenNum) && !Number.isNaN(correctNum) && Math.abs(givenNum - correctNum) < 0.01;
    } else if (type === 'short_answer' || type === 'descriptive') {
      isCorrect = null;
    } else {
      isCorrect = given === q.correct_option;
    }
    if (reviewLocked) {
      // Strip the answer key entirely — only the student's own choice + the
      // question itself are safe to show.
      const { correct_option, explanation, ...safe } = q;
      return { id: questionId, ...safe, your_answer: given, is_correct: null };
    }
    return { id: questionId, ...q, your_answer: given, is_correct: isCorrect };
  }).filter(Boolean);
  res.json({ attempt, quiz, review, reviewLocked, questionTimings: attempt.question_timings || {} });
});

router.get('/attempts/mine', authenticate, async (req, res) => {
  const { subject_id } = req.query;
  const params = [req.user.id];
  const subjectClause = subject_id ? ' AND q.subject_id = $2' : '';
  if (subject_id) params.push(subject_id);
  const result = await pool.query(
    `SELECT a.*, q.title AS quiz_title, q.type AS quiz_type FROM attempts a
     JOIN quizzes q ON q.id = a.quiz_id WHERE a.user_id = $1${subjectClause} ORDER BY a.started_at DESC`,
    params
  );
  res.json({ attempts: result.rows });
});

// ---- Live exam monitor (admin control room) ---------------------------------
// In-progress + recently finished attempts across all students, for the admin
// live monitor screen. Polled every few seconds from the client.
router.get('/monitor', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  const { quiz_id } = req.query;
  const clauses = [`a.started_at > now() - interval '6 hours'`];
  const params = [];
  if (quiz_id) { params.push(quiz_id); clauses.push(`a.quiz_id = $${params.length}`); }
  const result = await pool.query(
    `SELECT a.id AS attempt_id, a.status, a.started_at, a.submitted_at, a.deadline_at,
            a.total_questions, (SELECT count(*) FROM jsonb_object_keys(a.answers))::int AS answered_count,
            u.id AS student_id, u.name AS student_name, u.email AS student_email,
            q.id AS quiz_id, q.title AS quiz_title, q.duration_minutes
     FROM attempts a
     JOIN users u ON u.id = a.user_id
     JOIN quizzes q ON q.id = a.quiz_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY a.started_at DESC LIMIT 300`,
    params
  );
  const now = Date.now();
  const rows = result.rows.map((r) => {
    const deadline = r.deadline_at ? new Date(r.deadline_at).getTime() : null;
    const secondsRemaining = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : null;
    let connectionStatus = 'Active';
    if (r.status === 'submitted') connectionStatus = 'Submitted';
    else if (secondsRemaining === 0) connectionStatus = 'Time up';
    return { ...r, seconds_remaining: secondsRemaining, connection_status: connectionStatus };
  });
  const summary = {
    total: rows.length,
    active: rows.filter((r) => r.status === 'in_progress' && r.seconds_remaining !== 0).length,
    submitted: rows.filter((r) => r.status === 'submitted').length,
    timeUp: rows.filter((r) => r.status === 'in_progress' && r.seconds_remaining === 0).length,
  };
  res.json({ attempts: rows, summary });
});

module.exports = router;
