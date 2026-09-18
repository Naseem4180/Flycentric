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
  const cached = sessionCache.get(sessionId);
  if (cached && cached.expiry > Date.now()) {
    return cached.isActive;
  }
  try {
    const res = await pool.query('SELECT is_active FROM user_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
    const isActive = res.rows.length ? !!res.rows[0].is_active : false;
    sessionCache.set(sessionId, { isActive, expiry: Date.now() + 10000 });
    return isActive;
  } catch {
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

