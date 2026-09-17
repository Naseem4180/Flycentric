import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreditCard, Search, Download, DollarSign,
  CheckCircle2, Clock, AlertCircle, RotateCcw, Filter
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, downloadCsv
} from '../../ui';

export default function AdminPayments() {
  const toast = useToast();

  const [payments, setPayments] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/payments')
      .then((d) => setPayments(d.payments || []))
      .catch((err) => {
        setError(err.message || 'Failed to load payments');
        setPayments([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = payments || [];
    if (statusFilter !== 'all') {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        (p.email || '').toLowerCase().includes(q) ||
        (p.bundle_title || '').toLowerCase().includes(q) ||
        (p.razorpay_order_id || '').toLowerCase().includes(q) ||
        (p.razorpay_payment_id || '').toLowerCase().includes(q) ||
        String(p.id).includes(q)
      );
    }
    return list;
  }, [payments, statusFilter, search]);

  const stats = useMemo(() => {
    const list = payments || [];
    const paid = list.filter((p) => p.status === 'paid');
    const totalRev = paid.reduce((sum, p) => sum + (Number(p.amount_inr) || 0), 0);
    return {
      total: list.length,
      paid: paid.length,
      pending: list.filter((p) => p.status === 'created' || p.status === 'pending').length,
      failed: list.filter((p) => p.status === 'failed').length,
      refunded: list.filter((p) => p.status === 'refunded').length,
      revenue: totalRev,
    };
  }, [payments]);

  async function refund(id) {
    if (!window.confirm('Refund this payment and revoke bundle access?')) return;
    try {
      await api.post(`/payments/${id}/refund`);
      toast.success('Refund processed', 'Bundle access has been revoked.');
      load();
    } catch (e) {
      toast.error('Refund failed', e.message || 'Please try again.');
    }
  }

  function exportPayments() {
    if (!filtered.length) return;
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Payment ID', 'Student Email', 'Bundle', 'Amount (INR)', 'Status', 'Order ID', 'Payment ID', 'Date'],
      ...filtered.map((p) => [
        p.id, p.email, p.bundle_title, p.amount_inr, p.status,
        p.razorpay_order_id, p.razorpay_payment_id,
        new Date(p.created_at).toLocaleString(),
      ]),
    ];
    downloadCsv(`flycentric_payments_${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(esc).join(',')).join('\n'));
    toast.success('Payments exported', 'CSV file downloaded.');
  }

  const statusBadgeTone = (status) => {
    if (status === 'paid') return 'green';
    if (status === 'created' || status === 'pending') return 'orange';
    if (status === 'refunded') return 'slate';
    if (status === 'failed') return 'red';
    return 'slate';
  };

  return (
    <div className="accent-green">
      <PageHeader
        title="Payments"
        subtitle="All payment gateway records — orders created, captured, failed, and refunded."
        actions={
          <Button variant="primary" icon={Download} onClick={exportPayments} disabled={!filtered.length}>
            Export CSV
          </Button>
        }
      />

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard icon={CreditCard} tone="indigo" value={stats.total} label="Total Payments" sub="All gateway records" />
        <KpiCard icon={CheckCircle2} tone="green" value={stats.paid} label="Paid" sub={`₹${stats.revenue.toLocaleString('en-IN')} collected`} />
        <KpiCard icon={Clock} tone="orange" value={stats.pending} label="Pending / Created" sub="Awaiting capture" />
        <KpiCard icon={AlertCircle} tone="red" value={stats.failed} label="Failed" sub="Gateway declined" />
        <KpiCard icon={RotateCcw} tone="slate" value={stats.refunded} label="Refunded" sub="Access revoked" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by email, bundle, order ID or payment ID..."
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
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="created">Created / Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : error ? (
          <ErrorState title="Failed to load payments" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments found"
            description="All Razorpay gateway transactions will appear here once students make purchases."
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Student</th>
                  <th>Bundle</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Order / Payment Ref</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td data-label="ID"><strong>#{p.id}</strong></td>
                    <td data-label="Student">
                      <div className="td-muted" style={{ fontSize: '0.82rem' }}>{p.email}</div>
                    </td>
                    <td data-label="Bundle">
                      <span>{p.bundle_title || `Bundle #${p.bundle_id}`}</span>
                    </td>
                    <td data-label="Amount">
                      <strong className="amount-positive">₹{Number(p.amount_inr || 0).toLocaleString('en-IN')}</strong>
                    </td>
                    <td data-label="Status">
                      <Badge tone={statusBadgeTone(p.status)}>{p.status}</Badge>
                    </td>
                    <td data-label="Order Ref">
                      <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--muted)' }}>
                        <div>{p.razorpay_order_id || '—'}</div>
                        {p.razorpay_payment_id && (
                          <div style={{ color: 'var(--success)', marginTop: 2 }}>{p.razorpay_payment_id}</div>
                        )}
                      </div>
                    </td>
                    <td data-label="Date">
                      <div className="td-muted" style={{ fontSize: '0.8rem' }}>
                        {new Date(p.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td>
                      {p.status === 'paid' && (
                        <Button variant="danger-soft" size="sm" icon={RotateCcw} onClick={() => refund(p.id)}>
                          Refund
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
