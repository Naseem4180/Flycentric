const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { signAccessToken, signRefreshToken, verifyRefreshToken, verifyAccessToken } = require('../auth/tokens');
const { authenticate, invalidateSessionCache, clearAllSessionCache } = require('../middleware/auth');
const { authLimiter, loginLimiter, passwordResetLimiter } = require('../middleware/rateLimit');
const { enqueueMail } = require('../utils/mailQueue');
const { gradeAndSubmitAttempt } = require('./exams');

const router = express.Router();

// Password-reset tokens are random and only ever stored hashed (SHA-256) —
// see schema.sql `password_resets`. The raw token only ever exists in the
// response body / a real outbound email, never in the database.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function saveAvatarIfProvided(avatarData) {
  if (!avatarData || typeof avatarData !== 'string') return null;
  const trimmed = avatarData.trim();
  if (!trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  const matches = trimmed.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!matches) return null;
  const rawExt = matches[1].toLowerCase();
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const buffer = Buffer.from(matches[2], 'base64');
  if (buffer.length > 4 * 1024 * 1024) {
    throw new Error('Profile photo must be smaller than 4MB');
  }
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'avatars');
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const filename = `avatar_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/avatars/${filename}`;
}

router.post('/register', authLimiter, async (req, res) => {
  const {
    email, password, name, phone, date_of_birth, country, city, avatar_data, avatar_url, role
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Full Name (as per official ID) is required' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email Address is required' });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'Mobile Number is required' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!date_of_birth) {
    return res.status(400).json({ error: 'Date of Birth is required' });
  }
  if (!country || !country.trim()) {
    return res.status(400).json({ error: 'Country is required' });
  }

  const allowedSelfRoles = ['student', 'instructor', 'institution'];
  const finalRole = allowedSelfRoles.includes(role) ? role : 'student';

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    let savedAvatarUrl = null;
    try {
      savedAvatarUrl = await saveAvatarIfProvided(avatar_data || avatar_url);
    } catch (photoErr) {
      return res.status(400).json({ error: photoErr.message || 'Invalid profile photo' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, phone, date_of_birth, country, city, avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, email, name, role, institution_id, phone, date_of_birth, country, city, avatar_url, status, created_at`,
      [
        email.trim().toLowerCase(),
        hash,
        name.trim(),
        finalRole,
        phone.trim(),
        date_of_birth,
        country.trim(),
        city ? city.trim() : null,
        savedAvatarUrl,
      ]
    );
    const user = result.rows[0];
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const newSession = await pool.query(
      `INSERT INTO user_sessions (user_id, session_token, user_agent, ip_address, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [user.id, sessionToken, req.headers['user-agent'] || null, req.ip || null]
    );
    const sessionId = newSession.rows[0].id;
    const accessToken = signAccessToken(user, sessionId);
    const refreshToken = signRefreshToken(user);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2, now() + interval '30 days')`,
      [user.id, refreshToken]
    );
    res.status(201).json({ user, accessToken, refreshToken, sessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password, forceLogout } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Single-session and concurrent assessment checks ONLY apply to students
    const isStudent = user.role === 'student';

    if (isStudent) {
      const activeSessions = await pool.query(
        'SELECT id, user_agent, ip_address, created_at FROM user_sessions WHERE user_id = $1 AND is_active = true',
        [user.id]
      );

      // Check if candidate is working on an active exam or assignment attempt (Requirement 12, 13)
      const activeAttemptResult = await pool.query(
        `SELECT a.id, a.quiz_id, q.title AS quiz_title, q.type AS quiz_type
         FROM attempts a
         JOIN quizzes q ON q.id = a.quiz_id
         WHERE a.user_id = $1 AND a.status = 'in_progress'
           AND (a.deadline_at IS NULL OR a.deadline_at > now())
         ORDER BY a.started_at DESC LIMIT 1`,
        [user.id]
      );
      const activeAssessment = activeAttemptResult.rows[0] || null;

      if (activeSessions.rows.length > 0 && !forceLogout) {
        return res.status(409).json({
          error: 'Already Logged In',
          requires_confirmation: true,
          reason: activeAssessment ? 'exam_in_progress' : 'already_logged_in',
          active_assessment: activeAssessment ? {
            id: activeAssessment.id,
            quiz_id: activeAssessment.quiz_id,
            title: activeAssessment.quiz_title,
            type: activeAssessment.quiz_type,
          } : null,
        });
      }

      // If Logout All was chosen and an active assessment is in progress, auto-submit it (Requirement 13)
      if (activeAssessment && forceLogout) {
        try {
          await gradeAndSubmitAttempt(activeAssessment.id, user.id, {
            is_auto_submitted: true,
            auto_submit_reason: 'dual_login_logout_all',
            client_ip: req.ip,
            client_user_agent: req.headers['user-agent'],
          });
        } catch (err) {
          console.error('Error auto-submitting assessment on dual login logout-all:', err);
        }
      }

      // Invalidate old sessions and refresh tokens for student
      await pool.query('UPDATE user_sessions SET is_active = false WHERE user_id = $1', [user.id]);
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
      clearAllSessionCache();
    }

    // Issue new session for current browser
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const newSession = await pool.query(
      `INSERT INTO user_sessions (user_id, session_token, user_agent, ip_address, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [user.id, sessionToken, req.headers['user-agent'] || null, req.ip || null]
    );
    const sessionId = newSession.rows[0].id;

    const accessToken = signAccessToken(user, sessionId);
    const refreshToken = signRefreshToken(user);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2, now() + interval '30 days')`,
      [user.id, refreshToken]
    );
    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    delete user.password_hash;
    res.json({ user, accessToken, refreshToken, sessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Google OAuth: accepts a pre-verified Google profile from the client SDK.
// (Full server-side token verification against Google's tokeninfo endpoint
// wires in here once GOOGLE_CLIENT_ID is configured for a live deployment.)
router.post('/google', async (req, res) => {
  const { googleId, email, name, forceLogout } = req.body;
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

    // Single-session checks ONLY apply to students
    const isStudent = user.role === 'student';
    if (isStudent) {
      const activeSessions = await pool.query(
        'SELECT id FROM user_sessions WHERE user_id = $1 AND is_active = true',
        [user.id]
      );
      const activeAttemptResult = await pool.query(
        `SELECT a.id, a.quiz_id, q.title AS quiz_title, q.type AS quiz_type
         FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
         WHERE a.user_id = $1 AND a.status = 'in_progress' AND (a.deadline_at IS NULL OR a.deadline_at > now())
         LIMIT 1`,
        [user.id]
      );
      const activeAssessment = activeAttemptResult.rows[0] || null;

      if (activeSessions.rows.length > 0 && !forceLogout) {
        return res.status(409).json({
          error: 'Already Logged In',
          requires_confirmation: true,
          reason: activeAssessment ? 'exam_in_progress' : 'already_logged_in',
          active_assessment: activeAssessment ? {
            id: activeAssessment.id,
            quiz_id: activeAssessment.quiz_id,
            title: activeAssessment.quiz_title,
            type: activeAssessment.quiz_type,
          } : null,
        });
      }

      if (activeAssessment && forceLogout) {
        try {
          await gradeAndSubmitAttempt(activeAssessment.id, user.id, {
            is_auto_submitted: true,
            auto_submit_reason: 'dual_login_logout_all',
            client_ip: req.ip,
            client_user_agent: req.headers['user-agent'],
          });
        } catch (err) {
          console.error('Error auto-submitting on google dual login:', err);
        }
      }

      await pool.query('UPDATE user_sessions SET is_active = false WHERE user_id = $1', [user.id]);
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
      clearAllSessionCache();
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const newSession = await pool.query(
      `INSERT INTO user_sessions (user_id, session_token, user_agent, ip_address, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [user.id, sessionToken, req.headers['user-agent'] || null, req.ip || null]
    );
    const sessionId = newSession.rows[0].id;
    const accessToken = signAccessToken(user, sessionId);
    const refreshToken = signRefreshToken(user);
    delete user.password_hash;
    res.json({ user, accessToken, refreshToken, sessionId });
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
    const activeSess = await pool.query('SELECT id FROM user_sessions WHERE user_id = $1 AND is_active = true ORDER BY last_active_at DESC LIMIT 1', [user.id]);
    const sessionId = activeSess.rows.length ? activeSess.rows[0].id : null;
    const accessToken = signAccessToken(user, sessionId);
    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  const result = await pool.query(
    'SELECT id, email, name, role, institution_id, status, phone, date_of_birth, country, city, avatar_url, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  res.json({ user: result.rows[0] });
});

