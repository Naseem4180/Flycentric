const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

// True when the student holds access to a bundle that includes this subject.
// The quiz join preserves access for legacy content where the quiz was linked
// directly to a bundle before its subject was added to bundle_subjects.
async function hasSubjectAccess(userId, subjectId) {
  const result = await pool.query(
    `SELECT 1 FROM bundle_access ba
     LEFT JOIN bundle_subjects bs
       ON bs.bundle_id = ba.bundle_id AND bs.subject_id = $2
     LEFT JOIN quizzes q
       ON q.bundle_id = ba.bundle_id AND q.subject_id = $2
          AND q.deleted_at IS NULL AND q.status = 'published'
     WHERE ba.user_id = $1 AND (bs.subject_id IS NOT NULL OR q.id IS NOT NULL)
     LIMIT 1`,
    [userId, subjectId]
  );
  return result.rows.length > 0;
}


function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
}

// ---- Bundles (Course & Bundle Publishing) ----------------------------------
async function attachIncludedSubjects(bundles) {
  if (!bundles.length) return bundles;
  const result = await pool.query(
    `SELECT bs.bundle_id, s.id, s.title, s.status FROM bundle_subjects bs
     JOIN subjects s ON s.id = bs.subject_id WHERE bs.bundle_id = ANY($1) AND s.deleted_at IS NULL
     ORDER BY s.order_index, s.title`,
    [bundles.map((b) => b.id)]
  );
  const byBundle = {};
  for (const row of result.rows) {
    (byBundle[row.bundle_id] = byBundle[row.bundle_id] || []).push({ id: row.id, title: row.title, status: row.status });
  }
  return bundles.map((b) => ({ ...b, subjects: byBundle[b.id] || [] }));
}

router.get('/bundles', async (req, res) => {
  const { status } = req.query;
  const includeDrafts = req.query.include_drafts === 'true';
  let query = 'SELECT * FROM bundles WHERE deleted_at IS NULL';
  const params = [];
  if (status) {
    params.push(status);
    query += ` AND status = $${params.length}`;
  } else if (!includeDrafts) {
    query += " AND status = 'live'";
  }
  query += ' ORDER BY created_at DESC';
  const result = await pool.query(query, params);
  res.json({ bundles: await attachIncludedSubjects(result.rows) });
});

router.post('/bundles', authenticate, authorize('admin'), async (req, res) => {
  const { title, description, exam_type, price_inr, is_free, subject_ids } = req.body;
  const bundleIsFree = is_free === undefined ? Number(price_inr || 0) === 0 : !!is_free;
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = await pool.query(
    `INSERT INTO bundles (title, slug, description, exam_type, price_inr, is_free, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING *`,
    [title, slugify(title), description || null, exam_type || 'CPL', bundleIsFree ? 0 : (price_inr || 0), bundleIsFree, req.user.id]
  );
  const bundle = result.rows[0];
  if (Array.isArray(subject_ids) && subject_ids.length) {
    const values = subject_ids.map((sid) => `(${bundle.id}, ${Number(sid)})`).join(',');
    await pool.query(`INSERT INTO bundle_subjects (bundle_id, subject_id) VALUES ${values} ON CONFLICT DO NOTHING`);
  }
  const [withSubjects] = await attachIncludedSubjects([bundle]);
  res.status(201).json({ bundle: withSubjects });
});

