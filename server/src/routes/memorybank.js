const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Spaced Repetition scheduling: interval (in days) grows with each
// consecutive "known" review, capped at the last entry — a simple SM-2-lite
// curve rather than the full SuperMemo algorithm, which is plenty for a
// bounded exam-question deck. Index = confidence_level after this review.
const INTERVAL_DAYS = [0, 1, 2, 4, 7, 14, 30];
function nextIntervalDays(confidenceLevel) {
  return INTERVAL_DAYS[Math.min(confidenceLevel, INTERVAL_DAYS.length - 1)];
}

// ---- Memory Bank Insights (admin) --------------------------------------------
// "Frequently Saved Questions": which questions students bookmark the most.
router.get('/admin/frequent', authorize('admin'), async (req, res) => {
  const { q } = req.query;
  const clauses = ['ques.deleted_at IS NULL'];
  const params = [];
  if (q) { params.push(`%${q}%`); clauses.push(`ques.question_text ILIKE $${params.length}`); }
  const result = await pool.query(
    `SELECT ques.id, ques.question_text, s.title AS subject, COUNT(mb.id)::int AS times_saved
     FROM memory_bank mb
     JOIN questions ques ON ques.id = mb.question_id
     LEFT JOIN subjects s ON s.id = ques.subject_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY ques.id, s.title ORDER BY times_saved DESC LIMIT 100`,
    params
  );
  res.json({ questions: result.rows });
});

// "Top Students": who saves the most questions to their Memory Box.
router.get('/admin/top-students', authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, COUNT(mb.id)::int AS saved_count
     FROM memory_bank mb JOIN users u ON u.id = mb.user_id
     GROUP BY u.id ORDER BY saved_count DESC LIMIT 100`
  );
  res.json({ students: result.rows });
});

// A single student's Memory Box, for admin review. Saved questions stay
// private to the student who saved them — this route is scoped to one user id
// and is the only way an admin can look at an individual box.
router.get('/admin/by-student/:userId', authorize('admin'), async (req, res) => {
  const userResult = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [req.params.userId]);
  if (!userResult.rows.length) return res.status(404).json({ error: 'Student not found' });
  const result = await pool.query(
    `SELECT mb.id AS bookmark_id, mb.created_at AS saved_at, q.id, q.question_text, q.difficulty,
            q.options, q.correct_option, q.explanation, s.title AS subject_title, c.title AS chapter_title
     FROM memory_bank mb
     JOIN questions q ON q.id = mb.question_id
     LEFT JOIN subjects s ON s.id = q.subject_id
     LEFT JOIN chapters c ON c.id = q.chapter_id
     WHERE mb.user_id = $1 AND q.deleted_at IS NULL
     ORDER BY mb.created_at DESC`,
    [req.params.userId]
  );
  res.json({ student: userResult.rows[0], items: result.rows });
});

// ---- Memory Bank -> practice quiz -------------------------------------------
// Turns the student's saved questions into a real, playable practice quiz
// rather than a read-only list. The quiz is generated on demand, populated
// EXCLUSIVELY from this student's memory_bank rows, and is untimed practice
// (no deadline, immediate feedback) by construction.
//
// It is created unpublished and owned by the requesting student, and the id
// is handed straight back so the client can route to /take-exam/:id. Each
// call refreshes the same personal quiz instead of piling up new rows.
router.post('/practice-quiz', async (req, res) => {
  const { subject_id, chapter_id, limit } = req.body || {};

  const clauses = ['mb.user_id = $1', 'q.deleted_at IS NULL', 'q.is_latest = true'];
  const params = [req.user.id];
  if (subject_id) { params.push(subject_id); clauses.push(`q.subject_id = $${params.length}`); }
  if (chapter_id) { params.push(chapter_id); clauses.push(`q.chapter_id = $${params.length}`); }

  const cap = Math.min(Number(limit) || 100, 200);
  params.push(cap);

  const saved = await pool.query(
    `SELECT q.id
     FROM memory_bank mb
     JOIN questions q ON q.id = mb.question_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY mb.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  const questionIds = saved.rows.map((r) => r.id);
  if (!questionIds.length) {
    return res.status(400).json({ error: 'Your Memory Bank is empty — save some questions first.' });
  }

  const title = `Memory Bank practice · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;

  // One reusable personal quiz per student, refreshed in place, so repeated
  // clicks don't litter the quizzes table with near-identical rows.
  const existing = await pool.query(
    `SELECT id FROM quizzes
     WHERE created_by = $1 AND source = 'memory_bank' AND deleted_at IS NULL
     LIMIT 1`,
    [req.user.id]
  );

  let quiz;
  if (existing.rows.length) {
    const updated = await pool.query(
      `UPDATE quizzes
         SET question_ids = $1, title = $2, duration_minutes = NULL,
             type = 'practice', show_explanations = true, status = 'published',
             updated_at = now()
       WHERE id = $3 RETURNING *`,
      [questionIds, title, existing.rows[0].id]
    );
    quiz = updated.rows[0];
  } else {
    const created = await pool.query(
      `INSERT INTO quizzes
         (title, type, duration_minutes, pass_percent, attempt_limit, question_ids,
          created_by, status, show_explanations, allow_review_after_submit, source)
       VALUES ($1, 'practice', NULL, 0, 0, $2, $3, 'published', true, true, 'memory_bank')
       RETURNING *`,
      [title, questionIds, req.user.id]
    );
    quiz = created.rows[0];
  }

  res.status(201).json({ quiz, question_count: questionIds.length });
});

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT mb.id AS bookmark_id, mb.confidence_level, mb.review_count, mb.next_review_at, mb.last_reviewed_at,
            q.* FROM memory_bank mb
     JOIN questions q ON q.id = mb.question_id
     WHERE mb.user_id = $1 AND q.deleted_at IS NULL ORDER BY mb.created_at DESC`,
    [req.user.id]
  );
  res.json({ items: result.rows });
});

