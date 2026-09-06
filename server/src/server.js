require('dotenv').config();
// MUST be required before any route files are imported: it monkey-patches
// Express's router methods so that a rejected promise inside an
// `async (req, res) => {...}` handler is forwarded to the error-handling
// middleware below instead of leaving the HTTP request hanging forever
// with no response (which is what a missing/failed DB migration looked
// like from the browser — requests stuck at "(pending)" in devtools).
require('express-async-errors');
const express = require('express');
const nodePath = require('path');
const cors = require('cors');
const pool = require('./db/pool');

const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const questionRoutes = require('./routes/questions');
const examRoutes = require('./routes/exams');
const memoryBankRoutes = require('./routes/memorybank');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');
const batchRoutes = require('./routes/batches');
const doubtRoutes = require('./routes/doubts');
const jobRoutes = require('./routes/jobs');
const paymentRoutes = require('./routes/payments');
const notificationRoutes = require('./routes/notifications');
const uploadRoutes = require('./routes/uploads');

// Safety net: an unhandled rejection in a route (e.g. a bad query) should
// not take the whole API down. Log it; the request that triggered it will
// simply hang/timeout rather than crashing every other in-flight request.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

const app = express();

// CORS: restricted to an explicit allowlist (CORS_ORIGINS, comma-separated)
// in production. Falls back to permissive-with-a-warning in development so
// local/LAN dev setups (see api.js's hostname-based BASE_URL) keep working
// without every developer having to set the env var.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  console.warn('WARNING: CORS_ORIGINS is not set in production — no cross-origin requests will be allowed except same-origin/non-browser clients.');
}

app.use(cors({
  origin(origin, callback) {
    // No Origin header = same-origin request, curl/server-to-server call, or
    // a mobile app — never something a browser CORS policy needs to gate.
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Capture the raw request body alongside the parsed JSON: the Razorpay
// webhook signature (see routes/payments.js) is an HMAC over the exact raw
// bytes Razorpay sent, which is lost once JSON.parse has re-serialized it.
app.use(express.json({
  limit: '2mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

const apiGuide = {
  service: 'FlyCentric LMS API',
  status: 'online',
  health: '/api/health',
  documentation: {
    auth: ['/api/auth/register', '/api/auth/login', '/api/auth/me'],
    learning: ['/api/content/bundles', '/api/content/bundles/:bundleId/subjects', '/api/content/subjects/:subjectId/chapters'],
    exams: ['/api/exams/quizzes', '/api/exams/quizzes/:id/start', '/api/exams/attempts/mine'],
    admin: ['/api/admin/users', '/api/questions', '/api/payments'],
  },
  note: 'All application endpoints are namespaced under /api. Use the web app at http://localhost:5173.',
};

app.get('/', (req, res) => res.json(apiGuide));
app.get('/api', (req, res) => res.json(apiGuide));
const healthCheck = async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'flycentric-api', database: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ ok: false, service: 'flycentric-api', database: 'unavailable', error: 'PostgreSQL is not reachable', time: new Date().toISOString() });
  }
};

app.get(['/health', '/api/health'], healthCheck);

// Locally-stored uploads (question images) are served from disk. Mounted
// BEFORE the API routes and the 404 handler so /uploads/* resolves. On a
// deployment with S3_BUCKET set, files go to S3 and this mount is unused.
app.use('/uploads', express.static(nodePath.join(process.cwd(), 'uploads'), {
  maxAge: '7d',
  setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); },
}));

app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/memory-bank', memoryBankRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/doubts', doubtRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/uploads', uploadRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error(err);
  // In development, surface the real DB/driver error (e.g. "relation
  // \"bundle_subjects\" does not exist" when a migration hasn't been run
  // yet) so it's actually debuggable from the browser instead of a generic
  // 500 with no clue what broke.
  const detail = process.env.NODE_ENV === 'production' ? undefined : (err?.message || String(err));
  res.status(err?.status || 500).json({ error: 'Internal server error', detail });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`FlyCentric API listening on :${port}`);
  // Close attempts whose server deadline has already passed. This repairs
  // abandoned sessions from before the client started submitting on exit and
  // prevents them from remaining visible as "In Progress" indefinitely.
  pool.query(
    "UPDATE attempts SET status = 'expired' WHERE status = 'in_progress' AND deadline_at IS NOT NULL AND deadline_at < now()"
  ).catch((err) => console.error('Failed to expire stale attempts', err));
});
