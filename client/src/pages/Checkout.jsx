import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { readCart, removeFromCart } from '../utils/cart';

export default function Checkout() {
  const [bundles, setBundles] = useState(() => readCart());
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const navigate = useNavigate();
  async function pay() {
    if (!bundles.length) return; setBusy(true); setMessage('');
    try { for (const bundle of bundles) { const order = await api.post('/payments/order', { bundle_id: bundle.id }); await api.post('/payments/webhook', { razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: `demo_${Date.now()}`, event: 'payment.captured' }, { auth: false }); } localStorage.removeItem('fc_cart_bundles'); localStorage.removeItem('fc_cart_bundle'); window.dispatchEvent(new Event('cartchange')); setBundles([]); setMessage('Enrollment confirmed. Your courses are ready.'); }
    catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  if (!bundles.length) return <main className="public-page checkout-page"><div className="checkout-card center"><div className="empty-icon">▣</div><h1>No courses in cart</h1><p>Add a paid bundle before checking out.</p><Link className="btn btn-hero" to="/courses">Browse courses</Link></div></main>;
  return <main className="public-page checkout-page"><div className="checkout-card"><span className="section-kicker">Your cart</span><h1>Complete your enrollment</h1><div className="checkout-items">{bundles.map((bundle) => <div className="checkout-summary" key={bundle.id}><div><span>{bundle.exam_type}</span><h3>{bundle.title}</h3></div><strong>₹{Number(bundle.price_inr || 0).toLocaleString('en-IN')}</strong><button className="btn btn-outline btn-sm" onClick={() => { removeFromCart(bundle.id); setBundles(readCart()); }}>Remove</button></div>)}</div>{message && <p className={message.startsWith('Enrollment') ? 'success-banner' : 'error-banner'}>{message}</p>}{message.startsWith('Enrollment') ? <button className="btn btn-hero full" onClick={() => navigate('/')}>Go to dashboard</button> : <button className="btn btn-hero full" disabled={busy} onClick={pay}>{busy ? 'Processing…' : `Pay ₹${bundles.reduce((sum, b) => sum + Number(b.price_inr || 0), 0).toLocaleString('en-IN')}`}</button>}<p className="payment-note">Development checkout. Connect Razorpay keys before accepting real payments.</p></div></main>;
}
