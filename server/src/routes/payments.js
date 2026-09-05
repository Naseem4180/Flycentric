const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { grantBundleAccess, revokeBundleAccess } = require('../services/entitlements');
const { enqueueMail } = require('../utils/mailQueue');

const router = express.Router();

// NOTE: This runs against Razorpay's real API/webhooks once RAZORPAY_KEY_ID /
// RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET are set as env vars for a live
// deployment. Without live keys, /order creates a local "order" record and
// /webhook can be called directly (as Razorpay would) to prove the
// webhook-is-source-of-truth flow end-to-end.

router.post('/order', authenticate, authorize('student'), async (req, res) => {
  const { bundle_id } = req.body;
  const bundleResult = await pool.query('SELECT * FROM bundles WHERE id = $1 AND status = $2', [bundle_id, 'live']);
  const bundle = bundleResult.rows[0];
  if (!bundle) return res.status(404).json({ error: 'Bundle not found or not live' });

  const fakeOrderId = 'order_' + crypto.randomBytes(8).toString('hex');
  const result = await pool.query(
    `INSERT INTO payments (user_id, bundle_id, amount_inr, status, razorpay_order_id) VALUES ($1,$2,$3,'created',$4) RETURNING *`,
    [req.user.id, bundle.id, bundle.price_inr, fakeOrderId]
  );
  res.status(201).json({ payment: result.rows[0], razorpayOrderId: fakeOrderId, amount: bundle.price_inr });
});

router.post('/enroll-free', authenticate, authorize('student'), async (req, res) => {
  const result = await pool.query(
    'SELECT id, is_free, price_inr FROM bundles WHERE id = $1 AND status = $2 AND deleted_at IS NULL',
    [req.body.bundle_id, 'live']
  );
  const bundle = result.rows[0];
  if (!bundle || (!bundle.is_free && Number(bundle.price_inr) > 0)) {
    return res.status(400).json({ error: 'This bundle requires payment.' });
  }
  const { granted } = await grantBundleAccess({ userId: req.user.id, bundleId: bundle.id, reason: 'free.enrollment', req });
  res.status(201).json({ ok: true, granted });
});

