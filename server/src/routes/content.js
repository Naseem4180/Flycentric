const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

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
  await pool.query('UPDATE subjects SET deleted_at = now() WHERE id = $1', [req.params.id]);
  await logAudit({ req, action: 'subject.delete', entityType: 'subject', entityId: req.params.id });
  res.json({ ok: true });
});

// ---- Chapters -----------------------------------------------------------------
router.get('/subjects/:subjectId/chapters', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM chapters WHERE subject_id = $1 AND deleted_at IS NULL ORDER BY order_index',
    [req.params.subjectId]
  );
  res.json({ chapters: result.rows });
});

router.post('/subjects/:subjectId/chapters', authenticate, authorize('admin'), async (req, res) => {
  const { title, order_index, is_free } = req.body;
  const result = await pool.query(
    'INSERT INTO chapters (subject_id, title, order_index, is_free) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.subjectId, title, order_index || 0, !!is_free]
  );
  res.status(201).json({ chapter: result.rows[0] });
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
  await pool.query('UPDATE chapters SET deleted_at = now() WHERE id = $1', [req.params.id]);
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
