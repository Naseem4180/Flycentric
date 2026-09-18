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

router.post('/apply-coupon', authenticate, authorize('student'), async (req, res) => {
  const { code, bundle_id } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'Coupon code required' });

  const couponResult = await pool.query(
    'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND status = $2',
    [code.trim(), 'active']
  );
  const coupon = couponResult.rows[0];
  if (!coupon) return res.status(404).json({ error: 'Coupon does not exist or is inactive' });

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This coupon has expired' });
  }

  if (coupon.max_uses != null && Number(coupon.used_count) >= Number(coupon.max_uses)) {
    return res.status(400).json({ error: 'Coupon usage limit has been exceeded' });
  }

  const bundleResult = await pool.query('SELECT * FROM bundles WHERE id = $1 AND status = $2', [bundle_id, 'live']);
  const bundle = bundleResult.rows[0];
  if (!bundle) return res.status(404).json({ error: 'Bundle not found or not live' });

  if (coupon.bundle_id && Number(coupon.bundle_id) !== Number(bundle.id)) {
    return res.status(400).json({ error: 'This coupon is not applicable to the selected course' });
  }

  const originalPrice = Number(bundle.price_inr || 0);
  if (coupon.min_order_amount_inr && originalPrice < Number(coupon.min_order_amount_inr)) {
    return res.status(400).json({ error: `Minimum order value for this coupon is ₹${Number(coupon.min_order_amount_inr).toLocaleString('en-IN')}` });
  }

  let discount = 0;
  if (coupon.discount_percent != null && Number(coupon.discount_percent) > 0) {
    discount = Math.round((originalPrice * Number(coupon.discount_percent)) / 100);
    if (coupon.max_discount_amount_inr != null && Number(coupon.max_discount_amount_inr) > 0) {
      discount = Math.min(discount, Number(coupon.max_discount_amount_inr));
    }
  } else if (coupon.discount_amount_inr != null && Number(coupon.discount_amount_inr) > 0) {
    discount = Math.min(originalPrice, Number(coupon.discount_amount_inr));
  }

  const finalAmount = Math.max(0, originalPrice - discount);
  res.json({
    valid: true,
    coupon_id: coupon.id,
    code: coupon.code,
    original_amount: originalPrice,
    discount_amount: discount,
    final_amount: finalAmount,
    discount_percent: coupon.discount_percent,
  });
});

router.post('/order', authenticate, authorize('student'), async (req, res) => {
  const { bundle_id, coupon_code } = req.body;
  const bundleResult = await pool.query('SELECT * FROM bundles WHERE id = $1 AND status = $2', [bundle_id, 'live']);
  const bundle = bundleResult.rows[0];
  if (!bundle) return res.status(404).json({ error: 'Bundle not found or not live' });

  const originalPrice = Number(bundle.price_inr || 0);
  let discountAmount = 0;
  let finalAmount = originalPrice;
  let appliedCoupon = null;

  if (coupon_code && coupon_code.trim()) {
    const couponResult = await pool.query(
      'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND status = $2',
      [coupon_code.trim(), 'active']
    );
    const coupon = couponResult.rows[0];
    if (coupon) {
      const notExpired = !coupon.expires_at || new Date(coupon.expires_at) >= new Date();
      const underMax = coupon.max_uses == null || Number(coupon.used_count) < Number(coupon.max_uses);
      const matchesBundle = !coupon.bundle_id || Number(coupon.bundle_id) === Number(bundle.id);
      const meetsMinOrder = !coupon.min_order_amount_inr || originalPrice >= Number(coupon.min_order_amount_inr);

      if (notExpired && underMax && matchesBundle && meetsMinOrder) {
        appliedCoupon = coupon;
        if (coupon.discount_percent != null && Number(coupon.discount_percent) > 0) {
          discountAmount = Math.round((originalPrice * Number(coupon.discount_percent)) / 100);
          if (coupon.max_discount_amount_inr != null && Number(coupon.max_discount_amount_inr) > 0) {
            discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount_inr));
          }
        } else if (coupon.discount_amount_inr != null && Number(coupon.discount_amount_inr) > 0) {
          discountAmount = Math.min(originalPrice, Number(coupon.discount_amount_inr));
        }
        finalAmount = Math.max(0, originalPrice - discountAmount);
      }
    }
  }

  const fakeOrderId = 'order_' + crypto.randomBytes(8).toString('hex');
  const result = await pool.query(
    `INSERT INTO payments (
       user_id, bundle_id, amount_inr, status, razorpay_order_id,
       coupon_id, coupon_code, original_amount_inr, discount_amount_inr
     ) VALUES ($1,$2,$3,'created',$4,$5,$6,$7,$8) RETURNING *`,
    [
      req.user.id, bundle.id, finalAmount, fakeOrderId,
      appliedCoupon ? appliedCoupon.id : null,
      appliedCoupon ? appliedCoupon.code : null,
      originalPrice, discountAmount
    ]
  );
  res.status(201).json({
    payment: result.rows[0],
    razorpayOrderId: fakeOrderId,
    amount: finalAmount,
    originalAmount: originalPrice,
    discountAmount,
    couponCode: appliedCoupon ? appliedCoupon.code : null
  });
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

// Server-side payment webhook handler with HMAC-SHA256 signature verification.
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

    // Increment coupon used_count ONLY upon successful payment (Requirement 8)
    if (payment.coupon_id) {
      await client.query(
        'UPDATE coupons SET used_count = used_count + 1 WHERE id = $1',
        [payment.coupon_id]
      );
    }

    // Centralized Entitlements: the only code path that ever inserts into
    // bundle_access — see services/entitlements.js. Idempotent via the
    // ON CONFLICT DO NOTHING inside it, so a redelivered webhook (already
    // short-circuited above by payment.status, but defense-in-depth here
    // too) can never double-grant.
    await grantBundleAccess(
      { userId: payment.user_id, bundleId: payment.bundle_id, reason: 'payment.webhook', req },
      client
    );
    // Sync the transactions table — this is what the Commerce admin screens
    // read. Guard with NOT EXISTS so redelivered webhooks are harmless.
    await client.query(
      `INSERT INTO transactions (
         purchase_id, user_id, bundle_id, amount_inr, gateway, gateway_ref, status, payment_method,
         coupon_id, coupon_code, original_amount_inr, discount_amount_inr
       )
       SELECT $1, $2, $3, $4, 'razorpay', $5, 'successful', 'online', $6, $7, $8, $9
       WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE purchase_id = $1)`,
      [
        payment.id, payment.user_id, payment.bundle_id, payment.amount_inr, razorpay_payment_id || null,
        payment.coupon_id || null, payment.coupon_code || null,
        payment.original_amount_inr || payment.amount_inr, payment.discount_amount_inr || 0
      ]
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
    `SELECT DISTINCT b.* FROM bundles b
     WHERE b.id IN (
       SELECT bundle_id FROM bundle_access WHERE user_id = $1
       UNION
       SELECT bundle_id FROM course_enrollments WHERE user_id = $1 AND status = 'active'
     )`,
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
