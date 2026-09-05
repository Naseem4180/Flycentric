const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize('admin', 'instructor', 'institution'), async (req, res) => {
  const clauses = ['1=1'];
  const params = [];
  if (req.user.role === 'instructor') { params.push(req.user.id); clauses.push(`b.instructor_id = $${params.length}`); }
  if (req.user.role === 'institution') { params.push(req.user.institution_id); clauses.push(`b.institution_id = $${params.length}`); }
  const result = await pool.query(
    `SELECT b.*, u.name AS instructor_name, u.email AS instructor_email,
            COUNT(DISTINCT bs.student_id)::int AS student_count
     FROM batches b
     LEFT JOIN users u ON u.id = b.instructor_id
     LEFT JOIN batch_students bs ON bs.batch_id = b.id
     WHERE ${clauses.join(' AND ')} GROUP BY b.id, u.name, u.email ORDER BY b.created_at DESC`,
    params
  );
  res.json({ batches: result.rows });
});

router.post('/', authorize('admin', 'instructor', 'institution'), async (req, res) => {
  const { name, instructor_id, institution_id, schedule } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = await pool.query(
    'INSERT INTO batches (name, instructor_id, institution_id, schedule) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, instructor_id || (req.user.role === 'instructor' ? req.user.id : null), institution_id || req.user.institution_id || null, schedule || null]
  );
  res.status(201).json({ batch: result.rows[0] });
});

router.patch('/:id', authorize('admin', 'instructor', 'institution'), async (req, res) => {
  const { name, instructor_id, schedule } = req.body;
  const result = await pool.query(
    `UPDATE batches SET name = COALESCE($1,name), instructor_id = COALESCE($2,instructor_id), schedule = COALESCE($3,schedule)
     WHERE id = $4 RETURNING *`,
    [name, instructor_id, schedule, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Batch not found' });
  res.json({ batch: result.rows[0] });
});

router.delete('/:id', authorize('admin'), async (req, res) => {
  await pool.query('DELETE FROM batches WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/:id/students', authorize('admin', 'instructor', 'institution'), async (req, res) => {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds)) return res.status(400).json({ error: 'studentIds[] required' });
  const values = studentIds.map((sid) => `(${req.params.id}, ${Number(sid)})`).join(',');
  if (values) await pool.query(`INSERT INTO batch_students (batch_id, student_id) VALUES ${values} ON CONFLICT DO NOTHING`);
  res.json({ ok: true, added: studentIds.length });
});

router.delete('/:id/students/:studentId', authorize('admin', 'instructor', 'institution'), async (req, res) => {
  await pool.query('DELETE FROM batch_students WHERE batch_id = $1 AND student_id = $2', [req.params.id, req.params.studentId]);
  res.json({ ok: true });
});

router.get('/:id/students', authorize('admin', 'instructor', 'institution'), async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email FROM batch_students bs JOIN users u ON u.id = bs.student_id WHERE bs.batch_id = $1`,
    [req.params.id]
  );
  res.json({ students: result.rows });
});

// Notes upload (metadata only here — file bytes would go to Cloud Storage in prod)
router.post('/:id/notes', authorize('admin', 'instructor'), async (req, res) => {
  const { title, file_url } = req.body;
  const result = await pool.query(
    'INSERT INTO notes (batch_id, uploaded_by, title, file_url) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id, req.user.id, title, file_url || null]
  );
  res.status(201).json({ note: result.rows[0] });
});

router.get('/:id/notes', async (req, res) => {
  const result = await pool.query('SELECT * FROM notes WHERE batch_id = $1 ORDER BY created_at DESC', [req.params.id]);
  res.json({ notes: result.rows });
});

module.exports = router;
