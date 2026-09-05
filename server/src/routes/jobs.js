const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const result = await pool.query("SELECT * FROM job_postings WHERE status = 'open' ORDER BY created_at DESC");
  res.json({ jobs: result.rows });
});

router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { title, company, description, location } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = await pool.query(
    'INSERT INTO job_postings (title, company, description, location, posted_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [title, company || null, description || null, location || null, req.user.id]
  );
  res.status(201).json({ job: result.rows[0] });
});

router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { title, company, description, location, status } = req.body;
  const result = await pool.query(
    `UPDATE job_postings SET title=COALESCE($1,title), company=COALESCE($2,company), description=COALESCE($3,description),
       location=COALESCE($4,location), status=COALESCE($5,status) WHERE id=$6 RETURNING *`,
    [title, company, description, location, status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Job not found' });
  res.json({ job: result.rows[0] });
});

router.post('/:id/apply', authenticate, authorize('student'), async (req, res) => {
  const result = await pool.query(
    'INSERT INTO job_applications (job_id, student_id) VALUES ($1,$2) RETURNING *',
    [req.params.id, req.user.id]
  );
  res.status(201).json({ application: result.rows[0] });
});

router.get('/:id/applications', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `SELECT ja.*, u.name, u.email FROM job_applications ja JOIN users u ON u.id = ja.student_id
     WHERE ja.job_id = $1 ORDER BY ja.created_at DESC`,
    [req.params.id]
  );
  res.json({ applications: result.rows });
});

router.patch('/applications/:id', authenticate, authorize('admin'), async (req, res) => {
  const { status } = req.body;
  const result = await pool.query(
    'UPDATE job_applications SET status = $1 WHERE id = $2 RETURNING *',
    [status, req.params.id]
  );
  res.json({ application: result.rows[0] });
});

module.exports = router;
