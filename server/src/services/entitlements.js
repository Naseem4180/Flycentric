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
async function grantBundleAccess({ userId, bundleId, grantedBy, reason, req, orderId }, client) {
  const db = client || pool;

  // Resolve validity / expiry from the payment record when an orderId is supplied
  let expiresAt = null;
  let validityMonths = null;
  if (orderId) {
    const payRow = await db.query(
      'SELECT validity_months FROM payments WHERE id = $1',
      [orderId]
    ).catch(() => ({ rows: [] }));
    const vm = payRow.rows[0]?.validity_months;
    if (vm && Number(vm) > 0) {
      validityMonths = Number(vm);
      // Check existing access to support clean course renewal extension
      const existingAccess = await db.query(
        'SELECT expires_at FROM bundle_access WHERE user_id = $1 AND bundle_id = $2',
        [userId, bundleId]
      ).catch(() => ({ rows: [] }));
      const curExp = existingAccess.rows[0]?.expires_at;
      const baseDate = (curExp && new Date(curExp) > new Date()) ? new Date(curExp) : new Date();
      expiresAt = new Date(baseDate.getTime() + validityMonths * 30 * 24 * 60 * 60 * 1000);
    }
  }

  const result = await db.query(
    `INSERT INTO bundle_access (user_id, bundle_id, expires_at, validity_months)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, bundle_id) DO UPDATE SET
       expires_at = COALESCE(EXCLUDED.expires_at, bundle_access.expires_at),
       validity_months = COALESCE(EXCLUDED.validity_months, bundle_access.validity_months)
     RETURNING *`,
    [userId, bundleId, expiresAt, validityMonths]
  );
  const granted = result.rows.length > 0;
  if (granted) {
    await db.query(
      `INSERT INTO course_enrollments (user_id, bundle_id, enrollment_type, status, expiry_date, purchase_id)
       VALUES ($1, $2, 'paid', 'active', $3, $4)
       ON CONFLICT (user_id, bundle_id) DO UPDATE SET
         status = 'active',
         expiry_date = COALESCE(EXCLUDED.expiry_date, course_enrollments.expiry_date),
         purchase_id = COALESCE(EXCLUDED.purchase_id, course_enrollments.purchase_id)`,
      [userId, bundleId, expiresAt, orderId || null]
    ).catch(() => {});
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
    await db.query(
      `UPDATE course_enrollments SET status = 'cancelled' WHERE user_id = $1 AND bundle_id = $2`,
      [userId, bundleId]
    ).catch(() => {});
    await logAudit({
      req, actorId: revokedBy, action: 'entitlement.revoke', entityType: 'bundle', entityId: bundleId,
      meta: { userId, bundleId, reason: reason || 'unspecified' },
    });
  }
  return { revoked };
}

module.exports = { grantBundleAccess, revokeBundleAccess };
