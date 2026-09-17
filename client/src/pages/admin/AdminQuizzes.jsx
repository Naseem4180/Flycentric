import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckSquare, Plus, Search, Filter, BookOpen, Clock, Award,
  CheckCircle2, Eye, Pencil, Trash2, Globe, Lock, HelpCircle
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, RowMenu
} from '../../ui';

export default function AdminQuizzes() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [quizzes, setQuizzes] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    title: '',
    subject_id: '',
    chapter_ids: [],
    type: 'practice',
    pass_percent: 70,
    duration_minutes: 30,
    attempt_limit: 0,
    status: 'draft',
    question_count: 10,
  });
  const [saving, setSaving] = useState(false);
  const [availableQuestions, setAvailableQuestions] = useState([]);
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/exams/quizzes'),
      api.get('/content/subjects'),
    ])
      .then(([quizRes, subjRes]) => {
        setQuizzes(quizRes.quizzes || []);
        setSubjects(subjRes.subjects || []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load quizzes');
        setQuizzes([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Load questions when subject changes in form
  useEffect(() => {
    if (form.subject_id) {
      api.get(`/questions?subject_id=${form.subject_id}&limit=200`)
        .then((res) => {
          setAvailableQuestions(res.questions || []);
        })
        .catch(() => setAvailableQuestions([]));
    } else {
      setAvailableQuestions([]);
    }
  }, [form.subject_id]);

  const filtered = useMemo(() => {
    let list = quizzes || [];
    if (subjectFilter !== 'all') {
      list = list.filter((q) => String(q.subject_id) === String(subjectFilter));
    }
    if (typeFilter !== 'all') {
      list = list.filter((q) => q.type === typeFilter);
    }
    if (statusFilter !== 'all') {
      list = list.filter((q) => q.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((item) =>
        item.title?.toLowerCase().includes(q) ||
        item.subject_title?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [quizzes, subjectFilter, typeFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const list = quizzes || [];
    return {
      total: list.length,
      published: list.filter((q) => q.status === 'published').length,
      practice: list.filter((q) => q.type === 'practice').length,
      exam: list.filter((q) => q.type === 'exam').length,
    };
  }, [quizzes]);

  function openForm(quiz) {
    if (quiz) {
      setEditing(quiz);
      setForm({
        title: quiz.title || '',
        subject_id: quiz.subject_id ? String(quiz.subject_id) : '',
        chapter_ids: Array.isArray(quiz.chapter_ids) ? quiz.chapter_ids : [],
        type: quiz.type || 'practice',
        pass_percent: quiz.pass_percent || 70,
        duration_minutes: quiz.duration_minutes || 30,
        attempt_limit: quiz.attempt_limit || 0,
        status: quiz.status || 'draft',
        question_count: Array.isArray(quiz.question_ids) ? quiz.question_ids.length : 10,
      });
      setSelectedQuestions(Array.isArray(quiz.question_ids) ? quiz.question_ids : []);
    } else {
      setEditing(null);
      setForm({
        title: '',
        subject_id: subjects[0]?.id ? String(subjects[0].id) : '',
        chapter_ids: [],
        type: 'practice',
        pass_percent: 70,
        duration_minutes: 30,
        attempt_limit: 0,
        status: 'draft',
        question_count: 10,
      });
      setSelectedQuestions([]);
    }
    setFormOpen(true);
  }

  async function submitQuiz(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.warning('Title required', 'Please provide a title for the quiz.');
      return;
    }

    let qIds = selectedQuestions;
    if (!qIds.length && availableQuestions.length) {
      // Auto-pick first N questions if not manually checked
      qIds = availableQuestions.slice(0, Math.min(form.question_count, availableQuestions.length)).map((q) => q.id);
    }

    if (!qIds.length) {
      toast.warning('No questions', 'Select or configure questions for this quiz.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        subject_id: form.subject_id ? Number(form.subject_id) : null,
        chapter_ids: form.chapter_ids,
        type: form.type,
        pass_percent: Number(form.pass_percent) || 70,
        duration_minutes: form.type === 'practice' ? null : Number(form.duration_minutes) || 30,
        attempt_limit: Number(form.attempt_limit) || 0,
        status: form.status,
        question_ids: qIds,
      };

      if (editing) {
        await api.patch(`/exams/quizzes/${editing.id}`, payload);
        toast.success('Quiz updated', `${form.title} updated successfully.`);
      } else {
        await api.post('/exams/quizzes', payload);
        toast.success('Quiz created', `${form.title} created successfully.`);
      }

      setFormOpen(false);
      load();
    } catch (err) {
      toast.error('Failed to save quiz', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(quiz) {
    const newStatus = quiz.status === 'published' ? 'draft' : 'published';
    try {
      await api.patch(`/exams/quizzes/${quiz.id}/status`, { status: newStatus });
      toast.success(
        newStatus === 'published' ? 'Quiz Published' : 'Quiz set to Draft',
        `${quiz.title} status updated.`
      );
      load();
    } catch (err) {
      toast.error('Status toggle failed', err.message);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await api.delete(`/exams/quizzes/${confirmDelete.id}`);
      toast.success('Quiz deleted', `${confirmDelete.title} was removed.`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error('Delete failed', err.message);
    }
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Quizzes & Practice Tests"
        subtitle="Manage subject practice assessments, chapter review tests, and progress checks."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>
            New Quiz
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard icon={CheckSquare} tone="indigo" value={stats.total} label="Total Quizzes" sub="Active repository" />
        <KpiCard icon={Globe} tone="green" value={stats.published} label="Published" sub="Available to students" />
        <KpiCard icon={BookOpen} tone="cyan" value={stats.practice} label="Practice Mode" sub="Untimed instant review" />
        <KpiCard icon={Award} tone="purple" value={stats.exam} label="Exam Mode" sub="Timed formal evaluation" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search quizzes by title or subject..."
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

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="select-filter"
            >
              <option value="all">All Types</option>
              <option value="practice">Practice Mode</option>
              <option value="exam">Exam Mode</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select-filter"
            >
              <option value="all">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : error ? (
          <ErrorState title="Failed to load quizzes" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="No quizzes found"
            description={search ? 'Try adjusting your search filters.' : 'Create your first quiz to begin assessing students.'}
            action={
              <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>
                Create Quiz
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Quiz Title</th>
                  <th>Subject</th>
                  <th>Mode</th>
                  <th>Questions</th>
                  <th>Timer / Pass %</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => {
                  const qCount = Array.isArray(q.question_ids) ? q.question_ids.length : 0;
                  return (
                    <tr key={q.id}>
                      <td data-label="Quiz">
                        <strong>{q.title}</strong>
                      </td>
                      <td data-label="Subject">
                        <span className="td-muted">{q.subject_title || 'General / Multi-subject'}</span>
                      </td>
                      <td data-label="Mode">
                        <Badge tone={q.type === 'exam' ? 'purple' : 'cyan'}>
                          {q.type === 'exam' ? 'Timed Exam' : 'Practice'}
                        </Badge>
                      </td>
                      <td data-label="Questions">
                        <strong>{qCount}</strong> questions
                      </td>
                      <td data-label="Timer / Pass">
                        <div className="td-muted" style={{ fontSize: '0.82rem' }}>
                          {q.type === 'exam' ? `${q.duration_minutes}m` : 'Untimed'} · {q.pass_percent}% pass
                        </div>
                      </td>
                      <td data-label="Status">
                        <Badge tone={q.status === 'published' ? 'green' : 'amber'}>
                          {q.status === 'published' ? '● Published' : '○ Draft'}
                        </Badge>
                      </td>
                      <td data-label="Actions" style={{ textAlign: 'right' }}>
                        <RowMenu
                          items={[
                            {
                              label: q.status === 'published' ? 'Unpublish (Draft)' : 'Publish Quiz',
                              icon: q.status === 'published' ? Lock : Globe,
                              onClick: () => toggleStatus(q),
                            },
                            {
                              label: 'Edit Configuration',
                              icon: Pencil,
                              onClick: () => openForm(q),
                            },
                            {
                              label: 'Delete Quiz',
                              icon: Trash2,
                              danger: true,
                              onClick: () => setConfirmDelete(q),
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
          title={editing ? `Edit Quiz: ${editing.title}` : 'Create New Quiz'}
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={submitQuiz} className="form-stack">
            <div className="form-group">
              <label>Quiz Title *</label>
              <input
                type="text"
                placeholder="e.g. Navigation Dead Reckoning Assessment"
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
                >
                  <option value="">Select Subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Quiz Mode</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="practice">Practice (Untimed with instant explanations)</option>
                  <option value="exam">Exam (Timed, formal evaluation)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-3" style={{ gap: 12 }}>
              {form.type === 'exam' && (
                <div className="form-group">
                  <label>Duration (Minutes) *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Passing Score (%)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={form.pass_percent}
                  onChange={(e) => setForm({ ...form, pass_percent: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Attempt Limit (0 = Unlimited)</label>
                <input
                  type="number"
                  min="0"
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
                <option value="draft">Draft (Hidden from students)</option>
                <option value="published">Published (Live to students)</option>
              </select>
            </div>

            {form.subject_id && availableQuestions.length > 0 && (
              <div className="form-group">
                <label>Select Questions ({selectedQuestions.length} selected of {availableQuestions.length} available)</label>
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {availableQuestions.map((q) => {
                    const checked = selectedQuestions.includes(q.id);
                    return (
                      <label key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...selectedQuestions, q.id]
                              : selectedQuestions.filter((id) => id !== q.id);
                            setSelectedQuestions(updated);
                          }}
                        />
                        <span style={{ flex: 1 }}>{q.question_text?.slice(0, 80)}...</span>
                        <Badge tone="slate">{q.difficulty || 'medium'}</Badge>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="form-actions row row-end" style={{ gap: 8, marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={saving}>
                {editing ? 'Update Quiz' : 'Create Quiz'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Quiz"
          message={`Are you sure you want to delete "${confirmDelete.title}"? Existing attempts and score records will be preserved.`}
          confirmLabel="Delete Quiz"
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

