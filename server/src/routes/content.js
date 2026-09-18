const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { sanitizeHtml } = require('../utils/sanitizeHtml');

const router = express.Router();

// Lightweight in-memory cache for high-frequency taxonomy endpoints
const taxonomyCache = new Map();
const TAXONOMY_CACHE_TTL_MS = 30000; // 30 seconds

function getCachedTaxonomy(key) {
  const item = taxonomyCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    taxonomyCache.delete(key);
    return null;
  }
  return item.data;
}

function setCachedTaxonomy(key, data) {
  taxonomyCache.set(key, {
    data,
    expiresAt: Date.now() + TAXONOMY_CACHE_TTL_MS,
  });
}

function invalidateTaxonomyCache() {
  taxonomyCache.clear();
}

// Auto-invalidate taxonomy cache on any content modification
router.use((req, res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        invalidateTaxonomyCache();
      }
    });
  }
  next();
});

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

// Natural sort — "Regs 2" comes before "Regs 10" instead of after, which a
// plain string compare would get wrong. Used to keep the curriculum in the
// order an admin actually expects when a chapter is added or renamed.
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
function naturalCompare(a, b) {
  return naturalCollator.compare(String(a || ''), String(b || ''));
}

// Re-sorts every chapter of a subject alphabetically (natural order) and
// rewrites order_index accordingly, spaced by 10 so a future insert never
// needs a full renumber. This is now ONLY ever invoked explicitly by the
// admin (the "Sort A→Z" action below) — curriculum order is otherwise a
// deliberate, admin-controlled sequence (see custom chapter sequencing
// below), so nothing calls this automatically on create/rename anymore.
async function realphabetizeChapters(subjectId, client = pool) {
  const { rows } = await client.query(
    'SELECT id, title FROM chapters WHERE subject_id = $1 AND deleted_at IS NULL ORDER BY id',
    [subjectId]
  );
  const sorted = [...rows].sort((a, b) => naturalCompare(a.title, b.title));
  await Promise.all(sorted.map((c, i) => client.query(
    'UPDATE chapters SET order_index = $1 WHERE id = $2',
    [(i + 1) * 10, c.id]
  )));
}

