import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trash2, RotateCcw, Search, Package, BookOpen, FileText, Layers, HelpCircle, Undo2,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, DifficultyBadge, Tabs,
} from '../../ui';

const TYPE_META = {
  bundle: { label: 'Bundle', icon: Package, tone: 'orange' },
  subject: { label: 'Subject', icon: BookOpen, tone: 'blue' },
  chapter: { label: 'Chapter', icon: Layers, tone: 'purple' },
  section: { label: 'Section', icon: FileText, tone: 'slate' },
};

export default function AdminTrash() {
  const toast = useToast();
  const [tab, setTab] = useState('content');
  const [items, setItems] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const load = useCallback(() => {
    setError('');
    setItems(null);
    setQuestions(null);
    Promise.all([
      api.get('/content/trash').then((d) => d.items),
      api.get('/questions/trash/list').then((d) => d.questions),
    ])
      .then(([i, q]) => { setItems(i); setQuestions(q); })
      .catch((e) => { setError(e.message); setItems([]); setQuestions([]); });
  }, []);

  useEffect(load, [load]);

  const counts = useMemo(() => {
    const byType = {};
    (items || []).forEach((i) => { byType[i.type] = (byType[i.type] || 0) + 1; });
    return { byType, content: (items || []).length, questions: (questions || []).length };
  }, [items, questions]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (items || []).filter((i) => !term || (i.title || '').toLowerCase().includes(term));
  }, [items, search]);

  const visibleQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (questions || []).filter((q) => !term || (q.question_text || '').toLowerCase().includes(term));
  }, [questions, search]);

  function askRestoreItem(item) {
    const meta = TYPE_META[item.type] || { label: item.type };
    setConfirm({
      tone: 'success',
      title: `Restore this ${meta.label.toLowerCase()}?`,
      message: `“${item.title}” will be returned to its original place and become visible again.`,
      confirmLabel: 'Restore',
      onConfirm: async () => {
        setBusyKey(`${item.type}-${item.id}`);
        try {
          await api.post(`/content/trash/${item.type}/${item.id}/restore`);
          toast.success(`${meta.label} restored`, item.title);
          load();
        } catch (err) { toast.error('Restore failed', err.message); }
        setBusyKey(null);
        setConfirm(null);
      },
    });
  }

  function askRestoreQuestion(q) {
    setConfirm({
      tone: 'success',
      title: 'Restore this question?',
      message: 'The question will return to the question bank and can be used in quizzes again.',
      confirmLabel: 'Restore Question',
      onConfirm: async () => {
        setBusyKey(`q-${q.id}`);
        try {
          await api.post(`/questions/${q.id}/restore`);
          toast.success('Question restored', `#${q.id}`);
          load();
        } catch (err) { toast.error('Restore failed', err.message); }
        setBusyKey(null);
        setConfirm(null);
      },
    });
  }

  function askPermanentDeleteItem(item) {
    const meta = TYPE_META[item.type] || { label: item.type };
    setConfirm({
      tone: 'danger',
      title: `Permanently delete this ${meta.label.toLowerCase()}?`,
      message: `“${item.title}” will be permanently erased from the database. This action CANNOT be undone!`,
      confirmLabel: 'Delete Permanently',
      onConfirm: async () => {
        setBusyKey(`del-${item.type}-${item.id}`);
        try {
          await api.delete(`/content/trash/${item.type}/${item.id}`);
          toast.success(`${meta.label} permanently deleted`, item.title);
          load();
        } catch (err) { toast.error('Permanent delete failed', err.message); }
        setBusyKey(null);
        setConfirm(null);
      },
    });
  }

  function askPermanentDeleteQuestion(q) {
    setConfirm({
      tone: 'danger',
      title: 'Permanently delete this question?',
      message: `Question #${q.id} will be permanently erased from the database. This action CANNOT be undone!`,
      confirmLabel: 'Delete Permanently',
      onConfirm: async () => {
        setBusyKey(`del-q-${q.id}`);
        try {
          await api.delete(`/questions/${q.id}/permanent`);
          toast.success('Question permanently deleted', `#${q.id}`);
          load();
        } catch (err) { toast.error('Permanent delete failed', err.message); }
        setBusyKey(null);
        setConfirm(null);
      },
    });
  }

  function askEmptyTrash() {
    const isContent = tab === 'content';
    const totalCount = isContent ? counts.content : counts.questions;
    if (!totalCount) return;
    setConfirm({
      tone: 'danger',
      title: `Empty all ${isContent ? 'content items' : 'questions'} from trash?`,
      message: `All ${totalCount} deleted ${isContent ? 'bundles, subjects, chapters and sections' : 'questions'} will be permanently erased from the database. This action CANNOT be undone!`,
      confirmLabel: 'Empty Trash',
      onConfirm: async () => {
        try {
          if (isContent) {
            await api.post('/content/trash/empty');
            toast.success('Content trash emptied');
          } else {
            await api.post('/questions/trash/empty');
            toast.success('Questions trash emptied');
          }
          load();
        } catch (err) { toast.error('Empty trash failed', err.message); }
        setConfirm(null);
      },
    });
  }

  return (
    <div className="accent-red">
      <PageHeader
        eyebrow="System"
        title="Trash Bin"
        subtitle="Deleted items are kept here so you can restore them or permanently remove them from the database."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={RotateCcw} onClick={load}>Refresh</Button>
            {((tab === 'content' && counts.content > 0) || (tab === 'questions' && counts.questions > 0)) && (
              <Button variant="danger" icon={Trash2} onClick={askEmptyTrash}>
                Empty Trash
              </Button>
            )}
          </div>
        }
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={load}>Retry</Button></div>}

      <div className="kpi-grid">
        <KpiCard icon={Package} tone="orange" value={counts.byType.bundle || 0} label="Bundles" sub="In trash" />
        <KpiCard icon={BookOpen} tone="blue" value={counts.byType.subject || 0} label="Subjects" sub="In trash" />
        <KpiCard icon={Layers} tone="purple" value={(counts.byType.chapter || 0) + (counts.byType.section || 0)} label="Chapters & Sections" sub="In trash" />
        <KpiCard icon={HelpCircle} tone="pink" value={counts.questions} label="Questions" sub="In trash" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'content', label: 'Content', icon: Package, count: counts.content },
          { value: 'questions', label: 'Questions', icon: HelpCircle, count: counts.questions },
        ]}
      />

      <Card flush className="table-card">
        <div className="toolbar" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <label className="input-with-icon" style={{ maxWidth: 320 }}>
            <Search size={15} />
            <input placeholder="Search deleted items…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search trash" />
          </label>
          <span className="muted" style={{ fontSize: '.8rem' }}>
            {(tab === 'content' ? visibleItems : visibleQuestions).length} item{(tab === 'content' ? visibleItems : visibleQuestions).length === 1 ? '' : 's'}
          </span>
        </div>

        {(tab === 'content' ? items : questions) === null ? <SkeletonTable rows={4} cols={4} /> : error ? (
          <ErrorState title="Unable to load the trash bin" onRetry={load} />
        ) : tab === 'content' ? (
          visibleItems.length ? (
            <div className="table-wrap">
              <table className="table-stack">
                <thead><tr><th>Title</th><th>Type</th><th>Deleted</th><th className="td-actions">Actions</th></tr></thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const meta = TYPE_META[item.type] || { label: item.type, icon: FileText, tone: 'slate' };
                    const Icon = meta.icon;
                    return (
                      <tr key={`${item.type}-${item.id}`}>
                        <td data-label="Title">
                          <div className="cell-user">
                            <span className={`icon-box tone-${meta.tone} icon-box-sm`}><Icon size={14} /></span>
                            <span className="td-strong">{item.title}</span>
                          </div>
                        </td>
                        <td data-label="Type"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td data-label="Deleted" className="td-muted td-nowrap">{item.deleted_at ? new Date(item.deleted_at).toLocaleString() : '—'}</td>
                        <td data-label="Actions" className="td-actions">
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <Button
                              size="xs" variant="success-soft" icon={Undo2}
                              loading={busyKey === `${item.type}-${item.id}`}
                              onClick={() => askRestoreItem(item)}
                            >
                              Restore
                            </Button>
                            <Button
                              size="xs" variant="danger-soft" icon={Trash2}
                              loading={busyKey === `del-${item.type}-${item.id}`}
                              onClick={() => askPermanentDeleteItem(item)}
                              title="Delete permanently from database"
                            >
                              Delete Permanently
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Trash2} tone="red"
              title={search ? 'Nothing matches your search' : 'Trash Bin is Empty'}
              description={search ? 'Try a different search term.' : 'Deleted bundles, subjects, chapters and sections will appear here.'}
              action={search ? <Button onClick={() => setSearch('')}>Clear Search</Button> : null}
            />
          )
        ) : visibleQuestions.length ? (
          <div className="table-wrap">
            <table className="table-stack">
              <thead><tr><th>Question</th><th>Difficulty</th><th>Deleted</th><th className="td-actions">Actions</th></tr></thead>
              <tbody>
                {visibleQuestions.map((q) => (
                  <tr key={q.id}>
                    <td data-label="Question" className="td-clip">
                      <span className="td-muted" style={{ marginRight: 6 }}>#{q.id}</span>{q.question_text}
                    </td>
                    <td data-label="Difficulty"><DifficultyBadge difficulty={q.difficulty} /></td>
                    <td data-label="Deleted" className="td-muted td-nowrap">{q.deleted_at ? new Date(q.deleted_at).toLocaleString() : '—'}</td>
                    <td data-label="Actions" className="td-actions">
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <Button size="xs" variant="success-soft" icon={Undo2} loading={busyKey === `q-${q.id}`} onClick={() => askRestoreQuestion(q)}>
                          Restore
                        </Button>
                        <Button
                          size="xs" variant="danger-soft" icon={Trash2}
                          loading={busyKey === `del-q-${q.id}`}
                          onClick={() => askPermanentDeleteQuestion(q)}
                          title="Delete permanently from database"
                        >
                          Delete Permanently
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={HelpCircle} tone="pink"
            title={search ? 'Nothing matches your search' : 'No Deleted Questions'}
            description={search ? 'Try a different search term.' : 'Questions you delete from the question bank can be restored from here.'}
            action={search ? <Button onClick={() => setSearch('')}>Clear Search</Button> : null}
          />
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
