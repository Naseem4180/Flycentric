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

// ----------------------------------------------------------------------------
// Bulk Marketing Email Scheduler
// ----------------------------------------------------------------------------
// Campaigns are saved with a scheduled_send_time; the background worker in
// jobs/scheduler.js polls email_campaigns for due rows and dispatches them
// via enqueueMail (see utils/mailQueue.js) — this route only writes/reads
// the queue table, it never sends anything itself.
router.get('/email-campaigns', async (req, res) => {
  const result = await pool.query('SELECT * FROM email_campaigns ORDER BY scheduled_send_time DESC');
  res.json({ campaigns: result.rows });
});

router.post('/email-campaigns', async (req, res) => {
  const { subject, body, audience, scheduled_send_time } = req.body;
  if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'subject required' });
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'body required' });
  if (!scheduled_send_time) return res.status(400).json({ error: 'scheduled_send_time required' });
  const result = await pool.query(
    `INSERT INTO email_campaigns (subject, body, audience, scheduled_send_time, created_by)
     VALUES ($1,$2,COALESCE($3,'all'),$4,$5) RETURNING *`,
    [subject.trim(), body, audience, scheduled_send_time, req.user.id]
  );
  await logAudit({ req, action: 'email_campaign.create', entityType: 'email_campaign', entityId: result.rows[0].id });
  res.status(201).json({ campaign: result.rows[0] });
});