// Custom Chapter Sequencing: the curriculum is ordered strictly by
// order_index (an admin-set integer), never alphabetically or by created_at.
// A newly created chapter with no explicit order_index is appended to the
// END of the subject's existing sequence (MAX(order_index) + 10) instead of
// being slotted alphabetically, so admins get full manual control of flow.
async function nextOrderIndex(subjectId, client = pool) {
  const { rows } = await client.query(
    'SELECT COALESCE(MAX(order_index), 0) AS max_order FROM chapters WHERE subject_id = $1 AND deleted_at IS NULL',
    [subjectId]
  );
  return Number(rows[0].max_order) + 10;
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

// Unified Content Overview for Content Manager Grid Hub
router.get('/overview', authenticate, authorize('admin'), async (req, res) => {
  const bundlesRes = await pool.query(`
    SELECT b.*,
      COUNT(DISTINCT bs.subject_id)::int AS subject_count
    FROM bundles b
    LEFT JOIN bundle_subjects bs ON bs.bundle_id = b.id
    WHERE b.deleted_at IS NULL
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `);
  const bundles = await attachIncludedSubjects(bundlesRes.rows);

  const subjectsRes = await pool.query(`
    SELECT s.*,
      COUNT(DISTINCT c.id)::int AS chapter_count,
      COUNT(DISTINCT qz.id)::int AS quiz_count
    FROM subjects s
    LEFT JOIN chapters c ON c.subject_id = s.id AND c.deleted_at IS NULL
    LEFT JOIN quizzes qz ON qz.subject_id = s.id AND qz.deleted_at IS NULL
    WHERE s.deleted_at IS NULL
    GROUP BY s.id
    ORDER BY s.order_index ASC, s.id ASC
  `);

  const chaptersRes = await pool.query(`
    SELECT c.*,
      s.title AS subject_title,
      COUNT(DISTINCT q.id)::int AS question_count,
      EXISTS(SELECT 1 FROM questions q2 WHERE q2.chapter_id = c.id) AS has_quiz
    FROM chapters c
    JOIN subjects s ON s.id = c.subject_id AND s.deleted_at IS NULL
    LEFT JOIN questions q ON q.chapter_id = c.id
    WHERE c.deleted_at IS NULL
    GROUP BY c.id, s.title, s.order_index
    ORDER BY s.order_index ASC, c.order_index ASC, c.id ASC
  `);

  const stats = {
    total_bundles: bundles.length,
    live_bundles: bundles.filter((b) => b.status === 'live').length,
    draft_bundles: bundles.filter((b) => b.status !== 'live').length,
    total_subjects: subjectsRes.rows.length,
    live_subjects: subjectsRes.rows.filter((s) => s.status === 'live').length,
    draft_subjects: subjectsRes.rows.filter((s) => s.status !== 'live').length,
    total_chapters: chaptersRes.rows.length,
    live_chapters: chaptersRes.rows.filter((c) => c.status === 'live').length,
    draft_chapters: chaptersRes.rows.filter((c) => c.status !== 'live').length,
    total_items: bundles.length + subjectsRes.rows.length + chaptersRes.rows.length,
  };

  res.json({
    bundles,
    subjects: subjectsRes.rows,
    chapters: chaptersRes.rows,
    stats,
  });
});

router.get('/bundles', async (req, res) => {
  const { status } = req.query;
  const includeDrafts = req.query.include_drafts === 'true';
  const cacheKey = `bundles:${status || ''}:${includeDrafts}`;
  const cached = getCachedTaxonomy(cacheKey);
  if (cached) {
    return res.json(cached);
  }
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
  const responseData = { bundles: await attachIncludedSubjects(result.rows) };
  setCachedTaxonomy(cacheKey, responseData);
  res.json(responseData);
});

router.post('/bundles', authenticate, authorize('admin'), async (req, res) => {
  const { title, slug, description, exam_type, price_inr, is_free, status, subject_ids } = req.body;
  const bundleIsFree = is_free === undefined ? Number(price_inr || 0) === 0 : !!is_free;
  if (!title) return res.status(400).json({ error: 'title required' });
  const finalSlug = slug ? slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : slugify(title);
  const finalStatus = status === 'live' ? 'live' : 'draft';
  const result = await pool.query(
    `INSERT INTO bundles (title, slug, description, exam_type, price_inr, is_free, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [title, finalSlug || slugify(title), description || null, exam_type || 'CPL', bundleIsFree ? 0 : (price_inr || 0), bundleIsFree, finalStatus, req.user.id]
  );
  const bundle = result.rows[0];
  if (Array.isArray(subject_ids)) {
    const validIds = subject_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (validIds.length) {
      await pool.query(
        `INSERT INTO bundle_subjects (bundle_id, subject_id)
         SELECT $1, unnest($2::int[])
         ON CONFLICT DO NOTHING`,
        [bundle.id, validIds]
      );
    }
  }
  const [withSubjects] = await attachIncludedSubjects([bundle]);
  res.status(201).json({ bundle: withSubjects });
});

router.patch('/bundles/:id', authenticate, authorize('admin'), async (req, res) => {
  const { title, slug, description, exam_type, price_inr, is_free, status, subject_ids } = req.body;
  const bundleIsFree = is_free === undefined ? (price_inr !== undefined ? Number(price_inr || 0) === 0 : undefined) : !!is_free;
  const cleanSlug = slug ? slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : undefined;
  const cleanStatus = status === 'live' || status === 'draft' ? status : undefined;
  const result = await pool.query(
    `UPDATE bundles SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       exam_type = COALESCE($3, exam_type),
       price_inr = CASE WHEN $5 THEN 0 ELSE COALESCE($4, price_inr) END,
       is_free = COALESCE($5, is_free),
       slug = COALESCE($7, slug),
       status = COALESCE($8, status)
     WHERE id = $6 AND deleted_at IS NULL RETURNING *`,
    [title, description, exam_type, price_inr !== undefined ? price_inr : null, bundleIsFree, req.params.id, cleanSlug, cleanStatus]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Bundle not found' });
  if (Array.isArray(subject_ids)) {
    const validIds = subject_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    await pool.query('DELETE FROM bundle_subjects WHERE bundle_id = $1', [req.params.id]);
    if (validIds.length) {
      await pool.query(
        `INSERT INTO bundle_subjects (bundle_id, subject_id)
         SELECT $1, unnest($2::int[])
         ON CONFLICT DO NOTHING`,
        [req.params.id, validIds]
      );
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
  const cacheKey = `subjects:${q || ''}`;
  const cached = getCachedTaxonomy(cacheKey);
  if (cached) {
    return res.json(cached);
  }
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
  const responseData = { subjects: result.rows };
  setCachedTaxonomy(cacheKey, responseData);
  res.json(responseData);
});

router.post('/subjects', authenticate, authorize('admin'), async (req, res) => {
  const { title, description, order_index, bundle_ids, chapters: initialChapters } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  let finalOrder = Number(order_index);
  if (!Number.isFinite(finalOrder) || finalOrder <= 0) {
    const maxRes = await pool.query('SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM subjects WHERE deleted_at IS NULL');
    finalOrder = Number(maxRes.rows[0]?.next_order || 1);
  }
  const result = await pool.query(
    'INSERT INTO subjects (title, description, order_index) VALUES ($1,$2,$3) RETURNING *',
    [title, description ? sanitizeHtml(description) : null, finalOrder]
  );
  const subjectId = result.rows[0].id;

  const bundleIds = Array.isArray(bundle_ids) ? bundle_ids.map(Number).filter(Number.isInteger) : [];
  if (bundleIds.length) {
    await pool.query(
      `INSERT INTO bundle_subjects (bundle_id, subject_id)
       SELECT unnest($1::int[]), $2 ON CONFLICT DO NOTHING`,
      [bundleIds, subjectId]
    );
  }

  // Create or copy initial chapters if provided
  const createdChapters = [];
  if (Array.isArray(initialChapters) && initialChapters.length) {
    for (let idx = 0; idx < initialChapters.length; idx++) {
      const item = initialChapters[idx];
      const chTitle = typeof item === 'string' ? item.trim() : String(item?.title || '').trim();
      if (!chTitle) continue;
      const chOrder = idx + 1;

      if (typeof item === 'object' && item.source_chapter_id) {
        try {
          const srcRes = await pool.query('SELECT * FROM chapters WHERE id = $1 AND deleted_at IS NULL', [item.source_chapter_id]);
          if (srcRes.rows.length) {
            const src = srcRes.rows[0];
            const ins = await pool.query(
              `INSERT INTO chapters (subject_id, title, order_index, is_free, notes_url, has_exam, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
              [subjectId, chTitle || src.title, chOrder, src.is_free, src.notes_url, src.has_exam, src.notes]
            );
            createdChapters.push(ins.rows[0]);
            continue;
          }
        } catch (err) {
          console.error('Error cloning chapter in subject creation:', err);
        }
      }

      try {
        const ins = await pool.query(
          `INSERT INTO chapters (subject_id, title, order_index, is_free, notes_url, has_exam, notes)
           VALUES ($1, $2, $3, false, null, false, $4) RETURNING *`,
          [subjectId, chTitle, chOrder, item?.notes || null]
        );
        createdChapters.push(ins.rows[0]);
      } catch (err) {
        // Ignore duplicate within same batch
      }
    }
  }

  res.status(201).json({ subject: result.rows[0], chapters: createdChapters });
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
  const { title, order_index, subjectIds, subject_ids } = req.body;
  const sIds = subjectIds || subject_ids;
  if (Array.isArray(sIds)) {
    const validIds = sIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    await pool.query('DELETE FROM bundle_subjects WHERE bundle_id = $1', [req.params.bundleId]);
    if (validIds.length) {
      await pool.query(
        `INSERT INTO bundle_subjects (bundle_id, subject_id)
         SELECT $1, unnest($2::int[])
         ON CONFLICT DO NOTHING`,
        [req.params.bundleId, validIds]
      );
    }
    const result = await pool.query(
      `SELECT s.* FROM subjects s
       JOIN bundle_subjects bs ON bs.subject_id = s.id
       WHERE bs.bundle_id = $1 AND s.deleted_at IS NULL ORDER BY s.order_index`,
      [req.params.bundleId]
    );
    return res.json({ subjects: result.rows });
  }

  if (!title) {
    return res.status(400).json({ error: 'title or subjectIds required' });
  }

  const result = await pool.query(
    'INSERT INTO subjects (title, order_index) VALUES ($1,$2) RETURNING *',
    [title, order_index || 0]
  );
  await pool.query('INSERT INTO bundle_subjects (bundle_id, subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.bundleId, result.rows[0].id]);
  res.status(201).json({ subject: result.rows[0] });
});

