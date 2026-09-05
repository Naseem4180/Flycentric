const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.post('/', authorize('student'), async (req, res) => {
  const { batch_id, question_id, message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const result = await pool.query(
    'INSERT INTO doubts (student_id, batch_id, question_id, message) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, batch_id || null, question_id || null, message]
  );
  res.status(201).json({ doubt: result.rows[0] });
});

router.get('/', async (req, res) => {
  const clauses = [];
  const params = [];
  if (req.user.role === 'student') { params.push(req.user.id); clauses.push(`student_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(`SELECT d.*, u.name AS student_name, u.email AS student_email,
    q.question_text FROM doubts d JOIN users u ON u.id = d.student_id
    LEFT JOIN questions q ON q.id = d.question_id ${where.replaceAll('student_id', 'd.student_id')} ORDER BY d.created_at DESC`, params);
  res.json({ doubts: result.rows });
});

router.patch('/:id', authorize('admin', 'instructor'), async (req, res) => {
  const { response, status } = req.body;
  const result = await pool.query(
    `UPDATE doubts SET response = COALESCE($1,response), status = COALESCE($2,status) WHERE id = $3 RETURNING *`,
    [response, status || 'answered', req.params.id]
  );
  res.json({ doubt: result.rows[0] });
});

module.exports = router;