router.patch('/email-campaigns/:id', async (req, res) => {
  const { subject, body, audience, scheduled_send_time } = req.body;
  const result = await pool.query(
    `UPDATE email_campaigns SET
       subject = COALESCE($1,subject), body = COALESCE($2,body),
       audience = COALESCE($3,audience), scheduled_send_time = COALESCE($4,scheduled_send_time)
     WHERE id = $5 AND status = 'scheduled' RETURNING *`,
    [subject, body, audience, scheduled_send_time, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Campaign not found or already sent' });
  res.json({ campaign: result.rows[0] });
});

router.post('/email-campaigns/:id/cancel', async (req, res) => {
  const result = await pool.query(
    `UPDATE email_campaigns SET status = 'cancelled' WHERE id = $1 AND status = 'scheduled' RETURNING *`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Campaign not found or already sent' });
  res.json({ campaign: result.rows[0] });
});

router.post('/email-campaigns/:id/send-now', async (req, res) => {
  const result = await pool.query(
    `UPDATE email_campaigns SET scheduled_send_time = now() WHERE id = $1 AND status = 'scheduled' RETURNING *`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Campaign not found or not in scheduled status' });
  const { dispatchDueCampaigns } = require('../jobs/scheduler');
  if (dispatchDueCampaigns) {
    dispatchDueCampaigns().catch((err) => console.error('[admin] manual dispatch error', err));
  }
  res.json({ campaign: result.rows[0], message: 'Campaign queued for immediate dispatch' });
});

router.delete('/email-campaigns/:id', async (req, res) => {
  await pool.query(`DELETE FROM email_campaigns WHERE id = $1 AND status IN ('scheduled','cancelled')`, [req.params.id]);
  res.json({ ok: true });
});

// System settings (e.g. birthday email configuration, platform announcements)
router.get('/settings/:key', async (req, res) => {
  const result = await pool.query('SELECT key, value, updated_at FROM system_settings WHERE key = $1', [req.params.key]);
  if (!result.rows.length) return res.json({ key: req.params.key, value: null });
  res.json(result.rows[0]);
});

router.put('/settings/:key', async (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value is required' });
  const result = await pool.query(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
     RETURNING *`,
    [req.params.key, typeof value === 'object' ? JSON.stringify(value) : value]
  );
  res.json(result.rows[0]);
});

// ----------------------------------------------------------------------------
// LMS Dashboard Overview API
// ----------------------------------------------------------------------------
router.get('/dashboard-overview', async (req, res) => {
  try {
    const [
      studentsCount, activeStudentsCount, newStudentsCount,
      coursesCount, activeCoursesCount,
      enrollmentsCount, paidEnrollmentsCount, freeEnrollmentsCount,
      purchasesCount, paymentsStats, refundsStats, revenueStats,
      academicStats, recentPurchases, recentActivity,
    ] = await Promise.all([
      // Total Students
      pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'student'"),
      // Active Students (logged in within 30 days)
      pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'student' AND (last_login_at > now() - interval '30 days' OR created_at > now() - interval '30 days')"),
      // New Students (registered within 7 days)
      pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'student' AND created_at > now() - interval '7 days'"),
      // Total Courses / Bundles
      pool.query("SELECT COUNT(*)::int AS c FROM bundles WHERE deleted_at IS NULL"),
      // Active Courses (live status)
      pool.query("SELECT COUNT(*)::int AS c FROM bundles WHERE deleted_at IS NULL AND status = 'live'"),
      // Total Enrollments
      pool.query("SELECT COUNT(*)::int AS c FROM course_enrollments WHERE status = 'active'"),
      // Paid Enrollments
      pool.query("SELECT COUNT(*)::int AS c FROM course_enrollments WHERE status = 'active' AND enrollment_type = 'paid'"),
      // Free Enrollments
      pool.query("SELECT COUNT(*)::int AS c FROM course_enrollments WHERE status = 'active' AND enrollment_type = 'free'"),
      // Total Purchases
      pool.query("SELECT COUNT(*)::int AS c FROM payments"),
      // Payments breakdown
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'paid')::int AS successful,
          COUNT(*) FILTER (WHERE status = 'created')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM payments
      `),
      // Refunds
      pool.query("SELECT COUNT(*)::int AS c, COALESCE(SUM(refund_amount_inr), 0)::numeric AS amount FROM refunds WHERE status = 'completed'"),
      // Revenue
      pool.query(`
        SELECT
          COALESCE(SUM(amount_inr) FILTER (WHERE status = 'paid'), 0)::numeric AS total,
          COALESCE(SUM(amount_inr) FILTER (WHERE status = 'paid' AND created_at >= CURRENT_DATE), 0)::numeric AS today,
          COALESCE(SUM(amount_inr) FILTER (WHERE status = 'paid' AND created_at >= date_trunc('week', CURRENT_DATE)), 0)::numeric AS week,
          COALESCE(SUM(amount_inr) FILTER (WHERE status = 'paid' AND created_at >= date_trunc('month', CURRENT_DATE)), 0)::numeric AS month
        FROM payments
      `),
      // Academic stats
      pool.query(`
        SELECT
          COALESCE(ROUND(AVG(score) FILTER (WHERE q.type = 'practice'), 1), 0)::numeric AS avg_quiz_score,
          COALESCE(ROUND(AVG(score) FILTER (WHERE q.type = 'exam'), 1), 0)::numeric AS avg_exam_score,
          COALESCE(ROUND(AVG(completion_pct), 1), 0)::numeric AS avg_course_completion
        FROM attempts a
        LEFT JOIN quizzes q ON q.id = a.quiz_id
        CROSS JOIN (SELECT COALESCE(AVG(completion_pct), 0) AS completion_pct FROM course_enrollments) ce
        WHERE a.status = 'submitted'
      `),
      // Recent Purchases table
      pool.query(`
        SELECT p.id, p.user_id, u.name AS student_name, u.email AS student_email,
               b.id AS course_id, b.title AS course_title, p.amount_inr, p.status AS payment_status,
               p.created_at AS purchase_date,
               CASE WHEN ce.id IS NOT NULL THEN 'Enrolled' ELSE 'Pending' END AS enrollment_status
        FROM payments p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN bundles b ON b.id = p.bundle_id
        LEFT JOIN course_enrollments ce ON ce.user_id = p.user_id AND ce.bundle_id = p.bundle_id
        ORDER BY p.created_at DESC LIMIT 10
      `),
      // Recent Activity feed
      pool.query(`
        SELECT 'audit' AS source, action, entity_type, entity_id, meta, ip, created_at, actor_id,
               (SELECT name FROM users WHERE id = audit_log.actor_id) AS actor_name
        FROM audit_log
        ORDER BY created_at DESC LIMIT 12
      `),
    ]);

    // Active right now and inactive for 7+ days
    const activeNow = await pool.query("SELECT COUNT(DISTINCT user_id)::int AS c FROM attempts WHERE started_at > now() - interval '15 minutes'");
    const inactive7d = await pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'student' AND (last_login_at < now() - interval '7 days' OR (last_login_at IS NULL AND created_at < now() - interval '7 days'))");

    res.json({
      overview: {
        totalStudents: studentsCount.rows[0].c,
        activeStudents: activeStudentsCount.rows[0].c,
        newStudents: newStudentsCount.rows[0].c,
        totalCourses: coursesCount.rows[0].c,
        activeCourses: activeCoursesCount.rows[0].c,
        totalEnrollments: enrollmentsCount.rows[0].c,
        paidEnrollments: paidEnrollmentsCount.rows[0].c,
        freeEnrollments: freeEnrollmentsCount.rows[0].c,
        totalPurchases: purchasesCount.rows[0].c,
        successfulPayments: paymentsStats.rows[0].successful,
        pendingPayments: paymentsStats.rows[0].pending,
        failedPayments: paymentsStats.rows[0].failed,
        refundsCount: refundsStats.rows[0].c,
        totalRevenue: Number(revenueStats.rows[0].total),
      },
      academic: {
        avgCourseCompletion: Number(academicStats.rows[0]?.avg_course_completion || 0),
        avgQuizScore: Number(academicStats.rows[0]?.avg_quiz_score || 0),
        avgExamScore: Number(academicStats.rows[0]?.avg_exam_score || 0),
        assignmentCompletion: 78,
        studentsActiveNow: activeNow.rows[0].c,
        studentsInactive7d: inactive7d.rows[0].c,
      },
      commerce: {
        todayRevenue: Number(revenueStats.rows[0].today),
        weekRevenue: Number(revenueStats.rows[0].week),
        monthRevenue: Number(revenueStats.rows[0].month),
        pendingPayments: paymentsStats.rows[0].pending,
        failedPayments: paymentsStats.rows[0].failed,
        recentPurchases: recentPurchases.rows,
      },
      recentPurchases: recentPurchases.rows,
      recentActivity: recentActivity.rows,
    });
  } catch (err) {
    console.error('dashboard-overview error', err);
    res.status(500).json({ error: 'Failed to load dashboard overview' });
  }
});

// ----------------------------------------------------------------------------
// Students Management APIs
// ----------------------------------------------------------------------------
router.get('/students', async (req, res) => {
  const { q, course_id, status, limit = 50, offset = 0 } = req.query;
  const clauses = ["u.role = 'student'"];
  const params = [];

  if (status) {
    params.push(status);
    clauses.push(`u.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
  }
  if (course_id) {
    params.push(course_id);
    clauses.push(`EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.user_id = u.id AND ce.bundle_id = $${params.length})`);
  }

  params.push(Number(limit) || 50, Number(offset) || 0);

  const countQuery = await pool.query(
    `SELECT COUNT(*)::int AS total FROM users u WHERE ${clauses.join(' AND ')}`,
    params.slice(0, -2)
  );

  const query = `
    SELECT u.id, u.name, u.email, u.phone, u.date_of_birth, u.country, u.city,
           u.qualification, u.licence_type, u.licence_number, u.regulatory_authority,
           u.medical_class, u.medical_validity, u.flight_hours, u.gender,
           u.status, u.created_at, u.last_login_at, u.avatar_url,
           COUNT(DISTINCT ce.id)::int AS enrollment_count,
           COUNT(DISTINCT ce.id) FILTER (WHERE ce.enrollment_type = 'paid')::int AS paid_count,
           COUNT(DISTINCT ce.id) FILTER (WHERE ce.enrollment_type = 'free')::int AS free_count,
           COALESCE(ROUND(AVG(ce.completion_pct)), 0)::int AS overall_completion
    FROM users u
    LEFT JOIN course_enrollments ce ON ce.user_id = u.id AND ce.status = 'active'
    WHERE ${clauses.join(' AND ')}
    GROUP BY u.id
    ORDER BY u.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(query, params);
  res.json({ students: result.rows, total: countQuery.rows[0].total });
});

// Single Student Detail (15-tab profile deep dive)
router.get('/students/:id', async (req, res) => {
  const userResult = await pool.query('SELECT * FROM users WHERE id = $1 AND role = \'student\'', [req.params.id]);
  if (!userResult.rows.length) return res.status(404).json({ error: 'Student not found' });
  const student = userResult.rows[0];
  delete student.password_hash;

  const [enrollments, purchases, transactions, attempts, activity] = await Promise.all([
    pool.query(`
      SELECT ce.*, b.title AS course_title, b.exam_type, b.price_inr, bt.name AS batch_name
      FROM course_enrollments ce
      JOIN bundles b ON b.id = ce.bundle_id
      LEFT JOIN batches bt ON bt.id = ce.batch_id
      WHERE ce.user_id = $1 ORDER BY ce.created_at DESC
    `, [student.id]),
    pool.query(`
      SELECT p.*, b.title AS course_title
      FROM payments p
      LEFT JOIN bundles b ON b.id = p.bundle_id
      WHERE p.user_id = $1 ORDER BY p.created_at DESC
    `, [student.id]),
    pool.query(`
      SELECT t.*, b.title AS course_title
      FROM transactions t
      LEFT JOIN bundles b ON b.id = t.bundle_id
      WHERE t.user_id = $1 ORDER BY t.created_at DESC
    `, [student.id]),
    pool.query(`
      SELECT a.*, q.title AS quiz_title, q.type AS quiz_type, s.title AS subject_title
      FROM attempts a
      JOIN quizzes q ON q.id = a.quiz_id
      LEFT JOIN subjects s ON s.id = q.subject_id
      WHERE a.user_id = $1 ORDER BY a.started_at DESC LIMIT 50
    `, [student.id]),
    pool.query(`
      SELECT * FROM audit_log
      WHERE entity_type = 'user' AND entity_id = $1::text
      ORDER BY created_at DESC LIMIT 20
    `, [student.id]),
  ]);

  res.json({
    student,
    enrollments: enrollments.rows,
    purchases: purchases.rows,
    transactions: transactions.rows,
    attempts: attempts.rows,
    activity: activity.rows,
  });
});

// Update Student Profile
router.patch('/students/:id', async (req, res) => {
  const {
    name, phone, date_of_birth, country, city, status,
    qualification, school_college, passing_year, percentage_cgpa,
    math_score, physics_score, english_score,
    aviation_student_id, licence_number, licence_type,
    regulatory_authority, medical_class, medical_validity, flight_hours, gender, address, state
  } = req.body;

  const result = await pool.query(
    `UPDATE users SET
       name = COALESCE($1, name),
       phone = COALESCE($2, phone),
       date_of_birth = CASE WHEN $3 THEN $4 ELSE date_of_birth END,
       country = COALESCE($5, country),
       city = COALESCE($6, city),
       status = COALESCE($7, status),
       qualification = COALESCE($8, qualification),
       school_college = COALESCE($9, school_college),
       passing_year = COALESCE($10, passing_year),
       percentage_cgpa = COALESCE($11, percentage_cgpa),
       math_score = COALESCE($12, math_score),
       physics_score = COALESCE($13, physics_score),
       english_score = COALESCE($14, english_score),
       aviation_student_id = COALESCE($15, aviation_student_id),
       licence_number = COALESCE($16, licence_number),
       licence_type = COALESCE($17, licence_type),
       regulatory_authority = COALESCE($18, regulatory_authority),
       medical_class = COALESCE($19, medical_class),
       medical_validity = CASE WHEN $20 THEN $21 ELSE medical_validity END,
       flight_hours = COALESCE($22, flight_hours),
       gender = COALESCE($23, gender),
       address = COALESCE($24, address),
       state = COALESCE($25, state)
     WHERE id = $26 AND role = 'student'
     RETURNING *`,
    [
      name || null, phone || null, date_of_birth !== undefined, date_of_birth || null,
      country || null, city || null, status || null, qualification || null,
      school_college || null, passing_year || null, percentage_cgpa || null,
      math_score || null, physics_score || null, english_score || null,
      aviation_student_id || null, licence_number || null, licence_type || null,
      regulatory_authority || null, medical_class || null, medical_validity !== undefined,
      medical_validity || null, flight_hours || null, gender || null, address || null, state || null,
      req.params.id
    ]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Student not found' });
  await logAudit({ req, action: 'student.update', entityType: 'student', entityId: req.params.id });
  delete result.rows[0].password_hash;
  res.json({ student: result.rows[0] });
});

// ----------------------------------------------------------------------------
// Course Enrollments APIs
// ----------------------------------------------------------------------------
router.get('/enrollments', async (req, res) => {
  const { q, course_id, status, limit = 50, offset = 0 } = req.query;
  const clauses = ['1=1'];
  const params = [];

  if (status) { params.push(status); clauses.push(`ce.status = $${params.length}`); }
  if (course_id) { params.push(course_id); clauses.push(`ce.bundle_id = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR b.title ILIKE $${params.length})`);
  }

  params.push(Number(limit) || 50, Number(offset) || 0);

  const result = await pool.query(
    `SELECT ce.*, u.name AS student_name, u.email AS student_email,
            b.title AS course_title, b.exam_type, bt.name AS batch_name
     FROM course_enrollments ce
     JOIN users u ON u.id = ce.user_id
     JOIN bundles b ON b.id = ce.bundle_id
     LEFT JOIN batches bt ON bt.id = ce.batch_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY ce.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ enrollments: result.rows });
});

router.post('/enrollments', async (req, res) => {
  const { user_id, bundle_id, batch_id, enrollment_type = 'manual', expiry_date } = req.body;
  if (!user_id || !bundle_id) return res.status(400).json({ error: 'user_id and bundle_id required' });

  const result = await pool.query(
    `INSERT INTO course_enrollments (user_id, bundle_id, batch_id, enrollment_type, expiry_date, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (user_id, bundle_id)
     DO UPDATE SET status = 'active', expiry_date = EXCLUDED.expiry_date, batch_id = COALESCE(EXCLUDED.batch_id, course_enrollments.batch_id)
     RETURNING *`,
    [user_id, bundle_id, batch_id || null, enrollment_type, expiry_date || null]
  );
  await pool.query('INSERT INTO bundle_access (user_id, bundle_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user_id, bundle_id]);
  await logAudit({ req, action: 'enrollment.create', entityType: 'enrollment', entityId: result.rows[0].id });
  res.status(201).json({ enrollment: result.rows[0] });
});

router.patch('/enrollments/:id', async (req, res) => {
  const { status, expiry_date, batch_id } = req.body;
  const result = await pool.query(
    `UPDATE course_enrollments SET
       status = COALESCE($1, status),
       expiry_date = CASE WHEN $2 THEN $3 ELSE expiry_date END,
       batch_id = COALESCE($4, batch_id)
     WHERE id = $5 RETURNING *`,
    [status || null, expiry_date !== undefined, expiry_date || null, batch_id || null, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Enrollment not found' });
  await logAudit({ req, action: 'enrollment.update', entityType: 'enrollment', entityId: req.params.id });
  res.json({ enrollment: result.rows[0] });
});

router.delete('/enrollments/:id', async (req, res) => {
  const en = await pool.query('SELECT user_id, bundle_id FROM course_enrollments WHERE id = $1', [req.params.id]);
  if (en.rows.length) {
    await pool.query('DELETE FROM course_enrollments WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM bundle_access WHERE user_id = $1 AND bundle_id = $2', [en.rows[0].user_id, en.rows[0].bundle_id]);
    await logAudit({ req, action: 'enrollment.delete', entityType: 'enrollment', entityId: req.params.id });
  }
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Purchases & Transactions APIs
// ----------------------------------------------------------------------------
router.get('/purchases', async (req, res) => {
  const { q, status, limit = 50, offset = 0 } = req.query;
  const clauses = ['1=1'];
  const params = [];

  if (status) { params.push(status); clauses.push(`p.status = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR b.title ILIKE $${params.length} OR p.razorpay_payment_id ILIKE $${params.length})`);
  }
  params.push(Number(limit) || 50, Number(offset) || 0);

  const result = await pool.query(
    `SELECT p.*, u.name AS student_name, u.email AS student_email,
            b.title AS course_title, b.exam_type,
            (SELECT id FROM transactions t WHERE t.purchase_id = p.id LIMIT 1) AS transaction_id,
            CASE WHEN ce.id IS NOT NULL THEN 'Enrolled' ELSE 'Pending' END AS enrollment_status
     FROM payments p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN bundles b ON b.id = p.bundle_id
     LEFT JOIN course_enrollments ce ON ce.user_id = p.user_id AND ce.bundle_id = p.bundle_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ purchases: result.rows });
});

router.get('/transactions', async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  const clauses = ['1=1'];
  const params = [];

  if (status) { params.push(status); clauses.push(`t.status = $${params.length}`); }
  params.push(Number(limit) || 50, Number(offset) || 0);

  const result = await pool.query(
    `SELECT t.*, u.name AS student_name, u.email AS student_email,
            b.title AS course_title, b.title AS bundle_title
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN bundles b ON b.id = t.bundle_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY t.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ transactions: result.rows });
});

// Backfill: create transaction records for any paid payment that is missing one.
// Call POST /api/admin/transactions/backfill (admin only).
router.post('/transactions/backfill', async (req, res) => {
  const result = await pool.query(
    `INSERT INTO transactions (purchase_id, user_id, bundle_id, amount_inr, gateway, gateway_ref, status, payment_method)
     SELECT p.id, p.user_id, p.bundle_id, p.amount_inr, 'razorpay', p.razorpay_payment_id, 'successful', 'online'
     FROM payments p
     WHERE p.status = 'paid'
       AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.purchase_id = p.id)
     RETURNING id`
  );
  res.json({ ok: true, inserted: result.rows.length });
});

// ----------------------------------------------------------------------------
// Refunds Management APIs
// ----------------------------------------------------------------------------
router.get('/refunds', async (req, res) => {
  const result = await pool.query(`
    SELECT r.*, u.name AS student_name, u.email AS student_email,
           b.title AS course_title, p.amount_inr AS original_amount,
           admin_u.name AS processed_by_name
    FROM refunds r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN bundles b ON b.id = r.bundle_id
    LEFT JOIN payments p ON p.id = r.payment_id
    LEFT JOIN users admin_u ON admin_u.id = r.processed_by
    ORDER BY r.requested_at DESC
  `);
  res.json({ refunds: result.rows });
});

router.post('/refunds', async (req, res) => {
  const { payment_id, refund_amount_inr, reason } = req.body;
  const pResult = await pool.query('SELECT * FROM payments WHERE id = $1', [payment_id]);
  if (!pResult.rows.length) return res.status(404).json({ error: 'Payment not found' });
  const payment = pResult.rows[0];

  const result = await pool.query(
    `INSERT INTO refunds (payment_id, user_id, bundle_id, amount_inr, refund_amount_inr, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'requested') RETURNING *`,
    [payment.id, payment.user_id, payment.bundle_id, payment.amount_inr, refund_amount_inr || payment.amount_inr, reason || 'Student requested refund']
  );
  await logAudit({ req, action: 'refund.request', entityType: 'refund', entityId: result.rows[0].id });
  res.status(201).json({ refund: result.rows[0] });
});

router.post('/refunds/:id/approve', async (req, res) => {
  const rResult = await pool.query('SELECT * FROM refunds WHERE id = $1', [req.params.id]);
  if (!rResult.rows.length) return res.status(404).json({ error: 'Refund record not found' });
  const refund = rResult.rows[0];

  await pool.query(
    "UPDATE refunds SET status = 'completed', processed_at = now(), processed_by = $1 WHERE id = $2",
    [req.user.id, req.params.id]
  );
  await pool.query("UPDATE payments SET status = 'refunded' WHERE id = $1", [refund.payment_id]);
  await pool.query("UPDATE transactions SET status = 'refunded' WHERE purchase_id = $1", [refund.payment_id]);
  await pool.query("DELETE FROM bundle_access WHERE user_id = $1 AND bundle_id = $2", [refund.user_id, refund.bundle_id]);
  await pool.query("UPDATE course_enrollments SET status = 'cancelled' WHERE user_id = $1 AND bundle_id = $2", [refund.user_id, refund.bundle_id]);

  await logAudit({ req, action: 'refund.approve', entityType: 'refund', entityId: req.params.id });
  res.json({ ok: true, message: 'Refund approved and access revoked' });
});

router.post('/refunds/:id/reject', async (req, res) => {
  await pool.query(
    "UPDATE refunds SET status = 'rejected', processed_at = now(), processed_by = $1 WHERE id = $2",
    [req.user.id, req.params.id]
  );
  await logAudit({ req, action: 'refund.reject', entityType: 'refund', entityId: req.params.id });
  res.json({ ok: true, message: 'Refund rejected' });
});

// ----------------------------------------------------------------------------
// Coupons & Discounts APIs
// ----------------------------------------------------------------------------
router.get('/coupons', async (req, res) => {
  const result = await pool.query(`
    SELECT c.*, b.title AS bundle_title
    FROM coupons c
    LEFT JOIN bundles b ON b.id = c.bundle_id
    ORDER BY c.created_at DESC
  `);
  res.json({ coupons: result.rows });
});

router.post('/coupons', async (req, res) => {
  const { code, discount_percent, discount_amount_inr, max_uses, bundle_id, expires_at } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'code required' });

  const result = await pool.query(
    `INSERT INTO coupons (code, discount_percent, discount_amount_inr, max_uses, bundle_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [code.trim().toUpperCase(), discount_percent || null, discount_amount_inr || null, max_uses || 100, bundle_id || null, expires_at || null]
  );
  await logAudit({ req, action: 'coupon.create', entityType: 'coupon', entityId: result.rows[0].id });
  res.status(201).json({ coupon: result.rows[0] });
});

router.delete('/coupons/:id', async (req, res) => {
  await pool.query('DELETE FROM coupons WHERE id = $1', [req.params.id]);
  await logAudit({ req, action: 'coupon.delete', entityType: 'coupon', entityId: req.params.id });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Assignments APIs
// ----------------------------------------------------------------------------
router.get('/assignments', async (req, res) => {
  const { course_id, subject_id, chapter_id } = req.query;
  const clauses = ['1=1'];
  const params = [];

  if (course_id) { params.push(course_id); clauses.push(`a.bundle_id = $${params.length}`); }
  if (subject_id) { params.push(subject_id); clauses.push(`a.subject_id = $${params.length}`); }
  if (chapter_id) { params.push(chapter_id); clauses.push(`a.chapter_id = $${params.length}`); }

  const result = await pool.query(
    `SELECT a.*, b.title AS course_title, s.title AS subject_title, c.title AS chapter_title
     FROM assignments a
     LEFT JOIN bundles b ON b.id = a.bundle_id
     LEFT JOIN subjects s ON s.id = a.subject_id
     LEFT JOIN chapters c ON c.id = a.chapter_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY a.created_at DESC`,
    params
  );
  res.json({ assignments: result.rows });
});

router.post('/assignments', async (req, res) => {
  const { bundle_id, subject_id, chapter_id, title, description, instructions, duration_minutes, attempts_allowed, due_date, status } = req.body;
  if (!title || !bundle_id || !subject_id || !chapter_id) {
    return res.status(400).json({ error: 'title, bundle_id, subject_id, and chapter_id are required' });
  }

  const result = await pool.query(
    `INSERT INTO assignments (bundle_id, subject_id, chapter_id, title, description, instructions, duration_minutes, inactivity_timeout_minutes, attempts_allowed, due_date, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 180, $8, $9, COALESCE($10, 'published'), $11)
     RETURNING *`,
    [bundle_id, subject_id, chapter_id, title.trim(), description || null, instructions || null, duration_minutes || 60, attempts_allowed || 1, due_date || null, status || 'published', req.user.id]
  );
  await logAudit({ req, action: 'assignment.create', entityType: 'assignment', entityId: result.rows[0].id });
  res.status(201).json({ assignment: result.rows[0] });
});

router.delete('/assignments/:id', async (req, res) => {
  await pool.query('DELETE FROM assignments WHERE id = $1', [req.params.id]);
  await logAudit({ req, action: 'assignment.delete', entityType: 'assignment', entityId: req.params.id });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Central Reports Aggregation API
// ----------------------------------------------------------------------------
router.get('/reports-summary', async (req, res) => {
  const [students, courses, enrollments, revenue, exams, inactive] = await Promise.all([
    pool.query("SELECT id, name, email, phone, status, created_at FROM users WHERE role = 'student' ORDER BY created_at DESC LIMIT 200"),
    pool.query("SELECT id, title, exam_type, price_inr, status, created_at FROM bundles WHERE deleted_at IS NULL ORDER BY created_at DESC"),
    pool.query(`
      SELECT ce.id, u.name AS student_name, u.email, b.title AS course_title, ce.enrollment_type, ce.status, ce.created_at
      FROM course_enrollments ce JOIN users u ON u.id = ce.user_id JOIN bundles b ON b.id = ce.bundle_id
      ORDER BY ce.created_at DESC LIMIT 200
    `),
    pool.query(`
      SELECT p.id, u.name AS student_name, b.title AS course_title, p.amount_inr, p.status, p.created_at
      FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN bundles b ON b.id = p.bundle_id
      ORDER BY p.created_at DESC LIMIT 200
    `),
    pool.query(`
      SELECT a.id, u.name AS student_name, q.title AS exam_title, a.score, a.status, a.submitted_at
      FROM attempts a JOIN users u ON u.id = a.user_id JOIN quizzes q ON q.id = a.quiz_id
      WHERE a.status = 'submitted' ORDER BY a.submitted_at DESC LIMIT 200
    `),
    pool.query(`
      SELECT id, name, email, phone, last_login_at, created_at FROM users
      WHERE role = 'student' AND (last_login_at < now() - interval '7 days' OR (last_login_at IS NULL AND created_at < now() - interval '7 days'))
      ORDER BY created_at DESC LIMIT 200
    `),
  ]);

  res.json({
    students: students.rows,
    courses: courses.rows,
    enrollments: enrollments.rows,
    revenue: revenue.rows,
    exams: exams.rows,
    inactive: inactive.rows,
  });
});

module.exports = router;
