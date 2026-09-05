const express = require('express');
const bcrypt = require('bcryptjs');
const { parse } = require('csv-parse/sync');
const multer = require('multer');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authenticate, authorize('admin'));

// All-User Management Console --------------------------------------------------
router.get('/users', async (req, res) => {
  const { role, q, limit = 50, offset = 0 } = req.query;
  const clauses = ['1=1'];
  const params = [];
  if (role) { params.push(role); clauses.push(`role = $${params.length}`); }
  if (q) { params.push(`%${q}%`); clauses.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`); }
  params.push(limit, offset);
  const result = await pool.query(
    `SELECT id, email, name, role, institution_id, status, created_at FROM users WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ users: result.rows });
});

router.post('/users', async (req, res) => {
  const { email, password, name, role, institution_id } = req.body;
  if (!email || !password || !name || !role) return res.status(400).json({ error: 'email, password, name, role required' });
  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, institution_id) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, email, name, role, institution_id, status, created_at`,
    [email, hash, name, role, institution_id || null]
  );
  res.status(201).json({ user: result.rows[0] });
});

router.patch('/users/:id', async (req, res) => {
  const { name, role, institution_id, status } = req.body;
  const before = await pool.query('SELECT role, status FROM users WHERE id = $1', [req.params.id]);
  const result = await pool.query(
    `UPDATE users SET name = COALESCE($1,name), role = COALESCE($2,role),
       institution_id = COALESCE($3,institution_id), status = COALESCE($4,status)
     WHERE id = $5 RETURNING id, email, name, role, institution_id, status`,
    [name, role, institution_id, status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  if (before.rows.length && (role || status)) {
    await logAudit({
      req, action: 'user.update', entityType: 'user', entityId: req.params.id,
      meta: { before: before.rows[0], after: { role: result.rows[0].role, status: result.rows[0].status } },
    });
  }
  res.json({ user: result.rows[0] });
});

router.post('/users/:id/suspend', async (req, res) => {
  const result = await pool.query(
    "UPDATE users SET status = 'suspended' WHERE id = $1 RETURNING id, status", [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  await logAudit({ req, action: 'user.suspend', entityType: 'user', entityId: req.params.id });
  res.json({ user: result.rows[0] });
});

router.post('/users/:id/reactivate', async (req, res) => {
  const result = await pool.query(
    "UPDATE users SET status = 'active' WHERE id = $1 RETURNING id, status", [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  await logAudit({ req, action: 'user.reactivate', entityType: 'user', entityId: req.params.id });
  res.json({ user: result.rows[0] });
});

// CSV export of all users -------------------------------------------------------
router.get('/users/export', async (req, res) => {
  const result = await pool.query('SELECT id, email, name, role, status, created_at FROM users ORDER BY created_at DESC');
  const header = 'id,email,name,role,status,created_at\n';
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = result.rows.map((u) => [u.id, esc(u.email), esc(u.name), u.role, u.status, u.created_at.toISOString()].join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
  res.send(header + rows.join('\n'));
});

// Bulk user upload (CSV: email,password,name,role) ------------------------------
router.post('/users/bulk', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file required (field name "file")' });
  const records = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
  let created = 0;
  const errors = [];
  for (const [idx, row] of records.entries()) {
    try {
      if (!row.email || !row.password || !row.name || !row.role) throw new Error('Missing required field');
      const hash = await bcrypt.hash(row.password, 10);
      await pool.query(
        'INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4)',
        [row.email, hash, row.name, row.role]
      );
      created += 1;
    } catch (err) {
      errors.push({ row: idx + 2, error: err.message });
    }
  }
  res.json({ created, errors, totalRows: records.length });
});

// Bulk role assignment ------------------------------------------------------------
router.post('/users/bulk-role', async (req, res) => {
  const { userIds, role } = req.body;
  if (!Array.isArray(userIds) || !role) return res.status(400).json({ error: 'userIds[] and role required' });
  await pool.query('UPDATE users SET role = $1 WHERE id = ANY($2)', [role, userIds]);
  await logAudit({ req, action: 'user.bulk_role', entityType: 'user', meta: { userIds, role } });
  res.json({ ok: true, updated: userIds.length });
});

// Bulk content publish/unpublish ---------------------------------------------------
router.post('/bundles/bulk-status', async (req, res) => {
  const { bundleIds, status } = req.body;
  if (!Array.isArray(bundleIds) || !['draft', 'live'].includes(status)) {
    return res.status(400).json({ error: 'bundleIds[] and valid status required' });
  }
  await pool.query('UPDATE bundles SET status = $1 WHERE id = ANY($2)', [status, bundleIds]);
  await logAudit({ req, action: 'bundle.bulk_status', entityType: 'bundle', meta: { bundleIds, status } });
  res.json({ ok: true, updated: bundleIds.length });
});

// Institutions ------------------------------------------------------------------------
router.get('/institutions', async (req, res) => {
  const result = await pool.query('SELECT * FROM institutions ORDER BY name');
  res.json({ institutions: result.rows });
});

router.post('/institutions', async (req, res) => {
  const { name, slug, branding } = req.body;
  const result = await pool.query(
    'INSERT INTO institutions (name, slug, branding) VALUES ($1,$2,$3) RETURNING *',
    [name, slug, branding || {}]
  );
  res.status(201).json({ institution: result.rows[0] });
});

// Platform Settings ---------------------------------------------------------------
router.get('/settings', async (req, res) => {
  const result = await pool.query('SELECT key, value FROM settings');
  const settings = {};
  for (const row of result.rows) settings[row.key] = row.value;
  res.json({ settings });
});

router.put('/settings', async (req, res) => {
  const entries = Object.entries(req.body || {});
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [key, JSON.stringify(value)]
    );
  }
  await logAudit({ req, action: 'settings.update', entityType: 'settings', meta: { keys: entries.map(([k]) => k) } });
  const result = await pool.query('SELECT key, value FROM settings');
  const settings = {};
  for (const row of result.rows) settings[row.key] = row.value;
  res.json({ settings });
});

// Audit Log ------------------------------------------------------------------------
// Read-only view of the append-only audit_log table for admins. Supports
// filtering by action prefix (e.g. "user.", "payment.") and actor.
router.get('/audit-log', async (req, res) => {
  const { action, actor_id, limit = 100, offset = 0 } = req.query;
  const clauses = ['1=1'];
  const params = [];
  if (action) { params.push(`${action}%`); clauses.push(`a.action ILIKE $${params.length}`); }
  if (actor_id) { params.push(actor_id); clauses.push(`a.actor_id = $${params.length}`); }
  params.push(Math.min(Number(limit) || 100, 500), Number(offset) || 0);
  const result = await pool.query(
    `SELECT a.id, a.actor_id, a.actor_role, u.name AS actor_name, u.email AS actor_email,
            a.action, a.entity_type, a.entity_id, a.meta, a.ip, a.created_at
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ entries: result.rows });
});

module.exports = router;
