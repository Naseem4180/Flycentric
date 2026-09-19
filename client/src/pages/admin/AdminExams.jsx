import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, Plus, Search, Filter, BookOpen, Clock, ShieldCheck,
  AlertTriangle, Eye, Pencil, Trash2, Globe, Lock, ShieldAlert
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, RowMenu
} from '../../ui';

export default function AdminExams() {
  const toast = useToast();

  const [exams, setExams] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    title: '',
    subject_id: '',
    pass_percent: 70,
    duration_minutes: 60,
    attempt_limit: 1,
    status: 'draft',
    question_count: 25,
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/exams/quizzes?type=exam'),
      api.get('/content/subjects'),
    ])
      .then(([examRes, subjRes]) => {
        setExams(examRes.quizzes || []);
        setSubjects(subjRes.subjects || []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load exams');
        setExams([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = exams || [];
    if (subjectFilter !== 'all') {
      list = list.filter((e) => String(e.subject_id) === String(subjectFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((item) =>
        item.title?.toLowerCase().includes(q) ||
        item.subject_title?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [exams, subjectFilter, search]);

  const stats = useMemo(() => {
    const list = exams || [];
    return {
      total: list.length,
      published: list.filter((e) => e.status === 'published').length,
      avgPass: list.length ? Math.round(list.reduce((s, e) => s + (e.pass_percent || 70), 0) / list.length) : 0,
    };
  }, [exams]);

  function openForm(exam) {
    if (exam) {
      setEditing(exam);
      setForm({
        title: exam.title || '',
        subject_id: exam.subject_id ? String(exam.subject_id) : '',
        pass_percent: exam.pass_percent || 70,
        duration_minutes: exam.duration_minutes || 60,
        attempt_limit: exam.attempt_limit || 1,
        status: exam.status || 'draft',
        question_count: Array.isArray(exam.question_ids) ? exam.question_ids.length : 25,
      });
    } else {
      setEditing(null);
      setForm({
        title: '',
        subject_id: subjects[0]?.id ? String(subjects[0].id) : '',
        pass_percent: 70,
        duration_minutes: 60,
        attempt_limit: 1,
        status: 'draft',
        question_count: 25,
      });
    }
    setFormOpen(true);
  }

  async function submitExam(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.warning('Title required', 'Exam title is required.');
      return;
    }

    setSaving(true);
    try {
      // Pick questions from question bank for this subject
      let questionIds = [];
      if (form.subject_id) {
        const qRes = await api.get(`/questions?subject_id=${form.subject_id}&limit=100`);
        const available = qRes.questions || [];
        questionIds = available.slice(0, Math.min(form.question_count, available.length)).map((q) => q.id);
      }

      const payload = {
        title: form.title,
        type: 'exam',
        subject_id: form.subject_id ? Number(form.subject_id) : null,
        duration_minutes: Number(form.duration_minutes) || 60,
        pass_percent: Number(form.pass_percent) || 70,
        attempt_limit: Number(form.attempt_limit) || 1,
        status: form.status,
        question_ids: questionIds.length ? questionIds : [1],
      };

      if (editing) {
        await api.patch(`/exams/quizzes/${editing.id}`, payload);
        toast.success('Exam updated', `${form.title} has been updated.`);
      } else {
        await api.post('/exams/quizzes', payload);
        toast.success('Exam created', `${form.title} created successfully.`);
      }

      setFormOpen(false);
      load();
    } catch (err) {
      toast.error('Failed to save exam', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(exam) {
    const nextStatus = exam.status === 'published' ? 'draft' : 'published';
    try {
      await api.patch(`/exams/quizzes/${exam.id}/status`, { status: nextStatus });
      toast.success(
        nextStatus === 'published' ? 'Exam Published' : 'Exam Set to Draft',
        `${exam.title} is now ${nextStatus}.`
      );
      load();
    } catch (err) {
      toast.error('Status change failed', err.message);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await api.delete(`/exams/quizzes/${confirmDelete.id}`);
      toast.success('Exam deleted', `${confirmDelete.title} was removed.`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error('Delete failed', err.message);
    }
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Formal Exams & DGCA Simulations"
        subtitle="Manage certification exams, strict timed test-papers, and pass/fail thresholds."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>
            New Mock Exam
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard icon={Award} tone="indigo" value={stats.total} label="Certification Exams" sub="DGCA pattern" />
        <KpiCard icon={Globe} tone="green" value={stats.published} label="Published to Students" sub="Active mock papers" />
        <KpiCard icon={ShieldCheck} tone="purple" value={`${stats.avgPass}%`} label="Avg Pass Threshold" sub="DGCA standard" />
        <KpiCard icon={ShieldAlert} tone="orange" value="3 Hours" label="Inactivity Auto-Submit" sub="Strict enforcement" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search exams by title or subject..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="select-filter"
            >
              <option value="all">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : error ? (
          <ErrorState title="Failed to load exams" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No formal exams configured"
            description="Create your first DGCA-style mock examination paper."
            action={
              <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>
                Create Mock Exam
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Exam Title</th>
                  <th>Subject</th>
                  <th>Duration</th>
                  <th>Passing Mark</th>
                  <th>Attempt Rules</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const qCount = Array.isArray(e.question_ids) ? e.question_ids.length : 0;
                  return (
                    <tr key={e.id}>
                      <td data-label="Exam">
                        <strong>{e.title}</strong>
                        <div className="td-muted" style={{ fontSize: '0.78rem' }}>
                          {qCount} Questions in Pool
                        </div>
                      </td>
                      <td data-label="Subject">
                        <span className="td-muted">{e.subject_title || 'General Aviation'}</span>
                      </td>
                      <td data-label="Duration">
                        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <Clock size={14} className="muted" />
                          <span>{e.duration_minutes} Minutes</span>
                        </div>
                      </td>
                      <td data-label="Passing Mark">
                        <Badge tone={e.pass_percent >= 70 ? 'green' : 'amber'}>
                          {e.pass_percent}% Pass
                        </Badge>
                      </td>
                      <td data-label="Rules">
                        <div>{e.attempt_limit === 0 ? 'Unlimited' : `${e.attempt_limit} Try Max`}</div>
                        <div className="td-muted" style={{ fontSize: '0.75rem' }}>
                          3h idle timeout
                        </div>
                      </td>
                      <td data-label="Status">
                        <Badge tone={e.status === 'published' ? 'green' : 'slate'}>
                          {e.status === 'published' ? '● Published' : '○ Draft'}
                        </Badge>
                      </td>
                      <td data-label="Actions" style={{ textAlign: 'right' }}>
                        <RowMenu
                          items={[
                            {
                              label: e.status === 'published' ? 'Unpublish (Draft)' : 'Publish Exam',
                              icon: e.status === 'published' ? Lock : Globe,
                              onClick: () => toggleStatus(e),
                            },
                            {
                              label: 'Edit Configuration',
                              icon: Pencil,
                              onClick: () => openForm(e),
                            },
                            {
                              label: 'Delete Exam',
                              icon: Trash2,
                              danger: true,
                              onClick: () => setConfirmDelete(e),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {formOpen && (
        <Modal
          title={editing ? `Edit Exam: ${editing.title}` : 'Create Formal Mock Exam'}
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={submitExam} className="form-stack">
            <div className="form-group">
              <label>Exam Title *</label>
              <input
                type="text"
                placeholder="e.g. DGCA Air Navigation Mock Paper 1"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Subject</label>
                <select
                  value={form.subject_id}
                  onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
                  required
                >
                  <option value="">Select Subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Question Pool Count</label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={form.question_count}
                  onChange={(e) => setForm({ ...form, question_count: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-3" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Duration (Minutes) *</label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Passing Score (%)</label>
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={form.pass_percent}
                  onChange={(e) => setForm({ ...form, pass_percent: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Attempt Limit</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={form.attempt_limit}
                  onChange={(e) => setForm({ ...form, attempt_limit: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="draft">Draft (Curriculum Review)</option>
                <option value="published">Published (Available for examination)</option>
              </select>
            </div>

            <div className="callout callout-warning" style={{ padding: '10px 14px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', fontSize: '0.82rem', color: '#92400e' }}>
              <strong>Inactivity Auto-Submission Active:</strong> The FlyCentric scheduler automatically sweeps active exam sessions every 5 minutes. If a student leaves their exam unanswered/idle for 3 hours, it is submitted automatically with partial marks preserved.
            </div>

            <div className="form-actions row row-end" style={{ gap: 8, marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={saving}>
                {editing ? 'Update Exam' : 'Create Exam'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Mock Exam"
          message={`Are you sure you want to delete "${confirmDelete.title}"? Existing attempts will be kept for student transcripts.`}
          confirmLabel="Delete Exam"
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