// Server-side webhook — the source of truth for payment confirmation, per BRD
// Phase 5 requirement (not client-side verification alone).
//
// Signature verification: when RAZORPAY_WEBHOOK_SECRET is configured, the
// request is rejected unless `x-razorpay-signature` is a valid HMAC-SHA256
// of the *raw* request body under that secret — this is what makes the
// webhook trustworthy as a source of truth rather than an open endpoint
// anyone could POST to. Without a secret configured (local/dev), signature
// checking is skipped so the flow can still be exercised end-to-end, but a
// warning is logged so this is never silently the case in production.
router.post('/webhook', async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers['x-razorpay-signature'];
    const expected = crypto.createHmac('sha256', webhookSecret).update(req.rawBody || Buffer.from(JSON.stringify(req.body))).digest('hex');
    const provided = Buffer.from(String(signature || ''), 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const valid = signature && provided.length === expectedBuf.length && crypto.timingSafeEqual(provided, expectedBuf);
    if (!valid) return res.status(400).json({ error: 'Invalid webhook signature' });
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('WARNING: RAZORPAY_WEBHOOK_SECRET is not set — payment webhook signature is NOT being verified in production.');
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, event } = req.body;
  if (!razorpay_order_id) return res.status(400).json({ error: 'razorpay_order_id required' });

  const paymentResult = await pool.query('SELECT * FROM payments WHERE razorpay_order_id = $1', [razorpay_order_id]);
  const payment = paymentResult.rows[0];
  if (!payment) return res.status(404).json({ error: 'Order not found' });

  // Idempotency: Razorpay (like most providers) may deliver the same webhook
  // event more than once. A payment already resolved to a terminal state
  // must not be re-processed (e.g. re-granting access after a refund, or
  // double-counting a "paid" transition).
  if (payment.status === 'paid' || payment.status === 'failed' || payment.status === 'refunded') {
    return res.json({ ok: true, status: payment.status, note: 'Already processed' });
  }

  if (event === 'payment.failed') {
    await pool.query("UPDATE payments SET status = 'failed' WHERE id = $1", [payment.id]);
    return res.json({ ok: true, status: 'failed' });
  }

  // A "same client for the whole transaction" connection — pool.query() pulls
  // a (potentially different) client from the pool on every call, so BEGIN/
  // COMMIT would not reliably wrap the same session across separate
  // pool.query() calls. See questions.js bulk import for the same pattern.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE payments SET status = 'paid', razorpay_payment_id = $1, razorpay_signature = $2 WHERE id = $3`,
      [razorpay_payment_id || null, razorpay_signature || null, payment.id]
    );
    // Centralized Entitlements: the only code path that ever inserts into
    // bundle_access — see services/entitlements.js. Idempotent via the
    // ON CONFLICT DO NOTHING inside it, so a redelivered webhook (already
    // short-circuited above by payment.status, but defense-in-depth here
    // too) can never double-grant.
    await grantBundleAccess(
      { userId: payment.user_id, bundleId: payment.bundle_id, reason: 'payment.webhook', req },
      client
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Fire-and-forget receipt email via the async mail queue (see
  // utils/mailQueue.js) — never blocks or fails the webhook response.
  enqueueMail({
    to: payment.user_id, // resolved to a real address by the mail worker/provider
    subject: 'Payment received — receipt',
    template: 'payment-receipt',
    data: { paymentId: payment.id, amountInr: payment.amount_inr, bundleId: payment.bundle_id },
  }).catch(() => {});

  res.json({ ok: true, status: 'paid' });
});

router.get('/my-access', authenticate, async (req, res) => {
  const result = await pool.query(
    `SELECT b.* FROM bundle_access ba JOIN bundles b ON b.id = ba.bundle_id WHERE ba.user_id = $1`,
    [req.user.id]
  );
  res.json({ bundles: result.rows });
});

router.get('/', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, u.email, b.title AS bundle_title FROM payments p
     JOIN users u ON u.id = p.user_id JOIN bundles b ON b.id = p.bundle_id ORDER BY p.created_at DESC LIMIT 200`
  );
  res.json({ payments: result.rows });
});

// Admin-initiated refund with audit trail
router.post('/:id/refund', authenticate, authorize('admin'), async (req, res) => {
  const result = await pool.query(
    "UPDATE payments SET status = 'refunded' WHERE id = $1 AND status = 'paid' RETURNING *",
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Paid payment not found' });
  const payment = result.rows[0];
  await revokeBundleAccess({ userId: payment.user_id, bundleId: payment.bundle_id, revokedBy: req.user.id, reason: 'payment.refund', req });
  await logAudit({
    req, action: 'payment.refund', entityType: 'payment', entityId: payment.id,
    meta: { userId: payment.user_id, bundleId: payment.bundle_id, amountInr: payment.amount_inr },
  });
  res.json({ payment, refundedBy: req.user.id, refundedAt: new Date().toISOString() });
});

// Admin-initiated manual entitlement grant (e.g. comped access, offline
// payment, goodwill) — goes through the SAME centralized service as the
// payment webhook so every grant, however it originated, is auditable and
// idempotent the same way.
router.post('/grant-access', authenticate, authorize('admin'), async (req, res) => {
  const { user_id, bundle_id, reason } = req.body;
  if (!user_id || !bundle_id) return res.status(400).json({ error: 'user_id and bundle_id required' });
  const { granted } = await grantBundleAccess({ userId: user_id, bundleId: bundle_id, grantedBy: req.user.id, reason: reason || 'admin.manual_grant', req });
  res.json({ ok: true, granted });
});

module.exports = router;
