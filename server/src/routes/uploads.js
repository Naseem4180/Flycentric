const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Object Storage: direct-to-cloud media uploads via short-lived signed URLs,
// so binary payloads never transit through this API server. Mirrors the
// rest of the codebase's pattern for optional live integrations (Razorpay,
// Redis) — without AWS credentials configured, this returns a clear 501
// instead of crashing, so local/dev setups keep working.
let S3Client, PutObjectCommand, getSignedUrl;
try {
  // eslint-disable-next-line global-require
  ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
  // eslint-disable-next-line global-require
  ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
} catch {
  // @aws-sdk packages not installed yet — handled below.
}

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.S3_REGION || 'ap-south-1';

// MIME allowlist: images and PDFs only. Executables, scripts, and anything
// else that could be served back and executed by a browser are rejected
// outright — this is an allowlist, not a denylist, precisely so a novel
// dangerous type can never sneak through unnoticed.
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);
const EXT_BY_MIME = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf',
};

function s3Client() {
  return new S3Client({ region: REGION });
}

// POST /uploads/signed-url — returns a short-lived PUT URL the client
// uploads the file to directly. purpose is a free-text label ('question_image',
// 'note', 'avatar', …) recorded for audit/browsing, not used for access control.
router.post('/signed-url', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  if (!S3Client || !getSignedUrl || !BUCKET) {
    return res.status(501).json({
      error: 'Object storage is not configured on this server (missing @aws-sdk packages or S3_BUCKET env var).',
    });
  }
  const { mime_type, original_filename, purpose, size_bytes } = req.body;
  if (!mime_type) return res.status(400).json({ error: 'mime_type required' });
  if (!ALLOWED_MIME.has(mime_type)) {
    return res.status(400).json({
      error: `Unsupported file type "${mime_type}". Allowed: ${[...ALLOWED_MIME].join(', ')}`,
    });
  }
  if (size_bytes && Number(size_bytes) > 15 * 1024 * 1024) {
    return res.status(400).json({ error: 'File exceeds the 15MB limit.' });
  }

  // Collision-resistant key: a fresh UUID, never derived from the original
  // filename (which could otherwise be used for path traversal or to
  // overwrite another upload).
  const uuid = crypto.randomUUID();
  const ext = EXT_BY_MIME[mime_type] || 'bin';
  const key = `uploads/${purpose || 'general'}/${uuid}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: mime_type,
  });
  const uploadUrl = await getSignedUrl(s3Client(), command, { expiresIn: 300 }); // 5 minutes

  await pool.query(
    `INSERT INTO media_uploads (storage_key, original_filename, mime_type, size_bytes, uploaded_by, purpose)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [key, original_filename || null, mime_type, size_bytes || null, req.user.id, purpose || null]
  );

  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
  res.status(201).json({ uploadUrl, key, publicUrl, expiresInSeconds: 300 });
});

router.get('/', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `SELECT mu.*, u.name AS uploaded_by_name FROM media_uploads mu
     LEFT JOIN users u ON u.id = mu.uploaded_by ORDER BY mu.created_at DESC LIMIT 200`
  );
  res.json({ uploads: result.rows });
});

module.exports = router;