router.patch('/subjects/:id', authenticate, authorize('admin'), async (req, res) => {
  const { title, description, order_index, status, bundle_ids } = req.body;
  const nextOrder = order_index !== undefined ? (Number(order_index) || 1) : null;
  const result = await pool.query(
    `UPDATE subjects SET title = COALESCE($1,title), description = COALESCE($2,description),
        order_index = COALESCE($3,order_index), status = COALESCE($4,status)
     WHERE id = $5 AND deleted_at IS NULL RETURNING *`,
    [title, description != null ? sanitizeHtml(description) : description, nextOrder, status, req.params.id]
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

router.post('/subjects/:id/publish', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `UPDATE subjects SET status = 'live' WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Subject not found' });
  res.json({ subject: result.rows[0] });
});

router.post('/subjects/:id/unpublish', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `UPDATE subjects SET status = 'draft' WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Subject not found' });
  res.json({ subject: result.rows[0] });
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
    'SELECT id, title, order_index, is_free, notes_url, has_exam, notes FROM chapters WHERE subject_id = $1 AND deleted_at IS NULL ORDER BY order_index ASC, id ASC',
    [subjectId]
  );

  // Quizzes belonging to this subject, split by mode.
  const quizResult = await pool.query(
    `SELECT id, title, type, chapter_id, chapter_ids, duration_minutes
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
    // All quizzes covering this chapter (either single-chapter or part of a multi-chapter quiz)
    const chapterQuizzes = quizResult.rows.filter((q) => (
      (Array.isArray(q.chapter_ids) && q.chapter_ids.some((id) => String(id) === String(c.id)))
      || String(q.chapter_id) === String(c.id)
    ));

    // Prefer a dedicated single-chapter quiz if available, otherwise link any assignment covering this chapter
    const singleAssignment = chapterQuizzes.find((q) => {
      if (q.type !== 'practice') return false;
      const ids = Array.isArray(q.chapter_ids) ? q.chapter_ids : [];
      return ids.length === 1 || (!ids.length && String(q.chapter_id) === String(c.id));
    });
    const assignment = singleAssignment || chapterQuizzes.find((q) => q.type === 'practice') || null;

    const singleTest = chapterQuizzes.find((q) => {
      if (q.type !== 'exam') return false;
      const ids = Array.isArray(q.chapter_ids) ? q.chapter_ids : [];
      return ids.length === 1 || (!ids.length && String(q.chapter_id) === String(c.id));
    });
    const test = singleTest || chapterQuizzes.find((q) => q.type === 'exam') || null;

    const chapterAttempts = chapterQuizzes
      .flatMap((q) => attemptsByQuiz.get(q.id) || [])
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
    const attemptCount = chapterAttempts.length;
    const scores = chapterAttempts.map((a) => Number(a.score || 0));
    const lastScore = attemptCount ? scores[scores.length - 1] : null;
    const bestScore = attemptCount ? Math.max(...scores) : null;

    const unlocked = fullAccess || c.is_free;
    // status drives the left-hand indicator: locked -> padlock,
    // not_started -> grey square, attempted -> coloured circle.
    const status = !unlocked ? 'locked' : (attemptCount > 0 ? 'attempted' : 'not_started');

    const hasNotes = !!(c.notes || c.notes_url);
    const hasExam = !!c.has_exam || !!test;
    const hasQuiz = !!assignment || chapterQuizzes.length > 0;

    return {
      id: c.id,
      title: c.title,
      order_index: c.order_index,
      is_free: c.is_free,
      notes_url: c.notes_url || null,
      notes: c.notes || null,
      has_notes: hasNotes,
      has_exam: hasExam,
      has_quiz: hasQuiz,
      unlocked,
      status,
      attempt_count: attemptCount,
      last_score: lastScore,
      best_score: bestScore,
      // Full score history, oldest first — the chapter badge shows a trend
      // arrow (improved / declined) and a tooltip of every past try.
      score_history: scores,
      trend: attemptCount >= 2 ? Math.round((lastScore - scores[scores.length - 2]) * 10) / 10 : null,
      last_attempt_at: attemptCount ? chapterAttempts[attemptCount - 1].submitted_at : null,
      assignment_quiz_id: assignment ? assignment.id : null,
      test_quiz_id: test ? test.id : null,
      quiz_count: chapterQuizzes.length,
      has_study_material: hasNotes,
    };
  });

  const assignmentQuizzes = quizResult.rows.filter((q) => q.type === 'practice');
  const testQuizzes = quizResult.rows.filter((q) => q.type === 'exam');
  // All exams and subject-wide / multi-chapter assessments
  const assessmentQuizzes = quizResult.rows.filter((q) => {
    if (q.type === 'exam') return true;
    const ids = (Array.isArray(q.chapter_ids) && q.chapter_ids.length)
      ? q.chapter_ids
      : (q.chapter_id ? [q.chapter_id] : []);
    return ids.length === 0 || ids.length > 1;
  });
  const completedAssignments = assignmentQuizzes.filter((q) => (attemptsByQuiz.get(q.id) || []).length).length;
  const takenTests = assessmentQuizzes.filter((q) => (attemptsByQuiz.get(q.id) || []).length);

  // Position lookup based on curriculum order so a test that spans several chapters
  // is anchored to the LAST one in the sequence — e.g. a quiz built from Regs 01-06
  // is inserted into the chapter list right after Regs 06 (between 6 & 7).
  const chapterPositionById = new Map(chaptersResult.rows.map((c, idx) => [String(c.id), idx]));
  const tests = assessmentQuizzes.map((q) => {
    const ids = (Array.isArray(q.chapter_ids) && q.chapter_ids.length)
      ? q.chapter_ids.map(String)
      : (q.chapter_id ? [String(q.chapter_id)] : []);
    const knownIds = ids.filter((id) => chapterPositionById.has(id));
    // Anchor to whichever covered chapter sorts LATEST in the curriculum sequence
    let anchorChapterId = null;
    if (knownIds.length) {
      anchorChapterId = knownIds.reduce((best, id) => (
        chapterPositionById.get(id) > chapterPositionById.get(best) ? id : best
      ));
    } else if (chaptersResult.rows.length) {
      // If quiz is subject-wide, anchor to the very last chapter of the curriculum
      anchorChapterId = String(chaptersResult.rows[chaptersResult.rows.length - 1].id);
    }
    const testAttempts = attemptsByQuiz.get(q.id) || [];
    const scores = testAttempts.map((a) => Number(a.score || 0));
    return {
      id: q.id,
      title: q.title,
      type: q.type,
      pass_percent: q.pass_percent || 70,
      chapter_ids: ids,
      chapter_count: ids.length,
      anchor_chapter_id: anchorChapterId,
      duration_minutes: q.duration_minutes,
      attempt_count: testAttempts.length,
      last_score: scores.length ? scores[scores.length - 1] : null,
      best_score: scores.length ? Math.max(...scores) : null,
    };
  });

  // Every average below is built from each quiz's BEST attempt rather than a
  // flat mean over all attempts, so retaking a quiz and improving raises the
  // subject score instead of being dragged down by the earlier failed try.
  const bestPerQuiz = (quizzes) => quizzes
    .map((q) => {
      const scores = (attemptsByQuiz.get(q.id) || []).map((a) => Number(a.score || 0));
      return scores.length ? Math.max(...scores) : null;
    })
    .filter((s) => s != null);
  const mean = (arr) => (arr.length ? Math.round((arr.reduce((x, y) => x + y, 0) / arr.length) * 10) / 10 : null);

  const avgTestScore = mean(bestPerQuiz(testQuizzes));
  // Overall score is the average across every attempted quiz in the subject.
  // Unattempted quizzes are excluded rather than counted as 0 — "you have not
  // done this yet" is not the same as "you scored zero on this".
  const overallScore = mean(bestPerQuiz(quizResult.rows)) ?? 0;

  const attemptedChapters = chapters.filter((c) => c.attempt_count > 0).length;
  // Chapters, not quizzes, are the unit of progress the chapter list below
  // shows. The header used to count quizzes ("1 of 2") while the list showed
  // chapters ("1 / 21 done"), so the same screen reported two different
  // completion figures. Both now read from the chapter count.
  const chaptersPercent = chapters.length ? Math.round((attemptedChapters / chapters.length) * 100) : 0;

  res.json({
    subject,
    chapters,
    tests,
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
      chapters_percent: chaptersPercent,
      // Progress bar + headline both read this, so they can never disagree.
      progress_percent: chaptersPercent,
      total_attempts: attemptsResult.rows.length,
      last_activity: attemptsResult.rows.length
        ? attemptsResult.rows[attemptsResult.rows.length - 1].submitted_at
        : null,
    },
  });
});

router.post('/subjects/:subjectId/chapters', authenticate, authorize('admin'), async (req, res) => {
  const { title, order_index, is_free, notes_url, has_exam, notes, source_chapter_id } = req.body;
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return res.status(400).json({ error: 'title required' });
  const existing = await pool.query(
    `SELECT c.id, c.subject_id, s.title AS subject_title
     FROM chapters c
     JOIN subjects s ON s.id = c.subject_id
     WHERE lower(trim(c.title)) = lower($1) AND c.subject_id = $2 AND c.deleted_at IS NULL AND s.deleted_at IS NULL
     LIMIT 1`,
    [cleanTitle, req.params.subjectId]
  );
  if (existing.rows.length) {
    return res.status(409).json({
      error: `A chapter named “${cleanTitle}” already exists in this subject.`,
      chapter_id: existing.rows[0].id,
      subject_id: existing.rows[0].subject_id,
    });
  }

  let finalNotesUrl = notes_url || null;
  let finalNotes = notes || null;
  let finalHasExam = !!has_exam;
  let finalIsFree = !!is_free;

  if (source_chapter_id) {
    const src = await pool.query('SELECT * FROM chapters WHERE id = $1 AND deleted_at IS NULL', [source_chapter_id]);
    if (src.rows.length) {
      finalNotesUrl = finalNotesUrl || src.rows[0].notes_url;
      finalNotes = finalNotes || src.rows[0].notes;
      finalHasExam = finalHasExam || src.rows[0].has_exam;
      finalIsFree = finalIsFree || src.rows[0].is_free;
    }
  }

  try {
    // Custom Chapter Sequencing: strictly append to the end of the admin's
    // existing manual order unless a specific position was requested.
    const resolvedOrder = order_index == null ? await nextOrderIndex(req.params.subjectId) : Number(order_index);
    const result = await pool.query(
      'INSERT INTO chapters (subject_id, title, order_index, is_free, notes_url, has_exam, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.params.subjectId, cleanTitle, resolvedOrder, finalIsFree, finalNotesUrl, finalHasExam, finalNotes]
    );
    const fresh = await pool.query('SELECT * FROM chapters WHERE id = $1', [result.rows[0].id]);
    res.status(201).json({ chapter: fresh.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: `A chapter named “${cleanTitle}” already exists in this subject.`,
      });
    }
    throw err;
  }
});

router.patch('/chapters/:id', authenticate, authorize('admin'), async (req, res) => {
  const { title, order_index, is_free, notes_url, has_exam, notes, status, subject_id } = req.body;
  // Custom Chapter Sequencing: order_index is the sole, strict source of
  // truth for curriculum order — renaming a chapter never moves it, and no
  // automatic re-sort runs here. Admins reorder explicitly (drag/drop sends
  // order_index, or the manual "Sort A→Z" action below).
  const result = await pool.query(
    `UPDATE chapters SET
       title = COALESCE($1,title),
       order_index = COALESCE($2,order_index),
       is_free = COALESCE($3,is_free),
       notes_url = CASE WHEN $5 THEN NULLIF($6, '') ELSE notes_url END,
       has_exam = COALESCE($7,has_exam),
       notes = CASE WHEN $8 THEN $9 ELSE notes END,
       status = COALESCE($10,status),
       subject_id = COALESCE($11,subject_id)
     WHERE id = $4 AND deleted_at IS NULL RETURNING *`,
    [title, order_index, is_free, req.params.id, notes_url !== undefined, notes_url, has_exam, notes !== undefined, notes, status, subject_id || null]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Chapter not found' });
  res.json({ chapter: result.rows[0] });
});

router.post('/chapters/:id/publish', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `UPDATE chapters SET status = 'live' WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Chapter not found' });
  res.json({ chapter: result.rows[0] });
});

router.post('/chapters/:id/unpublish', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `UPDATE chapters SET status = 'draft' WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Chapter not found' });
  res.json({ chapter: result.rows[0] });
});


// Explicit drag-and-drop reorder: takes the full ordered list of chapter ids
// for a subject and rewrites order_index to match exactly, spaced by 10.
router.post('/subjects/:subjectId/chapters/reorder', authenticate, authorize('admin'), async (req, res) => {
  const { chapter_ids } = req.body;
  if (!Array.isArray(chapter_ids) || !chapter_ids.length) {
    return res.status(400).json({ error: 'chapter_ids (ordered array) required' });
  }
  await Promise.all(chapter_ids.map((id, i) => pool.query(
    'UPDATE chapters SET order_index = $1 WHERE id = $2 AND subject_id = $3 AND deleted_at IS NULL',
    [(i + 1) * 10, id, req.params.subjectId]
  )));
  const result = await pool.query(
    'SELECT * FROM chapters WHERE subject_id = $1 AND deleted_at IS NULL ORDER BY order_index, id',
    [req.params.subjectId]
  );
  res.json({ chapters: result.rows });
});

// Manual "sort now" — alphabetizes every chapter of a subject on demand, for
// curricula whose chapters were added before this auto-ordering existed.
router.post('/subjects/:subjectId/chapters/sort', authenticate, authorize('admin'), async (req, res) => {
  await realphabetizeChapters(req.params.subjectId);
  const result = await pool.query(
    'SELECT * FROM chapters WHERE subject_id = $1 AND deleted_at IS NULL ORDER BY order_index',
    [req.params.subjectId]
  );
  res.json({ chapters: result.rows });
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

// ---- Homepage & Website CMS ------------------------------------------------
const DEFAULT_HOMEPAGE = {
  header: {
    support_email: 'support@flycentric.in',
    support_phone: '+91 98765 43210',
    announcement: "India's smart aviation exam prep"
  },
  hero: {
    pill: "✧ India's smart aviation learning ecosystem",
    headline_main: 'Master the skies.',
    headline_accent: 'Clear DGCA exams.',
    subtitle: 'Adaptive mock tests, focused flashcards, and clear study plans for CPL, ATPL, and RTR(A).',
    primary_btn_text: 'Explore bundles →',
    primary_btn_url: '#courses',
    secondary_btn_text: 'How it works',
    secondary_btn_url: '#how-it-works'
  },
  features_section: {
    title: 'The smartest way to prepare',
    subtitle: 'More than a question bank: an aviation ecosystem that helps you identify weaknesses and build knowledge.',
    items: [
      { id: '1', icon: '◎', title: 'Adaptive Mock Tests', text: 'Practice realistic DGCA-style questions and learn from every answer.' },
      { id: '2', icon: '✦', title: 'Intelligent Study Plans', text: 'Turn weak topics into a focused flight plan that fits your schedule.' },
      { id: '3', icon: '▣', title: 'RTR(A) Mock Exams', text: 'Build confidence with radio-telephony practice and exam simulations.' }
    ]
  },
  courses_section: {
    kicker: 'DGCA course bundles',
    title: 'Choose your learning path',
    subtitle: 'Explore published bundles, compare access, and start with the course that fits your flight plan.'
  },
  cta_banner: {
    heading: 'Ready for take-off?',
    subtitle: 'Start building a clearer path to your pilot licence today.',
    button_text: 'Create your student account →',
    button_url: '/register'
  },
  footer: {
    about: 'FlyCentric is an advanced DGCA aviation exam preparation ecosystem helping student pilots and cadet aspirants master ground training and clear DGCA exams on their first attempt.',
    support_email: 'support@flycentric.in',
    support_phone: '+91 98765 43210',
    address: 'New Delhi, India',
    copyright: '© 2026 FlyCentric. All rights reserved.',
    links: [
      { label: 'Courses', url: '/courses' },
      { label: 'Pricing', url: '/pricing' },
      { label: 'Jobs', url: '/jobs' },
      { label: 'Privacy Policy', url: '/privacy' },
      { label: 'Terms of Service', url: '/terms' }
    ]
  }
};

router.get('/homepage', async (req, res) => {
  const result = await pool.query(
    "SELECT value FROM system_settings WHERE key = 'homepage_content'"
  );
  if (!result.rows.length) {
    return res.json({ content: DEFAULT_HOMEPAGE });
  }
  res.json({ content: { ...DEFAULT_HOMEPAGE, ...result.rows[0].value } });
});

router.put('/homepage', authenticate, authorize('admin'), async (req, res) => {
  const content = req.body;
  if (!content || typeof content !== 'object') {
    return res.status(400).json({ error: 'content object required' });
  }
  const result = await pool.query(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ('homepage_content', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
     RETURNING value`,
    [JSON.stringify(content)]
  );
  res.json({ ok: true, content: result.rows[0].value });
});

router.invalidateTaxonomyCache = invalidateTaxonomyCache;
module.exports = router;