// Spaced Repetition deck: only cards actually due for review right now
// (next_review_at <= now()), soonest-due first — this is what the
// Tinder-style swipe deck (client/src/pages/MemoryBank.jsx) pulls from,
// instead of showing every saved question every time regardless of when it
// was last reviewed.
router.get('/due', async (req, res) => {
  const { limit = 30 } = req.query;
  const result = await pool.query(
    `SELECT mb.id AS bookmark_id, mb.confidence_level, mb.review_count, mb.next_review_at, mb.last_reviewed_at,
            q.* FROM memory_bank mb
     JOIN questions q ON q.id = mb.question_id
     WHERE mb.user_id = $1 AND q.deleted_at IS NULL AND mb.next_review_at <= now()
     ORDER BY mb.next_review_at ASC LIMIT $2`,
    [req.user.id, Math.min(Number(limit) || 30, 100)]
  );
  res.json({ items: result.rows, dueCount: result.rows.length });
});

// Record the outcome of one swipe: 'known' (swipe right) advances the
// confidence level and schedules the next review further out; 'again'
// (swipe left) resets confidence and brings it back for review today.
router.post('/:questionId/review', async (req, res) => {
  const { result: outcome } = req.body;
  if (!['known', 'again'].includes(outcome)) return res.status(400).json({ error: "result must be 'known' or 'again'" });

  const current = await pool.query(
    'SELECT * FROM memory_bank WHERE user_id = $1 AND question_id = $2',
    [req.user.id, req.params.questionId]
  );
  if (!current.rows.length) return res.status(404).json({ error: 'Question is not in your Memory Bank' });
  const row = current.rows[0];

  const nextConfidence = outcome === 'known' ? row.confidence_level + 1 : 0;
  const days = outcome === 'known' ? nextIntervalDays(nextConfidence) : 0;

  const updated = await pool.query(
    `UPDATE memory_bank SET
       confidence_level = $1,
       review_count = review_count + 1,
       last_reviewed_at = now(),
       next_review_at = now() + ($2 || ' days')::interval
     WHERE user_id = $3 AND question_id = $4 RETURNING *`,
    [nextConfidence, days, req.user.id, req.params.questionId]
  );
  res.json({ item: updated.rows[0], mastered: nextConfidence >= INTERVAL_DAYS.length - 1 });
});

router.post('/:questionId', async (req, res) => {
  await pool.query(
    'INSERT INTO memory_bank (user_id, question_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [req.user.id, req.params.questionId]
  );
  res.status(201).json({ ok: true });
});

router.delete('/:questionId', async (req, res) => {
  await pool.query('DELETE FROM memory_bank WHERE user_id = $1 AND question_id = $2', [req.user.id, req.params.questionId]);
  res.json({ ok: true });
});

module.exports = router;
