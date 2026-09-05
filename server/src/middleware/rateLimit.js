const rateLimit = require('express-rate-limit');

// Login specifically: brute-force protection at the spec'd 5 attempts / 15
// minutes. Kept separate from register/forgot-password (below) which have
// their own, slightly less aggressive limits so a mistyped password a few
// times doesn't collide with signup traffic from the same IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' },
  keyGenerator: (req) => `${req.ip}:${(req.body && req.body.email) || ''}`,
});

// Register/other auth actions: brute-force + account-enumeration protection.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
  // Keyed by IP + email so one flaky IP (shared NAT, campus wifi) doesn't
  // lock out every student behind it while still stopping a targeted attack.
  keyGenerator: (req) => `${req.ip}:${(req.body && req.body.email) || ''}`,
});

// Password reset request specifically: tighter, since it also triggers work
// (token generation) that shouldn't be trivially hammer-able.
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset requests. Please try again later.' },
  keyGenerator: (req) => `${req.ip}:${(req.body && req.body.email) || ''}`,
});

// Quiz submission: protects the scoring/attempt pipeline from replay/abuse
// without meaningfully affecting a real student (one legitimate submit).
const quizSubmitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submission attempts. Please slow down.' },
  keyGenerator: (req) => `${req.ip}:${req.user?.id || ''}`,
});

module.exports = { authLimiter, loginLimiter, passwordResetLimiter, quizSubmitLimiter };
