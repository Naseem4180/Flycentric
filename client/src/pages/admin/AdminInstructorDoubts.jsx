import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MessageCircleQuestion, CheckCircle2, Send, RotateCcw, Search, Clock, MessagesSquare,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, StatusBadge, Tabs,
} from '../../ui';

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}

export default function AdminInstructorDoubts() {
  const toast = useToast();
  const [doubts, setDoubts] = useState(null);
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    setError('');
    api.get('/doubts')
      .then((d) => setDoubts(d.doubts))
      .catch((e) => { setError(e.message); setDoubts([]); });
  }, []);

  useEffect(load, [load]);

  const counts = useMemo(() => {
    const list = doubts || [];
    return {
      open: list.filter((d) => d.status === 'open').length,
      answered: list.filter((d) => d.status === 'answered').length,
      all: list.length,
      students: new Set(list.map((d) => d.student_id)).size,
    };
  }, [doubts]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (doubts || [])
      .filter((d) => tab === 'all' || d.status === tab)
      .filter((d) => !term
        || (d.student_name || '').toLowerCase().includes(term)
        || (d.message || '').toLowerCase().includes(term));
  }, [doubts, tab, search]);

  function openDoubt(doubt) {
    setActive(doubt);
    setReply(doubt.response || '');
    setReplyError('');
  }

  async function send() {
    if (!reply.trim()) { setReplyError('Write a response before sending.'); return; }
    setSending(true);
    try {
      await api.patch(`/doubts/${active.id}`, { response: reply.trim(), status: 'answered' });
      toast.success('Response sent', `${active.student_name} will see your answer.`);
      setActive(null);
      load();
    } catch (err) {
      toast.error('Could not send the response', err.message);
    } finally {
      setSending(false);
    }
  }

  async function reopen(doubt) {
    try {
      await api.patch(`/doubts/${doubt.id}`, { status: 'open' });
      toast.info('Doubt reopened');
      load();
    } catch (err) { toast.error('Could not reopen the doubt', err.message); }
  }

  return (
    <div className="accent-green">
      <PageHeader
        eyebrow="Engagement"
        title="Instructor Doubts"
        subtitle="Questions students have raised for their instructors."
        actions={<Button icon={RotateCcw} onClick={load}>Refresh</Button>}
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={load}>Retry</Button></div>}

      <div className="kpi-grid">
        <KpiCard icon={Clock} tone="orange" value={counts.open} label="Awaiting Response" sub="Open doubts" />
        <KpiCard icon={CheckCircle2} tone="green" value={counts.answered} label="Answered" sub="Responses sent" />
        <KpiCard icon={MessagesSquare} tone="purple" value={counts.all} label="Total Doubts" sub="All time" />
        <KpiCard icon={MessageCircleQuestion} tone="blue" value={counts.students} label="Students Asking" sub="Unique students" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'open', label: 'Open', count: counts.open },
          { value: 'answered', label: 'Answered', count: counts.answered },
          { value: 'all', label: 'All', count: counts.all },
        ]}
      />

      <Card flush className="table-card">
        <div className="toolbar" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <label className="input-with-icon" style={{ maxWidth: 300 }}>
            <Search size={15} />
            <input placeholder="Search students or doubts…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search doubts" />
          </label>
          <span className="muted" style={{ fontSize: '.8rem' }}>{visible.length} doubt{visible.length === 1 ? '' : 's'}</span>
        </div>

        {doubts === null ? <SkeletonTable rows={4} cols={5} /> : error ? (
          <ErrorState title="Unable to load doubts" description="We couldn't retrieve the doubt queue right now." onRetry={load} />
        ) : visible.length ? (
          <div className="table-wrap">
            <table className="table-stack">
              <thead><tr><th>Student</th><th>Doubt</th><th>Related question</th><th>Asked</th><th>Status</th><th className="td-actions">Actions</th></tr></thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Student">
                      <div className="cell-user">
                        <span className="avatar-sm">{initials(d.student_name)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="td-strong">{d.student_name}</div>
                          <div className="td-muted">{d.student_email}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Doubt" className="td-clip">{d.message}</td>
                    <td data-label="Related question" className="td-clip">{d.question_text || <span className="td-muted">—</span>}</td>
                    <td data-label="Asked" className="td-muted td-nowrap">{new Date(d.created_at).toLocaleDateString()}</td>
                    <td data-label="Status"><StatusBadge status={d.status} /></td>
                    <td data-label="Actions" className="td-actions">
                      <div className="btn-group">
                        <Button size="xs" variant={d.status === 'open' ? 'primary' : 'outline'} icon={Send} onClick={() => openDoubt(d)}>
                          {d.status === 'open' ? 'Respond' : 'View'}
                        </Button>
                        {d.status === 'answered' && <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => reopen(d)}>Reopen</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === 'open' ? (
          <EmptyState icon={CheckCircle2} tone="green" title="No Open Doubts" description="Every student doubt has been answered." />
        ) : (
          <EmptyState icon={MessageCircleQuestion} tone="green" title="No Doubts Yet" description="Doubts raised by students will show up here." />
        )}
      </Card>

      <Modal
        open={!!active}
        onClose={() => !sending && setActive(null)}
        variant="drawer"
        title={active ? `Doubt from ${active.student_name}` : ''}
        description={active ? `Asked on ${new Date(active.created_at).toLocaleString()}` : ''}
        footer={(
          <>
            <Button variant="outline" onClick={() => setActive(null)} disabled={sending}>Cancel</Button>
            <Button variant="primary" icon={Send} onClick={send} loading={sending} loadingLabel="Sending…">
              {active?.status === 'answered' ? 'Update Response' : 'Send Response'}
            </Button>
          </>
        )}
      >
        {active && (
          <>
            {active.question_text && (
              <div className="quote-block">
                <span className="quote-label">Related question</span>
                <p>{active.question_text}</p>
              </div>
            )}
            <div className="quote-block">
              <span className="quote-label">Student's doubt</span>
              <p>{active.message}</p>
            </div>
            <div className="field">
              <label htmlFor="doubt-reply">Your response <span className="field-req">*</span></label>
              <textarea
                id="doubt-reply"
                rows={7}
                value={reply}
                className={replyError ? 'has-error' : ''}
                onChange={(e) => { setReply(e.target.value); setReplyError(''); }}
                placeholder="Explain the concept clearly so the student can follow it on their own…"
              />
              {replyError && <p className="field-error">{replyError}</p>}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
