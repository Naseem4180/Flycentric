import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag, Search, Filter, Download, Eye, Receipt,
  CheckCircle2, Clock, AlertCircle, RotateCcw, Calendar, ArrowRight, Tag
} from 'lucide-react';
import { api, BASE_URL } from '../api';
import useAuth from '../context/useAuth';
import {
  PageHeader, Card, Button, Modal, EmptyState, ErrorState, Badge
} from '../ui';

function getReceiptUrl(paymentId) {
  const token = localStorage.getItem('fc_access');
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${BASE_URL}/payments/${paymentId}/receipt/html${tokenParam}`;
}

export default function MyPurchases() {
  const { user } = useAuth();
  const [purchases, setPurchases] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/payments/my-purchases')
      .then((res) => setPurchases(res.purchases || []))
      .catch((err) => {
        setError(err.message || 'Failed to load purchase history');
        setPurchases([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = purchases || [];
    if (statusFilter !== 'all') {
      list = list.filter((p) => {
        const s = String(p.status || '').toLowerCase();
        if (statusFilter === 'paid') return s === 'paid' || s === 'successful' || s === 'completed';
        if (statusFilter === 'failed') return s === 'failed';
        if (statusFilter === 'created') return s === 'created' || s === 'pending';
        if (statusFilter === 'refunded') return s === 'refunded';
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        (p.bundle_title || '').toLowerCase().includes(q) ||
        (p.razorpay_order_id || '').toLowerCase().includes(q) ||
        (p.razorpay_payment_id || '').toLowerCase().includes(q) ||
        (p.coupon_code || '').toLowerCase().includes(q) ||
        String(p.id).includes(q)
      );
    }
    return list;
  }, [purchases, statusFilter, search]);

  return (
    <div className="admin-main-inner my-purchases-page">
      <div className="subject-crumb" style={{ marginBottom: 16 }}>
        <Link to="/"><Clock size={15} /> Dashboard</Link>
        <span>/</span>
        <strong>My Purchases & Invoices</strong>
      </div>

      <PageHeader
        title="Purchase & Payment History"
        subtitle="View all course orders, transaction receipts, access validity windows, and tax invoices."
      />

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div className="search-box" style={{ flex: 1, minWidth: 260 }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by order ID, course title, or transaction ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Orders' },
              { id: 'paid', label: 'Successful' },
              { id: 'created', label: 'Pending' },
              { id: 'failed', label: 'Failed' },
              { id: 'refunded', label: 'Refunded' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`btn btn-xs ${statusFilter === f.id ? 'btn-primary' : 'btn-outline'}`}
                style={{ borderRadius: 999, padding: '4px 12px', fontSize: '.76rem' }}
                onClick={() => setStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading your purchase history…</div>
        ) : error ? (
          <ErrorState title="Failed to load orders" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No purchases found"
            description={search ? "No orders matched your search criteria." : "You haven't made any course purchases yet."}
            action={
              <Link to="/explore" className="btn btn-primary btn-sm">
                Explore Available Bundles
              </Link>
            }
          />
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Order Ref</th>
                  <th>Course Title</th>
                  <th>Validity</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Purchase Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isPaid = p.status === 'paid' || p.status === 'successful' || p.status === 'completed';
                  const isFailed = p.status === 'failed';
                  const isRefunded = p.status === 'refunded';

                  return (
                    <tr key={p.id}>
                      <td data-label="Order Ref">
                        <strong style={{ fontSize: '0.86rem', fontFamily: 'monospace' }}>
                          {p.razorpay_order_id ? p.razorpay_order_id.replace(/^order_/, 'ORD-') : `FC-ORD-${p.id}`}
                        </strong>
                        <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                          Receipt: FC-REC-{p.id}
                        </div>
                      </td>
                      <td data-label="Course Title">
                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                          {p.bundle_title || `Course Bundle #${p.bundle_id}`}
                        </div>
                        <span className="badge badge-role" style={{ fontSize: '.68rem', padding: '1px 6px' }}>
                          {p.exam_type || 'CPL'}
                        </span>
                      </td>
                      <td data-label="Validity">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', fontWeight: 600 }}>
                          <Clock size={13} style={{ color: '#4f46e5' }} />
                          {p.validity_months ? `${p.validity_months} Months` : '12 Months'}
                        </div>
                        {p.expiry_date && (
                          <div style={{ fontSize: '0.72rem', color: p.calculated_access_status === 'expired' ? '#dc2626' : (p.calculated_access_status === 'expiring_soon' ? '#b45309' : 'var(--muted)') }}>
                            Until: {new Date(p.expiry_date).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td data-label="Amount">
                        <strong style={{ fontSize: '0.92rem' }}>
                          ₹{Number(p.amount_inr || 0).toLocaleString('en-IN')}
                        </strong>
                        {Number(p.discount_amount_inr || 0) > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#16a34a' }}>
                            -₹{Number(p.discount_amount_inr).toLocaleString('en-IN')} {p.coupon_code ? `(${p.coupon_code})` : ''}
                          </div>
                        )}
                      </td>
                      <td data-label="Status">
                        <Badge tone={isPaid ? 'green' : isFailed ? 'red' : isRefunded ? 'amber' : 'slate'}>
                          {isPaid ? 'SUCCESSFUL' : p.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td data-label="Purchase Date">
                        <div style={{ fontSize: '0.82rem', color: 'var(--text)' }}>
                          {new Date(p.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                          {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td data-label="Actions" style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Eye}
                            onClick={() => setSelectedOrder(p)}
                            title="View Full Payment Breakdown"
                          >
                            Details
                          </Button>
                          {isPaid && (
                            <a
                              href={getReceiptUrl(p.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-outline btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                              title="View & Download Official Tax Invoice Receipt"
                            >
                              <Receipt size={13} /> Receipt
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Payment Details Modal */}
      {selectedOrder && (
        <Modal
          title={`Order #${selectedOrder.id} Transaction Details`}
          onClose={() => setSelectedOrder(null)}
        >
          <div className="stack" style={{ gap: 16 }}>
            <div style={{ background: 'var(--surface-alt)', padding: 16, borderRadius: 10, border: '1px solid var(--border)' }}>
              <div className="row row-between" style={{ marginBottom: 8 }}>
                <span className="td-muted">Receipt Number:</span>
                <strong>FC-REC-{selectedOrder.id}</strong>
              </div>
              <div className="row row-between" style={{ marginBottom: 8 }}>
                <span className="td-muted">Order Reference:</span>
                <span style={{ fontFamily: 'monospace', fontSize: '.84rem' }}>{selectedOrder.razorpay_order_id || `ORD-${selectedOrder.id}`}</span>
              </div>
              <div className="row row-between" style={{ marginBottom: 8 }}>
                <span className="td-muted">Transaction ID:</span>
                <span style={{ fontFamily: 'monospace', fontSize: '.84rem' }}>{selectedOrder.razorpay_payment_id || selectedOrder.gateway_ref || 'Local / Demo'}</span>
              </div>
              <div className="row row-between" style={{ marginBottom: 8 }}>
                <span className="td-muted">Order Date & Time:</span>
                <span>{new Date(selectedOrder.created_at).toLocaleString()}</span>
              </div>
              <div className="row row-between">
                <span className="td-muted">Payment Status:</span>
                <Badge tone={selectedOrder.status === 'paid' ? 'green' : 'amber'}>
                  {selectedOrder.status.toUpperCase()}
                </Badge>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Purchased Course Details</h4>
              <div style={{ padding: '12px 14px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong>{selectedOrder.bundle_title || `Course #${selectedOrder.bundle_id}`}</strong>
                  <span className="badge badge-role">{selectedOrder.exam_type || 'CPL'}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: '0.82rem', color: 'var(--muted)' }}>
                  <span>Validity: <strong>{selectedOrder.validity_months ? `${selectedOrder.validity_months} Months` : '12 Months'}</strong></span>
                  {selectedOrder.expiry_date && (
                    <span>Access Expiry: <strong style={{ color: '#4f46e5' }}>{new Date(selectedOrder.expiry_date).toLocaleDateString()}</strong></span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Price & Payment Summary</h4>
              <div style={{ padding: '12px 14px', background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem' }}>
                <div className="row row-between" style={{ marginBottom: 6 }}>
                  <span className="td-muted">Course Subtotal:</span>
                  <span>₹{Number(selectedOrder.original_amount_inr || selectedOrder.amount_inr || 0).toLocaleString('en-IN')}</span>
                </div>
                {Number(selectedOrder.discount_amount_inr || 0) > 0 && (
                  <div className="row row-between" style={{ marginBottom: 6, color: '#16a34a' }}>
                    <span>Promo Discount {selectedOrder.coupon_code ? `(${selectedOrder.coupon_code})` : ''}:</span>
                    <span>-₹{Number(selectedOrder.discount_amount_inr).toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="row row-between" style={{ paddingTop: 8, borderTop: '1px solid var(--border)', fontWeight: 800, fontSize: '0.96rem' }}>
                  <span>Total Paid:</span>
                  <span style={{ color: '#0f172a' }}>₹{Number(selectedOrder.amount_inr || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <div className="row row-between" style={{ marginTop: 8 }}>
              {selectedOrder.status === 'paid' && (
                <a
                  href={getReceiptUrl(selectedOrder.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Receipt size={14} /> Open Official Receipt & Print
                </a>
              )}
              <Button variant="ghost" onClick={() => setSelectedOrder(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

