import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Checkout() {
  const [bundle] = useState(() => { try { return JSON.parse(localStorage.getItem('fc_cart_bundle')); } catch { return null; } });
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const navigate = useNavigate();
  async function pay() {
    if (!bundle) return; setBusy(true); setMessage('');
    try { const order = await api.post('/payments/order', { bundle_id: bundle.id }); await api.post('/payments/webhook', { razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: `demo_${Date.now()}`, event: 'payment.captured' }, { auth: false }); localStorage.removeItem('fc_cart_bundle'); setMessage('Enrollment confirmed. Your course is ready.'); }
    catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  if (!bundle) return <main className="public-page checkout-page"><div className="checkout-card center"><div className="empty-icon">▣</div><h1>No bundle selected</h1><p>Select a course bundle before checking out.</p><Link className="btn btn-hero" to="/courses">Browse courses</Link></div></main>;
  return <main className="public-page checkout-page"><div className="checkout-card"><span className="section-kicker">Secure checkout</span><h1>Complete your enrollment</h1><div className="checkout-summary"><span>{bundle.exam_type}</span><h3>{bundle.title}</h3><p>{bundle.description}</p><strong>₹{Number(bundle.price_inr || 0).toLocaleString('en-IN')}</strong></div>{message && <p className={message.startsWith('Enrollment') ? 'success-banner' : 'error-banner'}>{message}</p>}{message.startsWith('Enrollment') ? <button className="btn btn-hero full" onClick={() => navigate('/')}>Go to dashboard</button> : <button className="btn btn-hero full" disabled={busy} onClick={pay}>{busy ? 'Processing…' : 'Confirm demo payment'}</button>}<p className="payment-note">Development checkout. Connect Razorpay keys before accepting real payments.</p></div></main>;
}
