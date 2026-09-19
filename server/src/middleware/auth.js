const { verifyAccessToken } = require('../auth/tokens');
const pool = require('../db/pool');

const sessionCache = new Map(); // sessionId -> { isActive, expiry }

function invalidateSessionCache(sessionId) {
  if (sessionId) sessionCache.delete(sessionId);
}

function clearAllSessionCache() {
  sessionCache.clear();
}

async function checkSessionActive(sessionId, userId) {
  if (!sessionId) return true;
  const cached = sessionCache.get(sessionId);
  if (cached && cached.expiry > Date.now()) {
    return cached.isActive;
  }
  try {
    // Exam Protection: If the student is actively sitting an assessment,
    // their session must NEVER be terminated mid-exam by a background check.
    const activeAttempt = await pool.query(
      `SELECT 1 FROM attempts WHERE user_id = $1 AND status = 'in_progress' LIMIT 1`,
      [userId]
    );
    if (activeAttempt.rows.length > 0) {
      sessionCache.set(sessionId, { isActive: true, expiry: Date.now() + 60000 });
      return true;
    }

    const res = await pool.query('SELECT is_active FROM user_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
    // If no row exists (e.g. test token or restored session), do not block a cryptographically valid JWT.
    // Only terminate if an explicit row exists with is_active = false.
    const isActive = res.rows.length === 0 ? true : !!res.rows[0].is_active;
    sessionCache.set(sessionId, { isActive, expiry: Date.now() + 30000 });
    return isActive;
  } catch (err) {
    console.error('[checkSessionActive] DB error, defaulting to active:', err.message);
    return true;
  }
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing access token' });
  try {
    const payload = verifyAccessToken(token);
    // Concurrent session termination on another device ONLY applies to students
    if (payload.sid && payload.role === 'student') {
      const active = await checkSessionActive(payload.sid, payload.sub);
      if (!active) {
        console.warn(`[AUTH 401] Inactive session ${payload.sid} for student ${payload.sub} on ${req.method} ${req.originalUrl || req.path}`);
        return res.status(401).json({ error: 'Session terminated. You were logged in on another device.' });
      }
    }
    req.user = { id: payload.sub, role: payload.role, institution_id: payload.institution_id };
    req.sessionId = payload.sid || null;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Formal RBAC: pass allowed roles, e.g. authorize('admin', 'instructor')
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

module.exports = { authenticate, authorize, invalidateSessionCache, clearAllSessionCache };

