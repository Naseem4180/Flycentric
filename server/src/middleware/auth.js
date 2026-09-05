const { verifyAccessToken } = require('../auth/tokens');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing access token' });
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, institution_id: payload.institution_id };
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

module.exports = { authenticate, authorize };
