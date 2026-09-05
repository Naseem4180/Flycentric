import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Flag, CheckCircle2, XCircle, Eye, RotateCcw, Search,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, ConfirmModal, useToast,
  EmptyState, ErrorState, SkeletonTable, Badge, StatusBadge, Tabs,
} from '../../ui';

const REASON_LABELS = {
  typing_error: 'Typing error',
  wrong_answer: 'Wrong answer',
  doubtful: 'Doubtful',
  general: 'General feedback',
};
const REASON_TONES = {
  typing_error: 'orange', wrong_answer: 'red', doubtful: 'purple', general: 'slate',
};

export default function AdminReports() {
  const navigate = useNavigate();
  const toast = useToast();
  const [reports, setReports] = useState(null);
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setError('');
    api.get('/questions/reports/queue')
      .then((d) => setReports(d.reports))
      .catch((e) => { setError(e.message); setReports([]); });
  }, []);

  useEffect(load, [load]);

  const counts = useMemo(() => {
    const list = reports || [];
    return {
      open: list.filter((r) => r.status === 'open').length,
      resolved: list.filter((r) => r.status === 'resolved').length,
      dismissed: list.filter((r) => r.status === 'dismissed').length,
      all: list.length,
    };
  }, [reports]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (reports || [])
      .filter((r) => tab === 'all' || r.status === tab)
      .filter((r) => !term
        || (r.reporter_name || '').toLowerCase().includes(term)
        || (r.question_text || '').toLowerCase().includes(term));
  }, [reports, tab, search]);

  function askUpdate(report, status) {
    const resolving = status === 'resolved';
    setConfirm({
      tone: resolving ? 'success' : 'warning',
      title: resolving ? 'Resolve this report?' : 'Dismiss this report?',
      message: resolving
        ? 'Mark this report as resolved — the issue it raised has been dealt with.'
        : 'Dismiss this report without any change to the question. It stays on record in the All tab.',
      confirmLabel: resolving ? 'Resolve Report' : 'Dismiss Report',
      onConfirm: async () => {
        setBusyId(report.id);
        try {
          await api.patch(`/questions/reports/${report.id}`, { status });
          toast.success(resolving ? 'Report resolved' : 'Report dismissed');
          load();
        } catch (err) {
          toast.error('Could not update the report', err.message);
        } finally {
          setBusyId(null);
          setConfirm(null);
        }
      },
    });
  }

  return (
    <div className="accent-red">
      <PageHeader
        eyebrow="Engagement"
        title="Reports"
        subtitle="Question issues flagged by students, waiting for review."
        actions={<Button icon={RotateCcw} onClick={load}>Refresh</Button>}
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={load}>Retry</Button></div>}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'open', label: 'Open', count: counts.open },
          { value: 'resolved', label: 'Resolved', count: counts.resolved },
          { value: 'dismissed', label: 'Dismissed', count: counts.dismissed },
          { value: 'all', label: 'All', count: counts.all },
        ]}
      />

      <Card flush className="table-card">
        <div className="toolbar" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <label className="input-with-icon" style={{ maxWidth: 300 }}>
            <Search size={15} />
            <input placeholder="Search by student or question…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search reports" />
          </label>
          <span className="muted" style={{ fontSize: '.8rem' }}>{visible.length} report{visible.length === 1 ? '' : 's'}</span>
        </div>

        {reports === null ? <SkeletonTable rows={4} cols={5} /> : error ? (
          <ErrorState title="Unable to load reports" description="We couldn't retrieve the report queue right now." onRetry={load} />
        ) : visible.length ? (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr><th>Student</th><th>Question</th><th>Reason</th><th>Date</th><th>Status</th><th className="td-actions">Actions</th></tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Student">
                      <div className="td-strong">{r.reporter_name || 'Unknown'}</div>
                      <div className="td-muted">{r.reporter_email}</div>
                    </td>
                    <td data-label="Question" className="td-clip">
                      {r.question_text || <span className="td-muted">General report (no question)</span>}
                    </td>
                    <td data-label="Reason"><Badge tone={REASON_TONES[r.reason] || 'slate'}>{REASON_LABELS[r.reason] || r.reason}</Badge></td>
                    <td data-label="Date" className="td-muted td-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td data-label="Status"><StatusBadge status={r.status} /></td>
                    <td data-label="Actions" className="td-actions">
                      <div className="btn-group">
                        <Button size="xs" icon={Eye} onClick={() => navigate(`/admin/reports/${r.id}`)}>Review</Button>
                        {r.status === 'open' && (
                          <>
                            <Button size="xs" variant="success-soft" icon={CheckCircle2} loading={busyId === r.id} onClick={() => askUpdate(r, 'resolved')}>Resolve</Button>
                            <Button size="xs" variant="outline" icon={XCircle} onClick={() => askUpdate(r, 'dismissed')}>Dismiss</Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === 'open' ? (
          <EmptyState icon={CheckCircle2} tone="green" title="No Open Reports" description="You're all caught up. New reports from students will appear here." />
        ) : (
          <EmptyState icon={Flag} tone="red" title={`No ${tab === 'all' ? '' : tab} reports`} description="Nothing to show for this filter yet." />
        )}
      </Card>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
        tone={confirm?.tone}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
      />
    </div>
  );
}
