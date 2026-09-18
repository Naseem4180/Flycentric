import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag, Search, Filter, Download, Eye, DollarSign,
  CheckCircle2, Clock, AlertCircle, RotateCcw, Receipt
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, downloadCsv
} from '../../ui';

export default function AdminPurchases() {
  const toast = useToast();

  const [purchases, setPurchases] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/admin/purchases?limit=200')
      .then((res) => setPurchases(res.purchases || []))
      .catch((err) => {
        setError(err.message || 'Failed to load purchases');
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
      list = list.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        (p.student_name || '').toLowerCase().includes(q) ||
        (p.student_email || '').toLowerCase().includes(q) ||
        (p.bundle_title || '').toLowerCase().includes(q) ||
        (p.invoice_number || '').toLowerCase().includes(q) ||
        String(p.id).includes(q)
      );
    }
    return list;
  }, [purchases, statusFilter, search]);

  const stats = useMemo(() => {
    const list = purchases || [];
    // DB stores 'paid' for confirmed payments; some older records may say 'completed'/'captured'
    const completed = list.filter((p) => p.status === 'paid' || p.status === 'completed' || p.status === 'captured');
    const totalRev = completed.reduce((sum, p) => sum + (Number(p.amount_inr) || 0), 0);
    return {
      total: list.length,
      revenue: totalRev,
      completed: completed.length,
      refunded: list.filter((p) => p.status === 'refunded').length,
    };
  }, [purchases]);

  function exportOrders() {
    if (!filtered.length) return;
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Order ID', 'Invoice', 'Student Name', 'Email', 'Course / Bundle', 'Amount (INR)', 'Payment Mode', 'Status', 'Date'],
      ...filtered.map((p) => [
        p.id,
        p.invoice_number || `INV-${p.id}`,
        p.student_name,
        p.student_email,
        p.bundle_title,
        p.amount_inr,
        p.payment_method || 'Razorpay',
        p.status,
        new Date(p.created_at).toLocaleString(),
      ]),
    ];
    downloadCsv(`flycentric_orders_${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(esc).join(',')).join('\n'));
    toast.success('Orders exported', 'CSV file downloaded.');
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Purchases & Orders"
        subtitle="Manage student course purchases, order fulfillment, invoices, and payment receipts."
        actions={
          <Button variant="primary" icon={Download} onClick={exportOrders} disabled={!filtered.length}>
            Export Orders CSV
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard icon={ShoppingBag} tone="indigo" value={stats.total} label="Total Orders" sub="All recorded orders" />
        <KpiCard icon={DollarSign} tone="green" value={`₹${stats.revenue.toLocaleString('en-IN')}`} label="Gross Revenue" sub="Captured payments" />
        <KpiCard icon={CheckCircle2} tone="cyan" value={stats.completed} label="Fulfilled" sub="Active entitlements" />
        <KpiCard icon={RotateCcw} tone="orange" value={stats.refunded} label="Refunded" sub="Settled refunds" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search orders by student name, email, invoice or course..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select-filter"
            >
              <option value="all">All Order Statuses</option>
              <option value="completed">Completed</option>
              <option value="captured">Captured</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : error ? (
          <ErrorState title="Failed to load orders" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No orders found"
            description="Student purchases will appear here in real-time upon checkout."
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Order / Invoice</th>
                  <th>Student</th>
                  <th>Course / Bundle</th>
                  <th>Amount</th>
                  <th>Payment Method</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isSuccess = p.status === 'completed' || p.status === 'captured';
                  const isRefunded = p.status === 'refunded';
                  return (
                    <tr key={p.id}>
                      <td data-label="Order">
                        <strong>#{p.id}</strong>
                        <div className="td-muted" style={{ fontSize: '0.75rem' }}>
                          {p.invoice_number || `FC-INV-${p.id}`}
                        </div>
                      </td>
                      <td data-label="Student">
                        <div><strong>{p.student_name || 'Guest / Student'}</strong></div>
                        <div className="td-muted" style={{ fontSize: '0.78rem' }}>{p.student_email}</div>
                      </td>
                      <td data-label="Course">
                        <strong>{p.bundle_title || `Course #${p.bundle_id}`}</strong>
                      </td>
                      <td data-label="Amount">
                        <strong style={{ fontSize: '0.95rem' }}>
                          ₹{Number(p.amount_inr || 0).toLocaleString('en-IN')}
                        </strong>
                      </td>
                      <td data-label="Method">
                        <Badge tone="slate">{p.payment_method || 'Online (Razorpay)'}</Badge>
                      </td>
                      <td data-label="Status">
                        <Badge tone={isSuccess ? 'green' : isRefunded ? 'amber' : 'red'}>
                          {p.status}
                        </Badge>
                      </td>
                      <td data-label="Date">
                        <div className="td-muted" style={{ fontSize: '0.82rem' }}>
                          {new Date(p.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td data-label="Details" style={{ textAlign: 'right' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Eye}
                          onClick={() => setSelectedOrder(p)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedOrder && (
        <Modal
          title={`Order #${selectedOrder.id} Invoice Summary`}
          onClose={() => setSelectedOrder(null)}
        >
          <div className="stack" style={{ gap: 16 }}>
            <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="row row-between" style={{ marginBottom: 8 }}>
                <span className="td-muted">Invoice Reference:</span>
                <strong>{selectedOrder.invoice_number || `FC-INV-${selectedOrder.id}`}</strong>
              </div>
              <div className="row row-between" style={{ marginBottom: 8 }}>
                <span className="td-muted">Order Date:</span>
                <span>{new Date(selectedOrder.created_at).toLocaleString()}</span>
              </div>
              <div className="row row-between" style={{ marginBottom: 8 }}>
                <span className="td-muted">Payment Status:</span>
                <Badge tone={selectedOrder.status === 'completed' || selectedOrder.status === 'captured' ? 'green' : 'amber'}>
                  {selectedOrder.status}
                </Badge>
              </div>
              <div className="row row-between">
                <span className="td-muted">Payment Gateway Reference:</span>
                <code style={{ fontSize: '0.8rem' }}>{selectedOrder.razorpay_payment_id || 'N/A'}</code>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Customer Information</h4>
              <div className="grid grid-2" style={{ gap: 8, fontSize: '0.85rem' }}>
                <div><strong>Name:</strong> {selectedOrder.student_name}</div>
                <div><strong>Email:</strong> {selectedOrder.student_email}</div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Purchased Item</h4>
              <div className="row row-between" style={{ padding: '8px 12px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6 }}>
                <span>{selectedOrder.bundle_title || `Course #${selectedOrder.bundle_id}`}</span>
                <strong>₹{Number(selectedOrder.amount_inr).toLocaleString('en-IN')}</strong>
              </div>
            </div>

            <div className="row row-end" style={{ marginTop: 8 }}>
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