// Self-service profile update. Allows name, date_of_birth, phone, country, city, avatar_url.
router.patch('/me', authenticate, async (req, res) => {
  const { name, date_of_birth, phone, country, city, avatar_data, avatar_url } = req.body;

  let savedAvatarUrl = avatar_url !== undefined ? avatar_url : undefined;
  if (avatar_data) {
    try {
      savedAvatarUrl = await saveAvatarIfProvided(avatar_data);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid avatar photo' });
    }
  }

  const result = await pool.query(
    `UPDATE users SET
       name = COALESCE($1, name),
       date_of_birth = CASE WHEN $3 THEN $2 ELSE date_of_birth END,
       phone = CASE WHEN $5 THEN $4 ELSE phone END,
       country = CASE WHEN $7 THEN $6 ELSE country END,
       city = CASE WHEN $9 THEN $8 ELSE city END,
       avatar_url = CASE WHEN $11 THEN $10 ELSE avatar_url END
     WHERE id = $12
     RETURNING id, email, name, role, institution_id, status, phone, date_of_birth, country, city, avatar_url, created_at`,
    [
      name || null,
      date_of_birth || null,
      date_of_birth !== undefined,
      phone || null,
      phone !== undefined,
      country || null,
      country !== undefined,
      city || null,
      city !== undefined,
      savedAvatarUrl || null,
      savedAvatarUrl !== undefined,
      req.user.id,
    ]
  );
  res.json({ user: result.rows[0] });
});

