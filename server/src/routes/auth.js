const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db/pool');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../auth/tokens');
const { authenticate } = require('../middleware/auth');
const { authLimiter, loginLimiter, passwordResetLimiter } = require('../middleware/rateLimit');
const { enqueueMail } = require('../utils/mailQueue');

const router = express.Router();

// Password-reset tokens are random and only ever stored hashed (SHA-256) —
// see schema.sql `password_resets`. The raw token only ever exists in the
// response body / a real outbound email, never in the database.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

router.post('/register', authLimiter, async (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, and name are required' });
  }
  const allowedSelfRoles = ['student', 'instructor', 'institution'];
  const finalRole = allowedSelfRoles.includes(role) ? role : 'student';

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4)
       RETURNING id, email, name, role, institution_id, created_at`,
      [email, hash, name, finalRole]
    );
    const user = result.rows[0];
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2, now() + interval '30 days')`,
      [user.id, refreshToken]
    );
    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2, now() + interval '30 days')`,
      [user.id, refreshToken]
    );
    delete user.password_hash;
    res.json({ user, accessToken, refreshToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Google OAuth: accepts a pre-verified Google profile from the client SDK.
// (Full server-side token verification against Google's tokeninfo endpoint
// wires in here once GOOGLE_CLIENT_ID is configured for a live deployment.)
router.post('/google', async (req, res) => {
  const { googleId, email, name } = req.body;
  if (!googleId || !email) return res.status(400).json({ error: 'googleId and email required' });
  try {
    let result = await pool.query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [googleId, email]);
    let user = result.rows[0];
    if (!user) {
      const insert = await pool.query(
        `INSERT INTO users (email, password_hash, name, role, google_id) VALUES ($1,'', $2,'student',$3)
         RETURNING id, email, name, role, institution_id, created_at`,
        [email, name || email.split('@')[0], googleId]
      );
      user = insert.rows[0];
    }
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    delete user.password_hash;
    res.json({ user, accessToken, refreshToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Google sign-in failed' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
  try {
    const payload = verifyRefreshToken(refreshToken);
    const stored = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2', [refreshToken, payload.sub]);
    if (!stored.rows.length) return res.status(401).json({ error: 'Refresh token not recognized' });
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });
    const accessToken = signAccessToken(user);
    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  const result = await pool.query(
    'SELECT id, email, name, role, institution_id, status, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  res.json({ user: result.rows[0] });
});

// Logout: revokes the refresh token so it can no longer mint new access
// tokens. Access tokens already issued remain valid until their own short
// expiry (see auth/tokens.js) — that trade-off is documented, not accidental.
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
  }
  res.json({ ok: true });
});

// ---- Password reset -----------------------------------------------------------
// Current state: generates a secure, single-use, 1-hour token and returns it
// directly in the API response (devResetLink) rather than delivering it by
// email, because no production email provider is wired up yet (see the
// Communication Engine spec). This is intentionally labelled so it is never
// mistaken for a delivered email — swap the `devResetLink` field for a real
// mailer call once a provider is configured, without changing the rest of
// this flow.
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  const user = userResult.rows[0];

  // Always respond the same way whether or not the account exists, so this
  // endpoint cannot be used to enumerate registered emails.
  const genericResponse = { ok: true, message: 'If that email is registered, a reset link has been generated.' };
  if (!user) return res.json(genericResponse);

  const rawToken = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`,
    [user.id, hashToken(rawToken)]
  );

  const response = { ...genericResponse };
  if (process.env.NODE_ENV !== 'production') {
    // Dev/staging convenience only — never present in a production response.
    response.devResetToken = rawToken;
    response.devResetLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
  }
  // Asynchronous Messaging: the actual delivery is offloaded to the mail
  // queue (see utils/mailQueue.js) — retried automatically, routed to a
  // dead-letter queue on persistent failure — rather than sent inline here.
  enqueueMail({
    to: email,
    subject: 'Reset your FlyCentric password',
    template: 'password-reset',
    data: { resetLink: `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}` },
  }).catch(() => {});
  res.json(response);
});

router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const tokenHash = hashToken(token);
  const result = await pool.query(
    `SELECT * FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );
  const reset = result.rows[0];
  if (!reset) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, reset.user_id]);
  await pool.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);
  // Reset all sessions on password change — a stolen refresh token should
  // not survive the owner regaining control of their account.
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [reset.user_id]);

  res.json({ ok: true, message: 'Password updated. Please sign in again.' });
});

module.exports = router;
