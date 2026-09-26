import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Tag, CheckCircle2, AlertCircle, Clock, Receipt } from 'lucide-react';
import { api } from '../api';
import { readCart, removeFromCart, addToCart } from '../utils/cart';
import useAuth from '../context/useAuth';

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.getElementById('razorpay-checkout-js');
    if (existing) {
      existing.onload = () => resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-checkout-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function Checkout() {
  const { user } = useAuth();
  const { bundleId } = useParams();
  const [bundles, setBundles] = useState(() => readCart());
  const [completedBundles, setCompletedBundles] = useState([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [validityMonths, setValidityMonths] = useState(12);
  const [quote, setQuote] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/payments/config').then(setGatewayConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!bundleId) return;
    api.get('/content/bundles?status=live')
      .then((d) => {
        const found = (d.bundles || []).find((b) => String(b.id) === String(bundleId));
        if (found) {
          addToCart(found);
          setBundles((curr) => {
            if (curr.some((item) => String(item.id) === String(found.id))) return curr;
            return [...curr, found];
          });
        }
      })
      .catch(() => {});
  }, [bundleId]);

  const primaryBundle = bundles[0];

  // Fetch real-time server quote for validity pricing and coupon discount
  useEffect(() => {
    if (!primaryBundle) return;
    api.post('/payments/quote', {
      bundle_id: primaryBundle.id,
      validity_months: validityMonths,
      coupon_code: appliedCoupon ? appliedCoupon.code : (couponCode.trim() || undefined),
    })
      .then((q) => {
        setQuote(q);
      })
      .catch(() => {});
  }, [primaryBundle, validityMonths, appliedCoupon]);

  const originalTotal = quote ? quote.rawSubtotal : bundles.reduce((sum, b) => sum + Number(b.price_inr || 0), 0);
  const discountAmount = quote ? quote.totalDiscountAmount : (appliedCoupon ? Number(appliedCoupon.discount_amount || 0) : 0);
  const finalPayable = quote ? quote.finalAmount : Math.max(0, originalTotal - discountAmount);

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
        const orderData = await api.post('/payments/order', {
          bundle_id: bundle.id,
          coupon_code: appliedCoupon ? appliedCoupon.code : null,
          validity_months: validityMonths,
        });

        // If Razorpay live/test credentials are configured on server and payment is required
        if (orderData.isLive && orderData.keyId) {
          const loaded = await loadRazorpayScript();
          if (!loaded) throw new Error('Razorpay Checkout failed to load. Please check your network connection.');

          await new Promise((resolve, reject) => {
            const options = {
              key: orderData.keyId,
              amount: Math.round(orderData.amount * 100),
              currency: 'INR',
              name: 'FlyCentric',
              description: bundle.title,
              order_id: orderData.razorpayOrderId,
              handler: async (response) => {
                try {
                  await api.post('/payments/verify', {
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                  });
                  resolve();
                } catch (vErr) {
                  reject(vErr);
                }
              },
              prefill: {
                name: user?.name || '',
                email: user?.email || '',
                contact: user?.phone || '',
              },
              theme: { color: '#6366f1' },
              modal: {
                ondismiss: () => {
                  reject(new Error('Payment window closed.'));
                },
              },
            };
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (resp) => {
              reject(new Error(resp.error?.description || 'Payment was unsuccessful'));
            });
            rzp.open();
          });
        } else {
          // Dev / Demo mode (when no Razorpay keys are configured)
          await api.post('/payments/webhook', {
            razorpay_order_id: orderData.razorpayOrderId,
            razorpay_payment_id: `demo_${Date.now()}`,
            event: 'payment.captured',
          }, { auth: false });
        }
      }

      setCompletedBundles(bundles);
      localStorage.removeItem('fc_cart_bundles');
      localStorage.removeItem('fc_cart_bundle');
      window.dispatchEvent(new Event('cartchange'));
      setBundles([]);
      setIsSuccess(true);
      setMessage('Enrollment confirmed! Your courses are ready in your dashboard.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (isSuccess) {
    return (
      <main className="public-page checkout-page">
        <div className="checkout-card center" style={{ maxWidth: 540, padding: '36px 28px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
            <CheckCircle2 size={36} />
          </div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.45rem', fontWeight: 800 }}>Enrollment Confirmed!</h1>
          <p style={{ margin: '0 0 20px 0', color: 'var(--muted)', fontSize: '0.92rem' }}>
            {completedBundles.length > 0 ? (
              <>You now have full access to <strong>{completedBundles.map((b) => b.title).join(', ')}</strong>.</>
            ) : (
              'Your courses are now unlocked in your account.'
            )}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link className="btn btn-hero" to="/my-subjects" style={{ textDecoration: 'none' }}>
              Go to My Courses →
            </Link>
            <Link className="btn btn-outline" to="/my-purchases" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Receipt size={15} /> View Receipt & Invoices
            </Link>
            <Link className="btn btn-outline" to="/" style={{ textDecoration: 'none' }}>
              Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
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

        {gatewayConfig && !gatewayConfig.hasRazorpayKeys ? (
          <div style={{ padding: '10px 14px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 10, fontSize: '0.8rem', color: '#b45309', margin: '14px 0 8px 0', lineHeight: 1.5 }}>
            <strong>Demo Mode Active:</strong> Razorpay API keys are not set in <code>server/.env</code>. Clicking Pay will confirm enrollment instantly. To trigger the real Razorpay payment modal, add <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> in <code>server/.env</code> and restart the server.
          </div>
        ) : gatewayConfig?.hasRazorpayKeys ? (
          <div style={{ padding: '8px 12px', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: 10, fontSize: '0.8rem', color: '#4338ca', margin: '14px 0 8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} color="#6366f1" /> Razorpay Payment Gateway Connected
          </div>
        ) : null}

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

        {/* Validity / Subscription Duration (Requirement 7 & 8) */}
        <div style={{ background: 'var(--surface-alt,#f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginTop: 18 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent: 'space-between', gap:6, marginBottom:10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={15} style={{color:'#4338ca'}} />
              <span style={{ fontWeight:700, fontSize:'.84rem', color:'var(--text)' }}>Select Course Validity</span>
            </div>
            {quote?.termDiscountPct > 0 && (
              <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a' }}>
                Save {quote.termDiscountPct}% with term plan
              </span>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap:8 }}>
            {(quote?.validityOptions || gatewayConfig?.validityOptions || [
              { months: 1, label: '1 Month' },
              { months: 3, label: '3 Months' },
              { months: 6, label: '6 Months' },
              { months: 12, label: '12 Months' },
            ]).map((opt) => {
              const v = opt.months;
              const isSelected = validityMonths === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setValidityMonths(v)}
                  style={{
                    padding:'10px 12px',
                    borderRadius:8,
                    border: isSelected ? '2px solid #4f46e5' : '1.5px solid var(--border)',
                    background: isSelected ? 'rgba(79,70,229,0.08)' : 'var(--surface)',
                    color: isSelected ? '#4338ca' : 'var(--text)',
                    fontWeight: isSelected ? 700 : 500,
                    fontSize:'.82rem',
                    cursor:'pointer',
                    display:'flex',
                    flexDirection:'column',
                    alignItems:'center',
                    gap:3,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{opt.label}</span>
                  {opt.total_price != null && (
                    <strong style={{ fontSize: '.78rem', color: isSelected ? '#4338ca' : 'var(--text)' }}>
                      ₹{Number(opt.total_price).toLocaleString('en-IN')}
                    </strong>
                  )}
                  {opt.discount_pct > 0 && (
                    <span style={{ fontSize: '.68rem', color: '#16a34a', fontWeight: 600 }}>
                      {opt.discount_pct}% off
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p style={{margin:'8px 0 0',fontSize:'.74rem',color:'var(--muted)'}}>Access valid from purchase date. Term extensions can be renewed anytime.</p>
        </div>

        {/* Coupon Application Box (Requirement 9) */}
        <div style={{ marginTop: 16, padding: 14, background: 'var(--surface-sunken)', borderRadius: 10, border: '1px solid var(--line)' }}>
          <label style={{ fontSize: '0.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Tag size={15} style={{ color: 'var(--blue)' }} /> Have a Promo / Coupon Code?
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="input"
              style={{ textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em' }}
              placeholder="e.g. SAVE20"
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

        {/* Price Breakdown Calculation (Requirement 8 & 9) */}
        <div style={{ marginTop: 16, padding: '14px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.88rem' }}>
            <span className="muted">Course Subtotal ({validityMonths} Months):</span>
            <span>₹{originalTotal.toLocaleString('en-IN')}</span>
          </div>

          {discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.88rem', color: '#16a34a' }}>
              <span>Total Savings / Discount {appliedCoupon ? `(${appliedCoupon.code})` : ''}:</span>
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
