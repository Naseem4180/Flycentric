import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RotateCcw, Search, Filter, CheckCircle2, XCircle, Plus,
  AlertTriangle, DollarSign, Clock, UserX, ShieldAlert
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge
} from '../../ui';

export default function AdminRefunds() {
  const toast = useToast();

  const [refunds, setRefunds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [confirmApprove, setConfirmApprove] = useState(null);
  const [confirmReject, setConfirmReject] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    payment_id: '',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/admin/refunds')
      .then((res) => setRefunds(res.refunds || []))
      .catch((err) => {
        setError(err.message || 'Failed to load refunds');
        setRefunds([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = refunds || [];
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.student_name || '').toLowerCase().includes(q) ||
        (r.student_email || '').toLowerCase().includes(q) ||
        (r.bundle_title || '').toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q) ||
        String(r.id).includes(q)
      );
    }
    return list;
  }, [refunds, statusFilter, search]);

  const stats = useMemo(() => {
    const list = refunds || [];
    const pending = list.filter((r) => r.status === 'pending');
    const approved = list.filter((r) => r.status === 'approved' || r.status === 'completed');
    const totalRefunded = approved.reduce((s, r) => s + (Number(r.amount_inr) || 0), 0);
    return {
      pending: pending.length,
      approved: approved.length,
      rejected: list.filter((r) => r.status === 'rejected').length,
      totalRefunded,
    };
  }, [refunds]);

  async function handleApprove() {
    if (!confirmApprove) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/refunds/${confirmApprove.id}/approve`);
      toast.success(
        'Refund approved',
        `Refund for ${confirmApprove.student_name} approved. Course access has been revoked.`
      );
      setConfirmApprove(null);
      load();
    } catch (err) {
      toast.error('Approve failed', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!confirmReject) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/refunds/${confirmReject.id}/reject`);
      toast.success('Refund rejected', `Request #${confirmReject.id} has been rejected.`);
      setConfirmReject(null);
      load();
    } catch (err) {
      toast.error('Reject failed', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateRefund(e) {
    e.preventDefault();
    if (!createForm.payment_id) {
      toast.warning('Payment ID required', 'Please provide an existing payment ID.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/admin/refunds', {
        payment_id: Number(createForm.payment_id),
        reason: createForm.reason,
      });
      toast.success('Refund created', 'Refund request logged successfully.');
      setCreateModal(false);
      setCreateForm({ payment_id: '', reason: '' });
      load();
    } catch (err) {
      toast.error('Creation failed', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Refund Requests & Processing"
        subtitle="Manage student refund claims with instant entitlement revocation and financial audit logging."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreateModal(true)}>
            Record Refund
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard icon={Clock} tone="orange" value={stats.pending} label="Pending Review" sub="Requires admin action" />
        <KpiCard icon={CheckCircle2} tone="green" value={stats.approved} label="Approved & Revoked" sub="Entitlements removed" />
        <KpiCard icon={XCircle} tone="slate" value={stats.rejected} label="Rejected Claims" sub="Claim declined" />
        <KpiCard icon={DollarSign} tone="red" value={`₹${stats.totalRefunded.toLocaleString('en-IN')}`} label="Total Refunded" sub="Settled refunds" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search refunds by student, email, reason, or course..."
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
              <option value="all">All Refund Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={7} />
        ) : error ? (
          <ErrorState title="Failed to load refunds" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title="No refund requests"
            description="All student accounts are in good standing with zero active refund claims."
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Student</th>
                  <th>Course / Bundle</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Requested Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isPending = r.status === 'pending';
                  return (
                    <tr key={r.id}>
                      <td data-label="Request ID">
                        <strong>#{r.id}</strong>
                        <div className="td-muted" style={{ fontSize: '0.75rem' }}>
                          Payment #{r.payment_id}
                        </div>
                      </td>
                      <td data-label="Student">
                        <div><strong>{r.student_name || 'Student'}</strong></div>
                        <div className="td-muted" style={{ fontSize: '0.78rem' }}>{r.student_email}</div>
                      </td>
                      <td data-label="Course">
                        <span>{r.bundle_title || `Course #${r.bundle_id}`}</span>
                      </td>
                      <td data-label="Amount">
                        <strong style={{ color: 'var(--danger)' }}>
                          ₹{Number(r.amount_inr || 0).toLocaleString('en-IN')}
                        </strong>
                      </td>
                      <td data-label="Reason">
                        <span className="td-clip" style={{ maxWidth: 160, display: 'inline-block' }}>
                          {r.reason || 'Requested by customer'}
                        </span>
                      </td>
                      <td data-label="Status">
                        <Badge tone={r.status === 'approved' ? 'green' : r.status === 'pending' ? 'amber' : 'slate'}>
                          {r.status}
                        </Badge>
                      </td>
                      <td data-label="Date">
                        <div className="td-muted" style={{ fontSize: '0.8rem' }}>
                          {new Date(r.requested_at || r.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td data-label="Actions" style={{ textAlign: 'right' }}>
                        {isPending ? (
                          <div className="row row-end" style={{ gap: 6 }}>
                            <Button
                              variant="success"
                              size="sm"
                              icon={CheckCircle2}
                              onClick={() => setConfirmApprove(r)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              icon={XCircle}
                              onClick={() => setConfirmReject(r)}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="td-muted" style={{ fontSize: '0.8rem' }}>
                            {r.status === 'approved' ? 'Processed' : 'Declined'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {createModal && (
        <Modal
          title="Record Manual Refund"
          onClose={() => setCreateModal(false)}
        >
          <form onSubmit={handleCreateRefund} className="form-stack">
            <div className="form-group">
              <label>Payment ID *</label>
              <input
                type="number"
                placeholder="e.g. 104"
                value={createForm.payment_id}
                onChange={(e) => setCreateForm({ ...createForm, payment_id: e.target.value })}
                required
              />
              <span className="td-muted" style={{ fontSize: '0.78rem', marginTop: 4, display: 'block' }}>
                Enter the internal payment ID from the Purchases screen.
              </span>
            </div>

            <div className="form-group">
              <label>Refund Reason</label>
              <textarea
                rows={3}
                placeholder="Reason for refund (e.g., student opted for different batch, duplicate charge)..."
                value={createForm.reason}
                onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
              />
            </div>

            <div className="callout callout-info" style={{ padding: '10px 14px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.82rem', color: '#1e40af' }}>
              <strong>Entitlement Notice:</strong> Approving this refund will automatically revoke the student's access to the associated course materials, tests, and mock exams.
            </div>

            <div className="form-actions row row-end" style={{ gap: 8, marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setCreateModal(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={submitting}>
                Submit Request
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmApprove && (
        <ConfirmModal
          title="Approve Refund & Revoke Entitlements"
          message={`Are you sure you want to approve ₹${confirmApprove.amount_inr} refund for ${confirmApprove.student_name}? This action will IMMEDIATELY REVOKE access to "${confirmApprove.bundle_title}".`}
          confirmLabel="Approve & Revoke Access"
          tone="danger"
          onConfirm={handleApprove}
          onCancel={() => setConfirmApprove(null)}
        />
      )}

      {confirmReject && (
        <ConfirmModal
          title="Reject Refund Request"
          message={`Are you sure you want to decline the refund claim #${confirmReject.id}? Student will retain their active course entitlements.`}
          confirmLabel="Reject Claim"
          tone="slate"
          onConfirm={handleReject}
          onCancel={() => setConfirmReject(null)}
        />
      )}
    </div>
  );
}

