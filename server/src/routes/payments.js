const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { grantBundleAccess, revokeBundleAccess } = require('../services/entitlements');
const { enqueueMail } = require('../utils/mailQueue');
const { generateReceiptHtml } = require('../utils/receiptGenerator');

const router = express.Router();

// Configurable course access duration options with standard term discounts
const VALIDITY_OPTIONS = [
  { months: 1, label: '1 Month', discount_pct: 0 },
  { months: 3, label: '3 Months', discount_pct: 5 },
  { months: 6, label: '6 Months', discount_pct: 10 },
  { months: 12, label: '1 Year (12 Months)', discount_pct: 20 },
  { months: 24, label: '2 Years (24 Months)', discount_pct: 30 },
  { months: 36, label: '3 Years (36 Months)', discount_pct: 40 },
];

async function sendPaymentReceiptEmail(paymentId) {
  try {
    const query = `
      SELECT p.*, u.name AS student_name, u.email AS student_email, u.phone AS student_phone,
             b.title AS bundle_title, b.exam_type,
             t.id AS transaction_id, t.gateway_ref, t.payment_method, t.gateway,
             ce.expiry_date, ce.start_date
      FROM payments p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN bundles b ON b.id = p.bundle_id
      LEFT JOIN transactions t ON t.purchase_id = p.id
      LEFT JOIN course_enrollments ce ON ce.user_id = p.user_id AND ce.bundle_id = p.bundle_id
      WHERE p.id = $1
      LIMIT 1
    `;
    const result = await pool.query(query, [paymentId]);
    if (!result.rows.length) return;
    const r = result.rows[0];
    if (!r.student_email) return;

    const receiptHtml = generateReceiptHtml(r);
    const validityStr = r.validity_months ? `${r.validity_months} Months` : '12 Months';
    const expiryStr = r.expiry_date
      ? new Date(r.expiry_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
      : (r.validity_months ? new Date(Date.now() + r.validity_months * 30 * 86400000).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '12 Months');

    await enqueueMail({
      to: r.student_email,
      subject: `Tax Invoice & Payment Receipt #FC-REC-${r.id} — ${r.bundle_title || 'Course'} | FlyCentric`,
      template: 'payment-receipt',
      data: {
        name: r.student_name,
        email: r.student_email,
        paymentId: r.id,
        amountInr: r.amount_inr,
        bundleTitle: r.bundle_title || 'Course Bundle',
        orderId: r.razorpay_order_id,
        transactionId: r.gateway_ref || r.razorpay_payment_id || `TXN-${r.id}`,
        validityMonths: r.validity_months,
        expiryDate: expiryStr,
        originalAmount: r.original_amount_inr || r.amount_inr,
        discountAmount: r.discount_amount_inr || 0,
        couponCode: r.coupon_code,
        paymentMethod: r.payment_method || 'Razorpay Gateway (UPI / Card)',
      },
      attachments: [
        {
          filename: `Tax-Invoice-FC-REC-${r.id}.html`,
          content: receiptHtml,
          contentType: 'text/html',
        },
      ],
    });
    console.log(`[payments] Tax Invoice email successfully enqueued for payment #${paymentId} to ${r.student_email}`);
  } catch (err) {
    console.error(`[payments] Failed to send receipt email for payment #${paymentId}:`, err.message);
  }
}

function calculatePricing(bundlePrice, months, coupon = null) {
  const m = Math.max(1, Number(months) || 1);
  const monthlyRate = Math.max(0, Number(bundlePrice) || 0);

  // Term discount percentage based on duration
  let termDiscountPct = 0;
  if (m >= 36) termDiscountPct = 40;
  else if (m >= 24) termDiscountPct = 30;
  else if (m >= 12) termDiscountPct = 20;
  else if (m >= 6) termDiscountPct = 10;
  else if (m >= 3) termDiscountPct = 5;

  const rawSubtotal = monthlyRate * m;
  const termDiscountAmount = Math.round((rawSubtotal * termDiscountPct) / 100);
  const subtotalAfterTerm = Math.max(0, rawSubtotal - termDiscountAmount);

  let couponDiscountAmount = 0;
  let appliedCoupon = null;

  if (coupon) {
    appliedCoupon = coupon;
    if (coupon.discount_percent != null && Number(coupon.discount_percent) > 0) {
      couponDiscountAmount = Math.round((subtotalAfterTerm * Number(coupon.discount_percent)) / 100);
      if (coupon.max_discount_amount_inr != null && Number(coupon.max_discount_amount_inr) > 0) {
        couponDiscountAmount = Math.min(couponDiscountAmount, Number(coupon.max_discount_amount_inr));
      }
    } else if (coupon.discount_amount_inr != null && Number(coupon.discount_amount_inr) > 0) {
      couponDiscountAmount = Math.min(subtotalAfterTerm, Number(coupon.discount_amount_inr));
    }
  }

  const finalAmount = Math.max(0, subtotalAfterTerm - couponDiscountAmount);

  return {
    monthlyRate,
    months: m,
    termDiscountPct,
    rawSubtotal,
    subtotalAfterTerm,
    couponDiscountAmount,
    totalDiscountAmount: termDiscountAmount + couponDiscountAmount,
    finalAmount,
    appliedCoupon,
  };
}

function getIsRazorpayConfigured() {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  return (
    keyId.length > 0 &&
    keySecret.length > 0 &&
    !keyId.toLowerCase().includes('yourkeyidhere') &&
    !keySecret.toLowerCase().includes('yourkeysecrethere') &&
    !keyId.toLowerCase().includes('paste') &&
    !keySecret.toLowerCase().includes('paste') &&
    (keyId.startsWith('rzp_test_') || keyId.startsWith('rzp_live_'))
  );
}

// NOTE: This runs against Razorpay's real API/webhooks once RAZORPAY_KEY_ID /
// RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET are set as env vars for a live
// deployment. Without live keys, /order creates a local "order" record and
// /webhook can be called directly (as Razorpay would) to prove the
router.get('/config', async (req, res) => {
  const configured = getIsRazorpayConfigured();
  res.json({
    hasRazorpayKeys: configured,
    keyId: configured ? process.env.RAZORPAY_KEY_ID : null,
    validityOptions: VALIDITY_OPTIONS,
  });
});

// Quote endpoint: Calculates real-time price, validity duration multiplier,
// term discounts, and validated coupon deductions on backend
router.post('/quote', authenticate, authorize('student', 'admin', 'instructor'), async (req, res) => {
  const { bundle_id, validity_months = 12, coupon_code } = req.body;
  const bundleResult = await pool.query(
    'SELECT * FROM bundles WHERE id = $1 AND status = $2 AND deleted_at IS NULL',
    [bundle_id, 'live']
  );
  const bundle = bundleResult.rows[0];
  if (!bundle) return res.status(404).json({ error: 'Course bundle not found or unavailable for purchase' });

  let coupon = null;
  if (coupon_code && coupon_code.trim()) {
    const couponResult = await pool.query(
      'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND status = $2',
      [coupon_code.trim(), 'active']
    );
    const c = couponResult.rows[0];
    if (c) {
      const notExpired = !c.expires_at || new Date(c.expires_at) >= new Date();
      const underMax = c.max_uses == null || Number(c.used_count) < Number(c.max_uses);
      const matchesBundle = !c.bundle_id || Number(c.bundle_id) === Number(bundle.id);
      const meetsMinOrder = !c.min_order_amount_inr || Number(bundle.price_inr || 0) >= Number(c.min_order_amount_inr);
      const alreadyUsed = await pool.query(
        `SELECT 1 FROM payments
         WHERE user_id = $1
           AND (coupon_id = $2 OR UPPER(coupon_code) = UPPER($3))
           AND status = 'paid'
         LIMIT 1`,
        [req.user.id, c.id, c.code]
      );
      if (notExpired && underMax && matchesBundle && meetsMinOrder && alreadyUsed.rows.length === 0) {
        coupon = c;
      }
    }
  }

  const quote = calculatePricing(bundle.price_inr, validity_months, coupon);
  res.json({
    bundle_id: bundle.id,
    bundle_title: bundle.title,
    ...quote,
    couponCode: quote.appliedCoupon ? quote.appliedCoupon.code : null,
    validityOptions: VALIDITY_OPTIONS.map((opt) => {
      const optQuote = calculatePricing(bundle.price_inr, opt.months, null);
      return {
        ...opt,
        monthly_rate: optQuote.monthlyRate,
        total_price: optQuote.finalAmount,
      };
    }),
  });
});

router.post('/apply-coupon', authenticate, authorize('student', 'admin', 'instructor'), async (req, res) => {
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

  // A student can use a coupon only once
  const alreadyUsed = await pool.query(
    `SELECT 1 FROM payments
     WHERE user_id = $1
       AND (coupon_id = $2 OR UPPER(coupon_code) = UPPER($3))
       AND status = 'paid'
     LIMIT 1`,
    [req.user.id, coupon.id, coupon.code]
  );
  if (alreadyUsed.rows.length > 0) {
    return res.status(400).json({ error: 'You have already used this coupon code. Each coupon can only be used once per student.' });
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

router.post('/order', authenticate, authorize('student', 'admin', 'instructor'), async (req, res) => {
  const { bundle_id, coupon_code, validity_months = 12 } = req.body;
  const validityMonths = Number(validity_months) > 0 ? Math.floor(Number(validity_months)) : 12;

  // Strict validation: course must exist, be published (live), and not soft-deleted
  const bundleResult = await pool.query(
    'SELECT * FROM bundles WHERE id = $1 AND status = $2 AND deleted_at IS NULL',
    [bundle_id, 'live']
  );
  const bundle = bundleResult.rows[0];
  if (!bundle) {
    return res.status(404).json({ error: 'This course is currently unavailable for enrollment or has been unpublished.' });
  }

  let appliedCoupon = null;
  if (coupon_code && coupon_code.trim()) {
    const couponResult = await pool.query(
      'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND status = $2',
      [coupon_code.trim(), 'active']
    );
    const c = couponResult.rows[0];
    if (c) {
      const notExpired = !c.expires_at || new Date(c.expires_at) >= new Date();
      const underMax = c.max_uses == null || Number(c.used_count) < Number(c.max_uses);
      const matchesBundle = !c.bundle_id || Number(c.bundle_id) === Number(bundle.id);
      const meetsMinOrder = !c.min_order_amount_inr || Number(bundle.price_inr || 0) >= Number(c.min_order_amount_inr);
      const alreadyUsed = await pool.query(
        `SELECT 1 FROM payments
         WHERE user_id = $1
           AND (coupon_id = $2 OR UPPER(coupon_code) = UPPER($3))
           AND status = 'paid'
         LIMIT 1`,
        [req.user.id, c.id, c.code]
      );
      if (alreadyUsed.rows.length > 0) {
        return res.status(400).json({ error: 'You have already used this coupon code. Each coupon can only be used once per student.' });
      }
      if (!notExpired) {
        return res.status(400).json({ error: 'This coupon has expired.' });
      }
      if (!underMax) {
        return res.status(400).json({ error: 'Coupon usage limit has been exceeded.' });
      }
      if (!matchesBundle) {
        return res.status(400).json({ error: 'This coupon is not applicable to the selected course.' });
      }
      if (!meetsMinOrder) {
        return res.status(400).json({ error: `Minimum order value for this coupon is ₹${Number(c.min_order_amount_inr).toLocaleString('en-IN')}` });
      }
      appliedCoupon = c;
    }
  }

  // Calculate pricing server-side — NEVER trust client-submitted prices
  const pricing = calculatePricing(bundle.price_inr, validityMonths, appliedCoupon);
  const originalPrice = pricing.rawSubtotal;
  const discountAmount = pricing.totalDiscountAmount;
  const finalAmount = pricing.finalAmount;

  let razorpayOrderId = null;
  const isRazorpayConfigured = getIsRazorpayConfigured();

  if (isRazorpayConfigured && finalAmount > 0) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          amount: Math.round(finalAmount * 100), // Razorpay expects amount in paise
          currency: 'INR',
          receipt: `rcpt_${Date.now()}_${bundle.id}`,
          notes: { bundle_id: String(bundle.id), user_id: String(req.user.id), validity_months: String(validityMonths) },
        }),
      });
      const rzpData = await rzpRes.json();
      if (rzpRes.ok && rzpData.id) {
        razorpayOrderId = rzpData.id;
      } else {
        console.error('[Razorpay] Order creation failed:', rzpData);
        return res.status(502).json({ error: 'Could not create Razorpay order', detail: rzpData.error?.description || 'Gateway error' });
      }
    } catch (err) {
      console.error('[Razorpay] Network request error:', err);
      return res.status(502).json({ error: 'Could not connect to Razorpay', detail: err.message });
    }
  } else {
    razorpayOrderId = 'order_' + crypto.randomBytes(8).toString('hex');
  }

  const result = await pool.query(
    `INSERT INTO payments (
       user_id, bundle_id, amount_inr, status, razorpay_order_id,
       coupon_id, coupon_code, original_amount_inr, discount_amount_inr, validity_months
     ) VALUES ($1,$2,$3,'created',$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      req.user.id, bundle.id, finalAmount, razorpayOrderId,
      appliedCoupon ? appliedCoupon.id : null,
      appliedCoupon ? appliedCoupon.code : null,
      originalPrice, discountAmount, validityMonths
    ]
  );

  res.status(201).json({
    payment: result.rows[0],
    razorpayOrderId,
    keyId: process.env.RAZORPAY_KEY_ID || null,
    amount: finalAmount,
    currency: 'INR',
    originalAmount: originalPrice,
    discountAmount,
    validityMonths,
    couponCode: appliedCoupon ? appliedCoupon.code : null,
    isLive: isRazorpayConfigured && finalAmount > 0,
  });
});



// Student verification endpoint called by Razorpay modal handler
router.post('/verify', authenticate, authorize('student', 'admin', 'instructor'), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id) {
    return res.status(400).json({ error: 'razorpay_order_id and razorpay_payment_id required' });
  }

  const paymentResult = await pool.query(
    'SELECT * FROM payments WHERE razorpay_order_id = $1 AND user_id = $2',
    [razorpay_order_id, req.user.id]
  );
  const payment = paymentResult.rows[0];
  if (!payment) return res.status(404).json({ error: 'Order not found' });

  if (payment.status === 'paid') {
    return res.json({ ok: true, status: 'paid', message: 'Payment already verified' });
  }

  // Verify HMAC signature if Razorpay Secret is set
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (secret && razorpay_signature) {
    const expected = crypto.createHmac('sha256', secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE payments SET status = 'paid', razorpay_payment_id = $1, razorpay_signature = $2 WHERE id = $3`,
      [razorpay_payment_id, razorpay_signature || null, payment.id]
    );

    if (payment.coupon_id) {
      await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [payment.coupon_id]);
    }

    await grantBundleAccess({ userId: payment.user_id, bundleId: payment.bundle_id, reason: 'payment.verify', req, orderId: payment.id }, client);

    await client.query(
      `INSERT INTO transactions (
         purchase_id, user_id, bundle_id, amount_inr, gateway, gateway_ref, status, payment_method,
         coupon_id, coupon_code, original_amount_inr, discount_amount_inr
       )
       SELECT $1, $2, $3, $4, 'razorpay', $5, 'successful', 'online', $6, $7, $8, $9
       WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE purchase_id = $1)`,
      [
        payment.id, payment.user_id, payment.bundle_id, payment.amount_inr, razorpay_payment_id,
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

  // Dispatch official Tax Invoice email
  sendPaymentReceiptEmail(payment.id);

  res.json({ ok: true, status: 'paid' });
});

