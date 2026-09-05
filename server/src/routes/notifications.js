const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Notifications themselves are synthesized client-side from /doubts and
// /questions/reports/queue. This route only tracks which of those synthetic
// notification keys (e.g. "report-14", "doubt-9") the current user has
// dismissed/read, so the bell can hide them and drop the unread count.

router.get('/reads', authenticate, async (req, res) => {
  const result = await pool.query('SELECT notification_key FROM notification_reads WHERE user_id = $1', [req.user.id]);
  res.json({ keys: result.rows.map((r) => r.notification_key) });
});

router.post('/reads', authenticate, async (req, res) => {
  const { key, keys } = req.body;
  const list = keys && Array.isArray(keys) ? keys : (key ? [key] : []);
  if (!list.length) return res.status(400).json({ error: 'key or keys[] required' });
  await pool.query(
    `INSERT INTO notification_reads (user_id, notification_key)
     SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
    [req.user.id, list]
  );
  res.status(201).json({ ok: true });
});

router.delete('/reads', authenticate, async (req, res) => {
  await pool.query('DELETE FROM notification_reads WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