router.patch('/bundles/:id', authenticate, authorize('admin'), async (req, res) => {
  const { title, description, exam_type, price_inr, is_free, subject_ids } = req.body;
  const bundleIsFree = is_free === undefined ? Number(price_inr || 0) === 0 : !!is_free;
  const result = await pool.query(
    `UPDATE bundles SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       exam_type = COALESCE($3, exam_type),
       price_inr = CASE WHEN $6 THEN 0 ELSE COALESCE($4, price_inr) END,
      is_free = $6
     WHERE id = $5 AND deleted_at IS NULL RETURNING *`,
    [title, description, exam_type, price_inr, bundleIsFree, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Bundle not found' });
  if (Array.isArray(subject_ids)) {
    await pool.query('DELETE FROM bundle_subjects WHERE bundle_id = $1', [req.params.id]);
    if (subject_ids.length) {
      const values = subject_ids.map((sid) => `(${req.params.id}, ${Number(sid)})`).join(',');
      await pool.query(`INSERT INTO bundle_subjects (bundle_id, subject_id) VALUES ${values} ON CONFLICT DO NOTHING`);
    }
  }
  const [withSubjects] = await attachIncludedSubjects([result.rows[0]]);
  res.json({ bundle: withSubjects });
});

router.post('/bundles/:id/publish', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `UPDATE bundles SET status = 'live' WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Bundle not found' });
  res.json({ bundle: result.rows[0] });
});

router.post('/bundles/:id/unpublish', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `UPDATE bundles SET status = 'draft' WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Bundle not found' });
  res.json({ bundle: result.rows[0] });
});

router.delete('/bundles/:id', authenticate, authorize('admin'), async (req, res) => {
  await pool.query('UPDATE bundles SET deleted_at = now() WHERE id = $1', [req.params.id]);
  await logAudit({ req, action: 'bundle.delete', entityType: 'bundle', entityId: req.params.id });
  res.json({ ok: true });
});

// ---- Subjects -----------------------------------------------------------------
// Subjects are now global curriculum items ("Subjects & Quizzes" screen) that
// any number of bundles can include ("Bundles & Pricing" screen) via
// bundle_subjects. bundle_id is kept only for legacy rows.

// Global list — used by the Subjects & Quizzes curriculum tree and by the
// "Included Subjects" checklist on Bundles & Pricing.
router.get('/subjects', async (req, res) => {
  const { q } = req.query;
  const clauses = ['s.deleted_at IS NULL'];
  const params = [];
  if (q) { params.push(`%${q}%`); clauses.push(`s.title ILIKE $${params.length}`); }
  const result = await pool.query(
    `SELECT s.*, COUNT(DISTINCT qz.id)::int AS quiz_count
     FROM subjects s
     LEFT JOIN quizzes qz ON qz.subject_id = s.id AND qz.deleted_at IS NULL
     WHERE ${clauses.join(' AND ')}
     GROUP BY s.id ORDER BY s.order_index, s.title`,
    params
  );
  res.json({ subjects: result.rows });
});

router.post('/subjects', authenticate, authorize('admin'), async (req, res) => {
  const { title, description, order_index, bundle_ids } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = await pool.query(
    'INSERT INTO subjects (title, description, order_index) VALUES ($1,$2,$3) RETURNING *',
    [title, description || null, order_index || 0]
  );
  const bundleIds = Array.isArray(bundle_ids) ? bundle_ids.map(Number).filter(Number.isInteger) : [];
  if (bundleIds.length) {
    await pool.query(
      `INSERT INTO bundle_subjects (bundle_id, subject_id)
       SELECT unnest($1::int[]), $2 ON CONFLICT DO NOTHING`,
      [bundleIds, result.rows[0].id]
    );
  }
  res.status(201).json({ subject: result.rows[0] });
});

// Legacy/nested route kept for back-compat — creates a global subject and
// links it to the given bundle in one call.
router.get('/bundles/:bundleId/subjects', async (req, res) => {
  const result = await pool.query(
    `SELECT s.* FROM subjects s
     JOIN bundle_subjects bs ON bs.subject_id = s.id
     WHERE bs.bundle_id = $1 AND s.deleted_at IS NULL ORDER BY s.order_index`,
    [req.params.bundleId]
  );
  res.json({ subjects: result.rows });
});

router.post('/bundles/:bundleId/subjects', authenticate, authorize('admin'), async (req, res) => {
  const { title, order_index } = req.body;
  const result = await pool.query(
    'INSERT INTO subjects (title, order_index) VALUES ($1,$2) RETURNING *',
    [title, order_index || 0]
  );
  await pool.query('INSERT INTO bundle_subjects (bundle_id, subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.bundleId, result.rows[0].id]);
  res.status(201).json({ subject: result.rows[0] });
});

router.patch('/subjects/:id', authenticate, authorize('admin'), async (req, res) => {
  const { title, description, order_index, status, bundle_ids } = req.body;
  const result = await pool.query(
    `UPDATE subjects SET title = COALESCE($1,title), description = COALESCE($2,description),
       order_index = COALESCE($3,order_index), status = COALESCE($4,status)
     WHERE id = $5 AND deleted_at IS NULL RETURNING *`,
    [title, description, order_index, status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Subject not found' });
  if (Array.isArray(bundle_ids)) {
    const bundleIds = bundle_ids.map(Number).filter(Number.isInteger);
    await pool.query('DELETE FROM bundle_subjects WHERE subject_id = $1', [req.params.id]);
    if (bundleIds.length) {
      await pool.query(
        `INSERT INTO bundle_subjects (bundle_id, subject_id)
         SELECT unnest($1::int[]), $2 ON CONFLICT DO NOTHING`,
        [bundleIds, req.params.id]
      );
    }
  }
  res.json({ subject: result.rows[0] });
});

router.delete('/subjects/:id', authenticate, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subject = await client.query(
      'SELECT id FROM subjects WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [req.params.id]
    );
    if (!subject.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Subject not found' });
    }
    await client.query('UPDATE quizzes SET deleted_at = now() WHERE subject_id = $1 AND deleted_at IS NULL', [req.params.id]);
    await client.query('DELETE FROM bundle_subjects WHERE subject_id = $1', [req.params.id]);
    await client.query('UPDATE subjects SET deleted_at = now() WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await logAudit({ req, action: 'subject.delete', entityType: 'subject', entityId: req.params.id });
  res.json({ ok: true });
});

// ---- Chapters -----------------------------------------------------------------
// Global chapter list for admin authoring surfaces. Keeping this separate from
// the subject tree ensures imported/legacy question taxonomy is still visible
// wherever an admin needs to filter or assign a question.
router.get('/chapters', async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, s.title AS subject_title
     FROM chapters c
     JOIN subjects s ON s.id = c.subject_id AND s.deleted_at IS NULL
     WHERE c.deleted_at IS NULL
     ORDER BY s.order_index, s.title, c.order_index, c.id`
  );
  res.json({ chapters: result.rows });
});

router.get('/subjects/:subjectId/chapters', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM chapters WHERE subject_id = $1 AND deleted_at IS NULL ORDER BY order_index',
    [req.params.subjectId]
  );
  res.json({ chapters: result.rows });
});

// ---- Subject detail with per-chapter progress -------------------------------
// Backs the redesigned Subject dashboard. Returns, in ONE round trip:
//   - header totals: assignments completed/total, tests taken + average, overall %
//   - a chapter list carrying each chapter's lock state, attempt count and
//     best/last score, so the UI can render the status dot and "1 try · 6.0%"
//     badge without an N+1 request per chapter.
//
// "Assignment" here means a practice quiz attached to the chapter; "Test"
// means an exam-mode quiz. A chapter is unlocked when the student has bundle
// access, or the chapter is flagged as a free preview.
router.get('/subjects/:subjectId/progress', authenticate, async (req, res) => {
  const subjectId = req.params.subjectId;

  const subjectResult = await pool.query(
    'SELECT * FROM subjects WHERE id = $1 AND deleted_at IS NULL',
    [subjectId]
  );
  if (!subjectResult.rows.length) return res.status(404).json({ error: 'Subject not found' });
  const subject = subjectResult.rows[0];

  const chaptersResult = await pool.query(
    'SELECT id, title, order_index, is_free FROM chapters WHERE subject_id = $1 AND deleted_at IS NULL ORDER BY order_index, id',
    [subjectId]
  );

  // Quizzes belonging to this subject, split by mode.
  const quizResult = await pool.query(
    `SELECT id, title, type, chapter_id, duration_minutes
     FROM quizzes
     WHERE subject_id = $1 AND deleted_at IS NULL AND status = 'published'
       AND source IS DISTINCT FROM 'memory_bank'`,
    [subjectId]
  );

  // Every submitted attempt this student has on those quizzes.
  const quizIds = quizResult.rows.map((q) => q.id);
  const attemptsResult = quizIds.length
    ? await pool.query(
        `SELECT quiz_id, score, submitted_at
         FROM attempts
         WHERE user_id = $1 AND quiz_id = ANY($2) AND status = 'submitted'
         ORDER BY submitted_at ASC`,
        [req.user.id, quizIds]
      )
    : { rows: [] };

  const attemptsByQuiz = new Map();
  for (const a of attemptsResult.rows) {
    if (!attemptsByQuiz.has(a.quiz_id)) attemptsByQuiz.set(a.quiz_id, []);
    attemptsByQuiz.get(a.quiz_id).push(a);
  }

  const fullAccess = req.user.role !== 'student' || await hasSubjectAccess(req.user.id, subjectId);

  const chapters = chaptersResult.rows.map((c) => {
    const chapterQuizzes = quizResult.rows.filter((q) => String(q.chapter_id) === String(c.id));
    const assignment = chapterQuizzes.find((q) => q.type === 'practice') || null;
    const test = chapterQuizzes.find((q) => q.type === 'exam') || null;

    const chapterAttempts = chapterQuizzes.flatMap((q) => attemptsByQuiz.get(q.id) || []);
    const attemptCount = chapterAttempts.length;
    const lastScore = attemptCount ? Number(chapterAttempts[chapterAttempts.length - 1].score || 0) : null;
    const bestScore = attemptCount
      ? Math.max(...chapterAttempts.map((a) => Number(a.score || 0)))
      : null;

    const unlocked = fullAccess || c.is_free;
    // status drives the left-hand indicator: locked -> padlock,
    // not_started -> grey square, attempted -> coloured circle.
    const status = !unlocked ? 'locked' : (attemptCount > 0 ? 'attempted' : 'not_started');

    return {
      id: c.id,
      title: c.title,
      is_free: c.is_free,
      unlocked,
      status,
      attempt_count: attemptCount,
      last_score: lastScore,
      best_score: bestScore,
      assignment_quiz_id: assignment ? assignment.id : null,
      test_quiz_id: test ? test.id : null,
      has_study_material: true,
    };
  });

  const assignmentQuizzes = quizResult.rows.filter((q) => q.type === 'practice');
  const testQuizzes = quizResult.rows.filter((q) => q.type === 'exam');
  const completedAssignments = assignmentQuizzes.filter((q) => (attemptsByQuiz.get(q.id) || []).length).length;
  const takenTests = testQuizzes.filter((q) => (attemptsByQuiz.get(q.id) || []).length);
  const testScores = takenTests.flatMap((q) => (attemptsByQuiz.get(q.id) || []).map((a) => Number(a.score || 0)));
  const avgTestScore = testScores.length
    ? Math.round((testScores.reduce((x, y) => x + y, 0) / testScores.length) * 10) / 10
    : null;

  const allScores = attemptsResult.rows.map((a) => Number(a.score || 0));
  const overallScore = allScores.length
    ? Math.round((allScores.reduce((x, y) => x + y, 0) / allScores.length) * 10) / 10
    : 0;

  const attemptedChapters = chapters.filter((c) => c.attempt_count > 0).length;

  res.json({
    subject,
    chapters,
    summary: {
      assignments_completed: completedAssignments,
      assignments_total: assignmentQuizzes.length,
      assignments_percent: assignmentQuizzes.length
        ? Math.round((completedAssignments / assignmentQuizzes.length) * 100)
        : 0,
      tests_taken: takenTests.length,
      tests_total: testQuizzes.length,
      tests_avg_score: avgTestScore,
      overall_score: overallScore,
      chapters_total: chapters.length,
      chapters_attempted: attemptedChapters,
      chapters_percent: chapters.length
        ? Math.round((attemptedChapters / chapters.length) * 100)
        : 0,
      last_activity: attemptsResult.rows.length
        ? attemptsResult.rows[attemptsResult.rows.length - 1].submitted_at
        : null,
    },
  });
});

router.post('/subjects/:subjectId/chapters', authenticate, authorize('admin'), async (req, res) => {
  const { title, order_index, is_free } = req.body;
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return res.status(400).json({ error: 'title required' });
  const existing = await pool.query(
    `SELECT c.id, c.subject_id, s.title AS subject_title
     FROM chapters c
     JOIN subjects s ON s.id = c.subject_id
     WHERE lower(trim(c.title)) = lower($1) AND c.deleted_at IS NULL AND s.deleted_at IS NULL
     LIMIT 1`,
    [cleanTitle]
  );
  if (existing.rows.length) {
    const chapter = existing.rows[0];
    return res.status(409).json({
      error: `This chapter already belongs to the subject “${chapter.subject_title}”. Select that subject instead of creating a duplicate.`,
      chapter_id: chapter.id,
      subject_id: chapter.subject_id,
    });
  }
  try {
    const result = await pool.query(
      'INSERT INTO chapters (subject_id, title, order_index, is_free) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.subjectId, cleanTitle, order_index || 0, !!is_free]
    );
    res.status(201).json({ chapter: result.rows[0] });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'chapters_unique_active_title') {
      return res.status(409).json({
        error: 'This chapter already exists. Select the subject that already contains it instead of creating a duplicate.',
      });
    }
    throw err;
  }
});

router.patch('/chapters/:id', authenticate, authorize('admin'), async (req, res) => {
  const { title, order_index, is_free } = req.body;
  const result = await pool.query(
    `UPDATE chapters SET title = COALESCE($1,title), order_index = COALESCE($2,order_index), is_free = COALESCE($3,is_free)
     WHERE id = $4 AND deleted_at IS NULL RETURNING *`,
    [title, order_index, is_free, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Chapter not found' });
  res.json({ chapter: result.rows[0] });
});

router.delete('/chapters/:id', authenticate, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE questions SET chapter_id = NULL WHERE chapter_id = $1', [req.params.id]);
    await client.query('UPDATE quizzes SET chapter_id = NULL WHERE chapter_id = $1', [req.params.id]);
    const result = await client.query(
      'UPDATE chapters SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id, title',
      [req.params.id]
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Chapter not found' });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await logAudit({ req, action: 'chapter.delete', entityType: 'chapter', entityId: req.params.id });
  res.json({ ok: true });
});

// ---- Sections -------------------------------------------------------------------
router.get('/chapters/:chapterId/sections', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM sections WHERE chapter_id = $1 AND deleted_at IS NULL ORDER BY order_index',
    [req.params.chapterId]
  );
  res.json({ sections: result.rows });
});

router.post('/chapters/:chapterId/sections', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  const { title, content, order_index } = req.body;
  const result = await pool.query(
    'INSERT INTO sections (chapter_id, title, content, order_index) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.chapterId, title, content || null, order_index || 0]
  );
  res.status(201).json({ section: result.rows[0] });
});

router.patch('/sections/:id', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  const { title, content, order_index } = req.body;
  const result = await pool.query(
    `UPDATE sections SET title = COALESCE($1,title), content = COALESCE($2,content), order_index = COALESCE($3,order_index)
     WHERE id = $4 AND deleted_at IS NULL RETURNING *`,
    [title, content, order_index, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Section not found' });
  res.json({ section: result.rows[0] });
});

router.delete('/sections/:id', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  await pool.query('UPDATE sections SET deleted_at = now() WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ---- Trash bin (content-wide) ----------------------------------------------
router.get('/trash', authenticate, authorize('admin'), async (req, res) => {
  const [bundles, subjects, chapters, sections] = await Promise.all([
    pool.query("SELECT id, title, 'bundle' AS type, deleted_at FROM bundles WHERE deleted_at IS NOT NULL"),
    pool.query("SELECT id, title, 'subject' AS type, deleted_at FROM subjects WHERE deleted_at IS NOT NULL"),
    pool.query("SELECT id, title, 'chapter' AS type, deleted_at FROM chapters WHERE deleted_at IS NOT NULL"),
    pool.query("SELECT id, title, 'section' AS type, deleted_at FROM sections WHERE deleted_at IS NOT NULL"),
  ]);
  res.json({ items: [...bundles.rows, ...subjects.rows, ...chapters.rows, ...sections.rows] });
});

router.post('/trash/:type/:id/restore', authenticate, authorize('admin'), async (req, res) => {
  const tableMap = { bundle: 'bundles', subject: 'subjects', chapter: 'chapters', section: 'sections' };
  const table = tableMap[req.params.type];
  if (!table) return res.status(400).json({ error: 'Invalid type' });
  await pool.query(`UPDATE ${table} SET deleted_at = NULL WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
