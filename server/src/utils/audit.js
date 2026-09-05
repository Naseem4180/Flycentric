const pool = require('../db/pool');

// Append-only audit trail for destructive or security-sensitive operations
// (role changes, suspensions, refunds, content deletion, settings changes).
// Failures here must never break the underlying operation, so this is always
// best-effort and swallows its own errors after logging them.
async function logAudit({ req, actorId, actorRole, action, entityType, entityId, meta }) {
  try {
    const resolvedActorId = actorId ?? req?.user?.id ?? null;
    const resolvedActorRole = actorRole ?? req?.user?.role ?? null;
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null;
    await pool.query(
      `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, meta, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [resolvedActorId, resolvedActorRole, action, entityType || null, entityId != null ? String(entityId) : null, meta ? JSON.stringify(meta) : '{}', ip]
    );
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logAudit };
