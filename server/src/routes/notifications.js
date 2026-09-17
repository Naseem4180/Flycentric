const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

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

// ----------------------------------------------------------------------------
// Multi-Tiered Notification System with Scheduling
// ----------------------------------------------------------------------------
// Two admin-authored notification kinds:
//   - "ticker" (Soft): a clickable scrolling ticker line on the dashboard.
//   - "banner" (Hard): a prominent dashboard banner.
// Both carry a start/end window; only rows whose window currently contains
// "now" are ever served to students.

// Student/general: currently-active notifications only, filtered by audience.
router.get('/active', authenticate, async (req, res) => {
  const userRole = req.user ? req.user.role : 'all';
  let isPaidStudent = false;
  if (req.user && req.user.role === 'student') {
    const paidCheck = await pool.query(
      `SELECT 1 FROM bundle_access ba JOIN bundles b ON b.id = ba.bundle_id
       WHERE ba.user_id = $1 AND b.is_free = false AND b.price_inr > 0 LIMIT 1`,
      [req.user.id]
    );
    isPaidStudent = paidCheck.rows.length > 0;
  }

  const result = await pool.query(
    `SELECT id, type, content, link_url, start_datetime, end_datetime, target_audience
     FROM notifications
     WHERE is_active = true
       AND start_datetime <= now()
       AND (end_datetime IS NULL OR end_datetime >= now())
       AND (
         target_audience = 'all'
         OR (target_audience = 'students' AND $1 = 'student')
         OR (target_audience = 'instructors' AND $1 = 'instructor')
         OR (target_audience = 'paid' AND $2 = true)
         OR (target_audience = 'free' AND $1 = 'student' AND $2 = false)
         OR $1 = 'admin'
       )
     ORDER BY start_datetime DESC`,
    [userRole, isPaidStudent]
  );
  res.json({ notifications: result.rows });
});

// Admin: full list (including scheduled/expired/inactive) for the management UI.
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query('SELECT * FROM notifications ORDER BY start_datetime DESC, id DESC');
  res.json({ notifications: result.rows });
});

router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { type, content, link_url, start_datetime, end_datetime, is_active, target_audience } = req.body;
  if (!content || !String(content).trim()) return res.status(400).json({ error: 'content required' });
  if (!['ticker', 'banner'].includes(type)) return res.status(400).json({ error: "type must be 'ticker' or 'banner'" });
  const audience = ['all', 'students', 'instructors', 'paid', 'free'].includes(target_audience) ? target_audience : 'all';
  const result = await pool.query(
    `INSERT INTO notifications (type, content, link_url, start_datetime, end_datetime, is_active, created_by, target_audience)
     VALUES ($1,$2,$3, COALESCE($4, now()), $5, COALESCE($6, true), $7, $8) RETURNING *`,
    [type, content.trim(), link_url || null, start_datetime || null, end_datetime || null, is_active, req.user.id, audience]
  );
  await logAudit({ req, action: 'notification.create', entityType: 'notification', entityId: result.rows[0].id });
  res.status(201).json({ notification: result.rows[0] });
});

router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { type, content, link_url, start_datetime, end_datetime, is_active, target_audience } = req.body;
  const result = await pool.query(
    `UPDATE notifications SET
       type = COALESCE($1, type),
       content = COALESCE($2, content),
       link_url = CASE WHEN $8 THEN $3 ELSE link_url END,
       start_datetime = COALESCE($4, start_datetime),
       end_datetime = CASE WHEN $9 THEN $5 ELSE end_datetime END,
       is_active = COALESCE($6, is_active),
       target_audience = COALESCE($10, target_audience)
     WHERE id = $7 RETURNING *`,
    [type, content, link_url, start_datetime, end_datetime, is_active, req.params.id, link_url !== undefined, end_datetime !== undefined, target_audience]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Notification not found' });
  res.json({ notification: result.rows[0] });
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  await pool.query('DELETE FROM notifications WHERE id = $1', [req.params.id]);
  await logAudit({ req, action: 'notification.delete', entityType: 'notification', entityId: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