router.post('/enroll-free', authenticate, authorize('student', 'admin', 'instructor'), async (req, res) => {
  const result = await pool.query(
    'SELECT id, title, is_free, price_inr FROM bundles WHERE id = $1 AND status = $2 AND deleted_at IS NULL',
    [req.body.bundle_id, 'live']
  );
  const bundle = result.rows[0];
  if (!bundle || (!bundle.is_free && Number(bundle.price_inr) > 0)) {
    return res.status(400).json({ error: 'This bundle requires payment.' });
  }
  const { granted } = await grantBundleAccess({ userId: req.user.id, bundleId: bundle.id, reason: 'free.enrollment', req });

  // Send free enrollment confirmation email
  pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.id])
    .then(({ rows }) => {
      if (rows[0]?.email) {
        enqueueMail({
          to: rows[0].email,
          subject: `Enrollment Confirmed: ${bundle.title || 'Course'} — FlyCentric`,
          template: 'enrollment-confirmation',
          data: {
            name: rows[0].name,
            bundleTitle: bundle.title || 'Course Bundle',
          },
        });
      }
    })
    .catch((err) => console.warn('[payments] Failed to send free enrollment email:', err.message));

  res.status(201).json({ ok: true, granted });
});

// Server-side payment webhook handler with HMAC-SHA256 signature verification.
router.post(['/webhook', '/razorpay/webhook'], async (req, res) => {
  const isDemo = String(req.body?.razorpay_payment_id || '').startsWith('demo_') && !getIsRazorpayConfigured();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (webhookSecret && !isDemo) {
    const signature = req.headers['x-razorpay-signature'];
    const expected = crypto.createHmac('sha256', webhookSecret).update(req.rawBody || Buffer.from(JSON.stringify(req.body))).digest('hex');
    const provided = Buffer.from(String(signature || ''), 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const valid = signature && provided.length === expectedBuf.length && crypto.timingSafeEqual(provided, expectedBuf);
    if (!valid) return res.status(400).json({ error: 'Invalid webhook signature' });
  } else if (process.env.NODE_ENV === 'production' && !isDemo) {
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
      { userId: payment.user_id, bundleId: payment.bundle_id, reason: 'payment.webhook', req, orderId: payment.id },
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

  // Dispatch official Tax Invoice email
  sendPaymentReceiptEmail(payment.id);

  res.json({ ok: true, status: 'paid' });
});

// Student's active and enrolled courses with precise validity, access windows, and expiry countdowns
router.get('/my-access', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (b.id)
         b.*,
         COALESCE(ce.expiry_date, ba.expires_at) AS expires_at,
         COALESCE(ce.start_date, ba.granted_at) AS enrolled_at,
         COALESCE(ba.validity_months, ce.validity_months, 12) AS validity_months,
         CASE
           WHEN COALESCE(ce.expiry_date, ba.expires_at) IS NOT NULL AND COALESCE(ce.expiry_date, ba.expires_at) < now() THEN 'expired'
           WHEN COALESCE(ce.expiry_date, ba.expires_at) IS NOT NULL AND COALESCE(ce.expiry_date, ba.expires_at) <= now() + interval '7 days' THEN 'expiring_soon'
           ELSE 'active'
         END AS access_status,
         CASE
           WHEN COALESCE(ce.expiry_date, ba.expires_at) IS NOT NULL
           THEN CEIL(EXTRACT(EPOCH FROM (COALESCE(ce.expiry_date, ba.expires_at) - now())) / 86400)::int
           ELSE NULL
         END AS days_remaining
       FROM bundles b
       LEFT JOIN bundle_access ba ON ba.bundle_id = b.id AND ba.user_id = $1
       LEFT JOIN course_enrollments ce ON ce.bundle_id = b.id AND ce.user_id = $1
       WHERE (ba.bundle_id IS NOT NULL OR ce.bundle_id IS NOT NULL)
         AND b.deleted_at IS NULL
         AND COALESCE(ce.status, 'active') != 'cancelled'
       ORDER BY b.id, COALESCE(ce.expiry_date, ba.expires_at) DESC NULLS LAST`,
      [req.user.id]
    );
    res.json({ bundles: result.rows });
  } catch (err) {
    console.error('[/payments/my-access error]', err.message);
    res.status(500).json({ error: 'Failed to fetch enrolled access', detail: err.message });
  }
});

// Student purchase & transaction history with receipts, coupons, and validity details
router.get('/my-purchases', authenticate, async (req, res) => {
  const result = await pool.query(
    `SELECT p.*,
            b.title AS bundle_title, b.exam_type, b.thumbnail_url,
            t.id AS transaction_id, t.gateway_ref, t.payment_method,
            ce.expiry_date, ce.status AS enrollment_status,
            CASE
              WHEN ce.expiry_date IS NOT NULL AND ce.expiry_date < now() THEN 'expired'
              WHEN ce.expiry_date IS NOT NULL AND ce.expiry_date <= now() + interval '7 days' THEN 'expiring_soon'
              ELSE COALESCE(ce.status, p.status)
            END AS calculated_access_status
     FROM payments p
     LEFT JOIN bundles b ON b.id = p.bundle_id
     LEFT JOIN transactions t ON t.purchase_id = p.id
     LEFT JOIN course_enrollments ce ON ce.user_id = p.user_id AND ce.bundle_id = p.bundle_id
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  res.json({ purchases: result.rows });
});

// Fetch detailed JSON receipt data for an order
router.get('/:id/receipt', authenticate, async (req, res) => {
  const isStaff = req.user.role === 'admin' || req.user.role === 'instructor';
  const query = `
    SELECT p.*, u.name AS student_name, u.email AS student_email, u.phone AS student_phone,
           b.title AS bundle_title, b.exam_type,
           t.id AS transaction_id, t.gateway_ref, t.payment_method, t.gateway,
           ce.expiry_date, ce.start_date
    FROM payments p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN bundles b ON b.id = p.bundle_id
    LEFT JOIN transactions t ON t.purchase_id = p.id
    LEFT JOIN course_enrollments ce ON ce.user_id = p.user_id AND ce.bundle_id = p.bundle_id
    WHERE p.id = $1 ${isStaff ? '' : 'AND p.user_id = $2'}
    LIMIT 1
  `;
  const params = isStaff ? [req.params.id] : [req.params.id, req.user.id];
  const result = await pool.query(query, params);
  if (!result.rows.length) return res.status(404).json({ error: 'Receipt not found' });
  res.json({ receipt: result.rows[0] });
});

// Render official, printable Tax Invoice & Payment Receipt in HTML/PDF format
router.get('/:id/receipt/html', authenticate, async (req, res) => {
  const isStaff = req.user.role === 'admin' || req.user.role === 'instructor';
  const query = `
    SELECT p.*, u.name AS student_name, u.email AS student_email, u.phone AS student_phone,
           b.title AS bundle_title, b.exam_type,
           t.id AS transaction_id, t.gateway_ref, t.payment_method, t.gateway,
           ce.expiry_date, ce.start_date
    FROM payments p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN bundles b ON b.id = p.bundle_id
    LEFT JOIN transactions t ON t.purchase_id = p.id
    LEFT JOIN course_enrollments ce ON ce.user_id = p.user_id AND ce.bundle_id = p.bundle_id
    WHERE p.id = $1 ${isStaff ? '' : 'AND p.user_id = $2'}
    LIMIT 1
  `;
  const params = isStaff ? [req.params.id] : [req.params.id, req.user.id];
  const result = await pool.query(query, params);
  if (!result.rows.length) return res.status(404).send('Receipt not found');
  const html = generateReceiptHtml(result.rows[0]);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Resend payment receipt email
router.post('/:id/resend-receipt', authenticate, async (req, res) => {
  const isStaff = req.user.role === 'admin' || req.user.role === 'instructor';
  const query = `
    SELECT p.*, u.name, u.email, b.title AS bundle_title
    FROM payments p
    JOIN users u ON u.id = p.user_id
    JOIN bundles b ON b.id = p.bundle_id
    WHERE p.id = $1 ${isStaff ? '' : 'AND p.user_id = $2'}
  `;
  const params = isStaff ? [req.params.id] : [req.params.id, req.user.id];
  const result = await pool.query(query, params);
  if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });
  const row = result.rows[0];

  try {
    await sendPaymentReceiptEmail(row.id);
    res.json({ ok: true, message: `Official tax invoice and receipt sent to ${row.email}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send receipt email', detail: err.message });
  }
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
