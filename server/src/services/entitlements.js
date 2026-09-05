const pool = require('../db/pool');
const { logAudit } = require('../utils/audit');

// Centralized Entitlements: the ONLY place `bundle_access` rows are ever
// inserted or removed. Both the payment webhook (successful payment) and
// admin manual grants (routes/payments.js, routes/admin.js) call through
// here instead of writing to bundle_access directly, so entitlement rules
// (idempotency, audit trail, "who/why granted this") can never drift between
// the two call sites.
//
// `client` is optional — pass an already-open pg client when the caller is
// inside its own transaction (e.g. the payment webhook, which must commit
// the payment status change and the access grant atomically); otherwise the
// shared pool is used directly.
async function grantBundleAccess({ userId, bundleId, grantedBy, reason, req }, client) {
  const db = client || pool;
  const result = await db.query(
    `INSERT INTO bundle_access (user_id, bundle_id) VALUES ($1,$2)
     ON CONFLICT (user_id, bundle_id) DO NOTHING RETURNING *`,
    [userId, bundleId]
  );
  const granted = result.rows.length > 0;
  if (granted) {
    await logAudit({
      req, actorId: grantedBy, action: 'entitlement.grant', entityType: 'bundle', entityId: bundleId,
      meta: { userId, bundleId, reason: reason || 'unspecified' },
    });
  }
  return { granted };
}

async function revokeBundleAccess({ userId, bundleId, revokedBy, reason, req }, client) {
  const db = client || pool;
  const result = await db.query(
    'DELETE FROM bundle_access WHERE user_id = $1 AND bundle_id = $2 RETURNING *',
    [userId, bundleId]
  );
  const revoked = result.rows.length > 0;
  if (revoked) {
    await logAudit({
      req, actorId: revokedBy, action: 'entitlement.revoke', entityType: 'bundle', entityId: bundleId,
      meta: { userId, bundleId, reason: reason || 'unspecified' },
    });
  }
  return { revoked };
}

module.exports = { grantBundleAccess, revokeBundleAccess };
