import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Tag, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../api';
import { readCart, removeFromCart } from '../utils/cart';

export default function Checkout() {
  const [bundles, setBundles] = useState(() => readCart());
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const primaryBundle = bundles[0];
  const originalTotal = bundles.reduce((sum, b) => sum + Number(b.price_inr || 0), 0);
  const discountAmount = appliedCoupon ? Number(appliedCoupon.discount_amount || 0) : 0;
  const finalPayable = Math.max(0, originalTotal - discountAmount);

  async function handleApplyCoupon(e) {
    if (e) e.preventDefault();
    if (!couponCode.trim()) {
      setCouponError('Please enter a coupon code');
      return;
    }
    if (!primaryBundle) return;

    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await api.post('/payments/apply-coupon', {
        code: couponCode.trim(),
        bundle_id: primaryBundle.id,
      });
      setAppliedCoupon(res);
      setCouponError('');
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err.message || 'Invalid or inapplicable coupon');
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  }

  async function pay() {
    if (!bundles.length) return;
    setBusy(true);
    setMessage('');
    try {
      for (const bundle of bundles) {
        const order = await api.post('/payments/order', {
          bundle_id: bundle.id,
          coupon_code: appliedCoupon ? appliedCoupon.code : null,
        });

        await api.post('/payments/webhook', {
          razorpay_order_id: order.razorpayOrderId,
          razorpay_payment_id: `demo_${Date.now()}`,
          event: 'payment.captured',
        }, { auth: false });
      }

      localStorage.removeItem('fc_cart_bundles');
      localStorage.removeItem('fc_cart_bundle');
      window.dispatchEvent(new Event('cartchange'));
      setBundles([]);
      setMessage('Enrollment confirmed. Your courses are ready.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!bundles.length) {
    return (
      <main className="public-page checkout-page">
        <div className="checkout-card center">
          <div className="empty-icon">▣</div>
          <h1>No courses in cart</h1>
          <p>Add a paid bundle before checking out.</p>
          <Link className="btn btn-hero" to="/courses">Browse courses</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="public-page checkout-page">
      <div className="checkout-card" style={{ maxWidth: 560 }}>
        <span className="section-kicker">Secure Checkout</span>
        <h1>Complete your enrollment</h1>

        <div className="checkout-items" style={{ marginTop: 16 }}>
          {bundles.map((bundle) => (
            <div className="checkout-summary" key={bundle.id} style={{ padding: '12px 14px' }}>
              <div>
                <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{bundle.exam_type}</span>
                <h3 style={{ margin: '2px 0 0', fontSize: '0.98rem' }}>{bundle.title}</h3>
              </div>
              <strong>₹{Number(bundle.price_inr || 0).toLocaleString('en-IN')}</strong>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  removeFromCart(bundle.id);
                  const updated = readCart();
                  setBundles(updated);
                  if (!updated.length) setAppliedCoupon(null);
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* Coupon Application Box (Requirement 8) */}
        <div style={{ marginTop: 20, padding: 14, background: 'var(--surface-sunken)', borderRadius: 10, border: '1px solid var(--line)' }}>
          <label style={{ fontSize: '0.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Tag size={15} style={{ color: 'var(--blue)' }} /> Have a Promo / Coupon Code?
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="input"
              style={{ textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em' }}
              placeholder="e.g. ABC100"
              value={couponCode}
              disabled={Boolean(appliedCoupon)}
              onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
            />
            {appliedCoupon ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={removeCoupon}>
                Remove
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={couponLoading || !couponCode.trim()}
                onClick={handleApplyCoupon}
              >
                {couponLoading ? 'Applying…' : 'Apply'}
              </button>
            )}
          </div>

          {couponError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: '0.78rem', marginTop: 8 }}>
              <AlertCircle size={14} /> {couponError}
            </div>
          )}

          {appliedCoupon && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#16a34a', fontSize: '0.82rem', marginTop: 8, fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle2 size={14} /> Coupon <strong>{appliedCoupon.code}</strong> applied!
              </span>
              <span>-₹{discountAmount.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>

        {/* Price Breakdown Calculation (Requirement 8: Original Price -> Coupon Discount -> Final Payable Amount) */}
        <div style={{ marginTop: 20, padding: '14px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.88rem' }}>
            <span className="muted">Original Price:</span>
            <span>₹{originalTotal.toLocaleString('en-IN')}</span>
          </div>

          {appliedCoupon && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.88rem', color: '#16a34a' }}>
              <span>Coupon Discount ({appliedCoupon.code}):</span>
              <span>-₹{discountAmount.toLocaleString('en-IN')}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: '1.05rem', fontWeight: 800 }}>
            <span>Final Payable Amount:</span>
            <span style={{ color: '#0f172a' }}>₹{finalPayable.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {message && (
          <p className={message.startsWith('Enrollment') ? 'success-banner' : 'error-banner'} style={{ marginTop: 14 }}>
            {message}
          </p>
        )}

        {message.startsWith('Enrollment') ? (
          <button className="btn btn-hero full" style={{ marginTop: 14 }} onClick={() => navigate('/')}>
            Go to dashboard
          </button>
        ) : (
          <button
            className="btn btn-hero full"
            style={{ marginTop: 14 }}
            disabled={busy}
            onClick={pay}
          >
            {busy ? 'Processing…' : `Pay ₹${finalPayable.toLocaleString('en-IN')}`}
          </button>
        )}

        <p className="payment-note" style={{ marginTop: 12 }}>
          FlyCentric verified checkout. Discounts are verified server-side and recorded upon transaction completion.
        </p>
      </div>
    </main>
  );
}