// Logout: revokes the refresh token so it can no longer mint new access
// tokens. Access tokens already issued remain valid until their own short
// expiry (see auth/tokens.js) — that trade-off is documented, not accidental.
router.post('/logout', async (req, res) => {
  const { refreshToken, accessToken: bodyAccessToken } = req.body || {};
  let userId = null;
  let sessionId = null;

  if (refreshToken) {
    try {
      const rtRes = await pool.query('SELECT user_id FROM refresh_tokens WHERE token = $1', [refreshToken]);
      if (rtRes.rows.length > 0) {
        userId = rtRes.rows[0].user_id;
      }
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    } catch (err) {
      console.error('Error clearing refresh token on logout:', err);
    }
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (bodyAccessToken || null);
  if (token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded) {
        if (decoded.sid) sessionId = decoded.sid;
        if (decoded.sub || decoded.id) userId = userId || decoded.sub || decoded.id;
      }
    } catch {}
  }

  if (sessionId) {
    try {
      await pool.query('UPDATE user_sessions SET is_active = false WHERE id = $1', [sessionId]);
      invalidateSessionCache(sessionId);
    } catch (err) {
      console.error('Error deactivating session on logout:', err);
    }
  }
  if (userId) {
    try {
      await pool.query('UPDATE user_sessions SET is_active = false WHERE user_id = $1', [userId]);
      clearAllSessionCache();
    } catch (err) {
      console.error('Error deactivating user sessions on logout:', err);
    }
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
