import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText, Plus, Search, Filter, BookOpen, Layers, Clock,
  Calendar, CheckCircle2, AlertCircle, Eye, Trash2, ShieldAlert
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, RowMenu
} from '../../ui';

export default function AdminAssignments() {
  const toast = useToast();

  const [assignments, setAssignments] = useState(null);
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    bundle_id: '',
    subject_id: '',
    chapter_id: '',
    title: '',
    description: '',
    instructions: '',
    duration_minutes: 60,
    attempts_allowed: 1,
    due_date: '',
    status: 'published',
  });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/admin/assignments'),
      api.get('/content/bundles'),
      api.get('/content/subjects'),
    ])
      .then(([assignRes, bundleRes, subjRes]) => {
        setAssignments(assignRes.assignments || []);
        setCourses(bundleRes.bundles || []);
        setSubjects(subjRes.subjects || []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load assignments');
        setAssignments([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // When subject changes in form, fetch its chapters
  useEffect(() => {
    if (form.subject_id) {
      api.get(`/content/subjects/${form.subject_id}/chapters`)
        .then((res) => {
          // Sort chapters strictly by order_index
          const list = (res.chapters || []).slice().sort((a, b) => (a.order_index ?? a.id) - (b.order_index ?? b.id));
          setChapters(list);
          if (list.length && !form.chapter_id) {
            setForm((prev) => ({ ...prev, chapter_id: String(list[0].id) }));
          }
        })
        .catch(() => setChapters([]));
    } else {
      setChapters([]);
    }
  }, [form.subject_id]);

  const filtered = useMemo(() => {
    let list = assignments || [];
    if (courseFilter !== 'all') {
      list = list.filter((a) => String(a.bundle_id) === String(courseFilter));
    }
    if (subjectFilter !== 'all') {
      list = list.filter((a) => String(a.subject_id) === String(subjectFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((item) =>
        item.title?.toLowerCase().includes(q) ||
        item.subject_title?.toLowerCase().includes(q) ||
        item.chapter_title?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [assignments, courseFilter, subjectFilter, search]);

  const stats = useMemo(() => {
    const list = assignments || [];
    return {
      total: list.length,
      active: list.filter((a) => a.status === 'published').length,
      singleAttempt: list.filter((a) => a.attempts_allowed === 1).length,
      multiAttempt: list.filter((a) => a.attempts_allowed > 1).length,
    };
  }, [assignments]);

  function openForm() {
    setFormErrors({});
    setForm({
      bundle_id: courses[0]?.id ? String(courses[0].id) : '',
      subject_id: subjects[0]?.id ? String(subjects[0].id) : '',
      chapter_id: '',
      title: '',
      description: '',
      instructions: '',
      duration_minutes: 60,
      attempts_allowed: 1,
      due_date: '',
      status: 'published',
    });
    setFormOpen(true);
  }

  async function submitAssignment(e) {
    e.preventDefault();
    const errors = {};
    if (!form.title.trim()) errors.title = 'Assignment title is required';
    if (!form.bundle_id) errors.bundle_id = 'Course / Bundle selection is required';
    if (!form.subject_id) errors.subject_id = 'Subject selection is required';
    if (!form.chapter_id) errors.chapter_id = 'Chapter placement is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.warning('Check inputs', 'Please resolve highlighted errors.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/admin/assignments', {
        bundle_id: Number(form.bundle_id),
        subject_id: Number(form.subject_id),
        chapter_id: Number(form.chapter_id),
        title: form.title,
        description: form.description,
        instructions: form.instructions,
        duration_minutes: Number(form.duration_minutes) || 60,
        attempts_allowed: Number(form.attempts_allowed) || 1,
        due_date: form.due_date || null,
        status: form.status,
      });

      toast.success('Assignment created', `${form.title} has been published in sequence.`);
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error('Failed to create assignment', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await api.delete(`/admin/assignments/${confirmDelete.id}`);
      toast.success('Assignment deleted', `${confirmDelete.title} was removed.`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error('Delete failed', err.message);
    }
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Chapter Assignments"
        subtitle="Manage sequential chapter assignments, submission limits, and 3-hour auto-timeout rules."
        actions={
          <Button variant="primary" icon={Plus} onClick={openForm}>
            New Assignment
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard icon={FileText} tone="indigo" value={stats.total} label="Total Assignments" sub="Chapter tasks" />
        <KpiCard icon={CheckCircle2} tone="green" value={stats.active} label="Active & Published" sub="Open for submission" />
        <KpiCard icon={Clock} tone="orange" value={stats.singleAttempt} label="Strict Single Try" sub="High-stakes tasks" />
        <KpiCard icon={ShieldAlert} tone="purple" value="3 Hours" label="Inactivity Auto-Submit" sub="Global auto-timeout" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search assignments by title or chapter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="select-filter"
            >
              <option value="all">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>

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
          <ErrorState title="Failed to load assignments" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No assignments found"
            description="Create chapter-sequenced assignments to evaluate students' practical aviation knowledge."
            action={
              <Button variant="primary" icon={Plus} onClick={openForm}>
                Create Assignment
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Assignment Title</th>
                  <th>Course & Subject</th>
                  <th>Chapter Sequence</th>
                  <th>Duration / Inactivity</th>
                  <th>Tries Allowed</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Assignment">
                      <strong>{a.title}</strong>
                      {a.due_date && (
                        <div className="td-muted" style={{ fontSize: '0.78rem' }}>
                          Due: {new Date(a.due_date).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td data-label="Course / Subject">
                      <div>{a.course_title || 'All Courses'}</div>
                      <div className="td-muted" style={{ fontSize: '0.8rem' }}>
                        {a.subject_title || 'General Subject'}
                      </div>
                    </td>
                    <td data-label="Sequence Placement">
                      <Badge tone="indigo">
                        Following: {a.chapter_title || `Chapter #${a.chapter_id}`}
                      </Badge>
                    </td>
                    <td data-label="Duration / Timeout">
                      <div>{a.duration_minutes}m duration</div>
                      <div className="td-muted" style={{ fontSize: '0.75rem' }}>
                        Auto-submit: 3h inactivity
                      </div>
                    </td>
                    <td data-label="Tries">
                      <Badge tone={a.attempts_allowed === 1 ? 'amber' : 'slate'}>
                        {a.attempts_allowed === 1 ? '1 Attempt' : `${a.attempts_allowed} Attempts`}
                      </Badge>
                    </td>
                    <td data-label="Status">
                      <Badge tone={a.status === 'published' ? 'green' : 'slate'}>
                        {a.status === 'published' ? '● Published' : '○ Draft'}
                      </Badge>
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      <RowMenu
                        items={[
                          {
                            label: 'Delete Assignment',
                            icon: Trash2,
                            danger: true,
                            onClick: () => setConfirmDelete(a),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {formOpen && (
        <Modal
          title="Create Chapter-Sequenced Assignment"
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={submitAssignment} className="form-stack">
            <div className="form-group">
              <label>Assignment Title *</label>
              <input
                type="text"
                placeholder="e.g. Navigation Log Calculations Exercise"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={formErrors.title ? 'is-invalid' : ''}
              />
              {formErrors.title && <span className="field-error">{formErrors.title}</span>}
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Course / Bundle *</label>
                <select
                  value={form.bundle_id}
                  onChange={(e) => setForm({ ...form, bundle_id: e.target.value })}
                >
                  <option value="">Select Course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Subject *</label>
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
            </div>

            <div className="form-group">
              <label>Sequence Placement (Follows Chapter) *</label>
              <select
                value={form.chapter_id}
                onChange={(e) => setForm({ ...form, chapter_id: e.target.value })}
                className={formErrors.chapter_id ? 'is-invalid' : ''}
              >
                <option value="">Select Chapter</option>
                {chapters.map((ch, idx) => (
                  <option key={ch.id} value={ch.id}>
                    Chapter #{ch.order_index ?? idx + 1}: {ch.title}
                  </option>
                ))}
              </select>
              <span className="td-muted" style={{ fontSize: '0.78rem', marginTop: 4, display: 'block' }}>
                On the student portal, this assignment will appear directly beneath this selected chapter in strict order ID sequence.
              </span>
            </div>

            <div className="form-group">
              <label>Description & Scope</label>
              <textarea
                rows={2}
                placeholder="Briefly describe what students will complete..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Submission Instructions</label>
              <textarea
                rows={3}
                placeholder="Instructions, guidelines, formula sheets, or document requirements..."
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            </div>

            <div className="grid grid-3" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Duration (Minutes)</label>
                <input
                  type="number"
                  min="5"
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Attempts Allowed</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={form.attempts_allowed}
                  onChange={(e) => setForm({ ...form, attempts_allowed: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Due Date (Optional)</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>

            <div className="callout callout-info" style={{ padding: '10px 14px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.82rem', color: '#1e40af' }}>
              <strong>Automatic Inactivity Rule:</strong> Any assignment attempt left idle without student input for 3 continuous hours will be auto-submitted by the background scheduler to safeguard exam integrity.
            </div>

            <div className="form-actions row row-end" style={{ gap: 8, marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={saving}>
                Publish Assignment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Assignment"
          message={`Are you sure you want to delete "${confirmDelete.title}"? Student submission files will be archived.`}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

