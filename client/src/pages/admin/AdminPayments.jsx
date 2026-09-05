import { useEffect, useState } from 'react';
import { api } from '../../api';

export default function AdminPayments() {
  const [payments, setPayments] = useState([]);

  function load() {
    api.get('/payments').then((d) => setPayments(d.payments));
  }
  useEffect(load, []);

  async function refund(id) {
    if (!window.confirm('Refund this payment and revoke bundle access?')) return;
    await api.post(`/payments/${id}/refund`);
    load();
  }

  return (
    <div className="card">
      <h3>Transactions</h3>
      <table>
        <thead><tr><th>User</th><th>Bundle</th><th>Amount</th><th>Status</th><th>Razorpay order</th><th></th></tr></thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>{p.email}</td>
              <td>{p.bundle_title}</td>
              <td>₹{p.amount_inr}</td>
              <td><span className={`badge ${p.status === 'paid' ? 'badge-live' : 'badge-draft'}`}>{p.status}</span></td>
              <td className="muted" style={{ fontSize: '0.75rem' }}>{p.razorpay_order_id}</td>
              <td>{p.status === 'paid' && <button className="btn btn-danger btn-sm" onClick={() => refund(p.id)}>Refund</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!payments.length && <p className="muted">No transactions yet.</p>}
    </div>
  );
}
