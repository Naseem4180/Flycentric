import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Receipt, Search, Filter, Download, DollarSign,
  CheckCircle2, Clock, AlertCircle, ArrowUpRight
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, downloadCsv
} from '../../ui';

export default function AdminTransactions() {
  const toast = useToast();

  const [transactions, setTransactions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/admin/transactions?limit=250')
      .then((res) => setTransactions(res.transactions || []))
      .catch((err) => {
        setError(err.message || 'Failed to load transactions');
        setTransactions([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = transactions || [];
    if (statusFilter !== 'all') {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        (t.student_name || '').toLowerCase().includes(q) ||
        (t.student_email || '').toLowerCase().includes(q) ||
        (t.gateway_txn_id || '').toLowerCase().includes(q) ||
        (t.bundle_title || '').toLowerCase().includes(q) ||
        String(t.id).includes(q)
      );
    }
    return list;
  }, [transactions, statusFilter, search]);

  const stats = useMemo(() => {
    const list = transactions || [];
    // DB default is 'successful' — but support 'success'/'completed' for older records
    const successful = list.filter((t) => t.status === 'successful' || t.status === 'success' || t.status === 'completed');
    const gross = successful.reduce((s, t) => s + (Number(t.amount_inr) || 0), 0);
    const fees = successful.reduce((s, t) => s + (Number(t.fee_inr) || 0), 0);
    const net = successful.reduce((s, t) => s + (Number(t.net_inr) || (Number(t.amount_inr) - Number(t.fee_inr || 0))), 0);
    return {
      total: list.length,
      gross,
      fees,
      net,
    };
  }, [transactions]);

  function exportTransactions() {
    if (!filtered.length) return;
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Transaction ID', 'Gateway Reference', 'Student Name', 'Email', 'Item Description', 'Gross (INR)', 'Gateway Fee (INR)', 'Net (INR)', 'Status', 'Timestamp'],
      ...filtered.map((t) => [
        t.id,
        t.gateway_txn_id || t.payment_id,
        t.student_name,
        t.student_email,
        t.bundle_title,
        t.amount_inr,
        t.fee_inr || 0,
        t.net_inr || t.amount_inr,
        t.status,
        t.created_at ? new Date(t.created_at).toLocaleString() : '—',
      ]),
    ];
    downloadCsv(`flycentric_transactions_${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(esc).join(',')).join('\n'));
    toast.success('Transactions exported', 'CSV file downloaded.');
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Financial Transactions Ledger"
        subtitle="Audit-grade financial log of all gateway settlements, processing fees, and net revenue."
        actions={
          <Button variant="primary" icon={Download} onClick={exportTransactions} disabled={!filtered.length}>
            Export Ledger CSV
          </Button>
        }
      />

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard icon={Receipt} tone="indigo" value={stats.total} label="Total Transactions" sub="Financial entries" />
        <KpiCard icon={DollarSign} tone="green" value={`₹${stats.gross.toLocaleString('en-IN')}`} label="Gross Volume" sub="Total processed" />
        <KpiCard icon={ArrowUpRight} tone="orange" value={`₹${stats.fees.toLocaleString('en-IN')}`} label="Gateway Charges" sub="Payment processing" />
        <KpiCard icon={CheckCircle2} tone="cyan" value={`₹${stats.net.toLocaleString('en-IN')}`} label="Net Settlement" sub="Net platform payout" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search transactions by gateway ID, student name, or email..."
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
              <option value="all">All Settlement Statuses</option>
              <option value="successful">Successful</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const r = await api.post('/admin/transactions/backfill');
                  toast.success('Sync complete', `${r.inserted} missing transaction${r.inserted !== 1 ? 's' : ''} backfilled.`);
                  load();
                } catch (e) { toast.error('Sync failed', e.message); }
              }}
              title="Create missing transaction records for all paid payments"
            >
              Sync Missing
            </Button>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : error ? (
          <ErrorState title="Failed to load ledger" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No transactions found"
            description="All payment gateway events and settlement transfers will appear here."
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Txn ID / Gateway Ref</th>
                  <th>Student Account</th>
                  <th>Purchased Item</th>
                  <th>Gross Amount</th>
                  <th>Fee</th>
                  <th>Net Payout</th>
                  <th>Status</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Txn ID">
                      <strong>#{t.id}</strong>
                      <div className="td-muted td-clip" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        {t.gateway_ref || t.gateway_txn_id || t.payment_id || 'manual_entry'}
                      </div>
                    </td>
                    <td data-label="Student">
                      <div><strong>{t.student_name || 'Student'}</strong></div>
                      <div className="td-muted" style={{ fontSize: '0.78rem' }}>{t.student_email}</div>
                    </td>
                    <td data-label="Item">
                      <span>{t.bundle_title || `Item #${t.bundle_id}`}</span>
                    </td>
                    <td data-label="Gross">
                      <strong className="amount-positive">₹{Number(t.amount_inr || 0).toLocaleString('en-IN')}</strong>
                    </td>
                    <td data-label="Fee">
                      <span className="td-muted">₹{Number(t.fee_inr || 0).toLocaleString('en-IN')}</span>
                    </td>
                    <td data-label="Net">
                      <strong className="amount-positive">
                        ₹{Number(t.net_inr || t.amount_inr || 0).toLocaleString('en-IN')}
                      </strong>
                    </td>
                    <td data-label="Status">
                      <Badge tone={
                        (t.status === 'successful' || t.status === 'success' || t.status === 'completed') ? 'green'
                        : t.status === 'pending' ? 'orange'
                        : t.status === 'refunded' ? 'slate'
                        : 'red'
                      }>
                        {t.status}
                      </Badge>
                    </td>
                    <td data-label="Date">
                      <div className="td-muted" style={{ fontSize: '0.8rem' }}>
                        {new Date(t.created_at).toLocaleString()}
                      </div>
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

