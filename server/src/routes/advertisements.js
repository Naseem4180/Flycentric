const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Ensure table exists on first route access to guarantee plug-and-play operation
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS advertisements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        image_url TEXT,
        link_url TEXT NOT NULL,
        button_text VARCHAR(100) DEFAULT 'Learn More',
        badge_text VARCHAR(100) DEFAULT 'Sponsored',
        status VARCHAR(50) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
        priority INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_ads_status ON advertisements (status) WHERE deleted_at IS NULL;
    `);
    tableReady = true;
  } catch (err) {
    console.error('Failed to initialize advertisements table:', err);
  }
}

// Optional auth: allows both logged-in students and admins, while falling back gracefully
router.use(async (req, res, next) => {
  await ensureTable();
  next();
});

// GET /api/advertisements — fetch ads
// Admins see all non-deleted ads; students/public only see active published ads.
router.get('/', async (req, res) => {
  try {
    // Check if caller sent auth token to inspect role
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        if (decoded && decoded.role === 'admin') isAdmin = true;
      } catch {
        // invalid token — ignore and treat as regular viewer
      }
    }

    let query;
    let params = [];
    if (isAdmin) {
      query = `SELECT * FROM advertisements WHERE deleted_at IS NULL ORDER BY priority DESC, created_at DESC`;
    } else {
      query = `SELECT id, title, description, image_url, link_url, button_text, badge_text, priority, created_at 
               FROM advertisements 
               WHERE status = 'published' AND deleted_at IS NULL 
               ORDER BY priority DESC, created_at DESC`;
    }

    const { rows } = await pool.query(query, params);
    res.json({ advertisements: rows });
  } catch (err) {
    console.error('Error fetching advertisements:', err);
    res.status(500).json({ error: 'Failed to fetch advertisements', advertisements: [] });
  }
});

// POST /api/advertisements — Admin creates a new advertisement banner
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { title, description, image_url, link_url, button_text, badge_text, status, priority } = req.body;
  if (!title || !link_url) {
    return res.status(400).json({ error: 'Title and Target Link URL are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO advertisements 
        (title, description, image_url, link_url, button_text, badge_text, status, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        title.trim(),
        description ? description.trim() : null,
        image_url ? image_url.trim() : null,
        link_url.trim(),
        button_text ? button_text.trim() : 'Learn More',
        badge_text ? badge_text.trim() : 'Sponsored',
        status === 'draft' ? 'draft' : 'published',
        Number.isInteger(Number(priority)) ? Number(priority) : 0,
        req.user.id,
      ]
    );

    res.status(201).json({ advertisement: rows[0] });
  } catch (err) {
    console.error('Error creating advertisement:', err);
    res.status(500).json({ error: 'Failed to create advertisement' });
  }
});

// PATCH /api/advertisements/:id — Admin updates an existing ad or toggles status
router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const { title, description, image_url, link_url, button_text, badge_text, status, priority } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM advertisements WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Advertisement not found' });
    }

    const { rows } = await pool.query(
      `UPDATE advertisements SET
         title = COALESCE($1, title),
         description = CASE WHEN $2::boolean THEN $3 ELSE description END,
         image_url = CASE WHEN $4::boolean THEN $5 ELSE image_url END,
         link_url = COALESCE($6, link_url),
         button_text = COALESCE($7, button_text),
         badge_text = COALESCE($8, badge_text),
         status = COALESCE($9, status),
         priority = COALESCE($10, priority),
         updated_at = now()
       WHERE id = $11 AND deleted_at IS NULL
       RETURNING *`,
      [
        title !== undefined ? title.trim() : null,
        description !== undefined,
        description ? description.trim() : null,
        image_url !== undefined,
        image_url ? image_url.trim() : null,
        link_url !== undefined ? link_url.trim() : null,
        button_text !== undefined ? button_text.trim() : null,
        badge_text !== undefined ? badge_text.trim() : null,
        status !== undefined ? status : null,
        priority !== undefined ? Number(priority) : null,
        id,
      ]
    );

    res.json({ advertisement: rows[0] });
  } catch (err) {
    console.error('Error updating advertisement:', err);
    res.status(500).json({ error: 'Failed to update advertisement' });
  }
});

// DELETE /api/advertisements/:id — Soft-delete an ad
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE advertisements SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Advertisement not found' });
    }
    res.json({ success: true, id: Number(id) });
  } catch (err) {
    console.error('Error deleting advertisement:', err);
    res.status(500).json({ error: 'Failed to delete advertisement' });
  }
});

// POST /api/advertisements/:id/click — Register a click counter for the ad
router.post('/:id/click', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      'UPDATE advertisements SET click_count = click_count + 1 WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    res.json({ ok: true });
  } catch {
    // Non-blocking counter
    res.json({ ok: false });
  }
});

module.exports = router;

