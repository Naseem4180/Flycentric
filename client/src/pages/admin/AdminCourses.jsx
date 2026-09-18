import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GraduationCap, Plus, Search, Filter, BookOpen, Layers, CheckCircle2,
  AlertCircle, Eye, Pencil, Trash2, Globe, Lock, Clock, DollarSign, CreditCard
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, RowMenu
} from '../../ui';

const BLANK_COURSE = {
  title: '',
  slug: '',
  description: '',
  exam_type: 'CPL',
  price_inr: 0,
  is_free: false,
  status: 'draft',
  subject_ids: [],
};

const EXAM_TYPES = ['CPL', 'ATPL', 'PPL', 'Airline Prep', 'General Aviation'];

export default function AdminCourses() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [courses, setCourses] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [examFilter, setExamFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_COURSE);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/content/bundles'),
      api.get('/content/subjects'),
    ])
      .then(([bundlesRes, subjectsRes]) => {
        setCourses(bundlesRes.bundles || []);
        setSubjects(subjectsRes.subjects || []);
      })
      .catch((e) => {
        setError(e.message || 'Failed to load courses');
        setCourses([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openForm(null);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    let list = courses || [];
    if (statusFilter !== 'all') {
      list = list.filter((c) => c.status === statusFilter);
    }
    if (examFilter !== 'all') {
      list = list.filter((c) => c.exam_type === examFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.title?.toLowerCase().includes(q) ||
          c.slug?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [courses, statusFilter, examFilter, search]);

  const stats = useMemo(() => {
    const list = courses || [];
    return {
      total: list.length,
      live: list.filter((c) => c.status === 'live').length,
      draft: list.filter((c) => c.status === 'draft').length,
      free: list.filter((c) => c.is_free).length,
    };
  }, [courses]);

  function openForm(course) {
    setFormErrors({});
    if (course) {
      setEditing(course);
      const subjectIds = Array.isArray(course.subjects)
        ? course.subjects.map((s) => s.id)
        : [];
      setForm({
        title: course.title || '',
        slug: course.slug || '',
        description: course.description || '',
        exam_type: course.exam_type || 'CPL',
        price_inr: course.price_inr || 0,
        is_free: Boolean(course.is_free),
        status: course.status || 'draft',
        subject_ids: subjectIds,
      });
    } else {
      setEditing(null);
      setForm(BLANK_COURSE);
    }
    setFormOpen(true);
  }

  function handleTitleChange(e) {
    const title = e.target.value;
    setForm((prev) => ({
      ...prev,
      title,
      slug: editing ? prev.slug : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    }));
  }

  async function submitCourse(e) {
    e.preventDefault();
    const errors = {};
    if (!form.title.trim()) errors.title = 'Course title is required';
    if (!form.slug.trim()) errors.slug = 'Slug is required';
    if (!form.is_free && Number(form.price_inr) < 0) errors.price_inr = 'Price must be non-negative';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.warning('Check inputs', 'Please resolve highlighted errors');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        slug: form.slug,
        description: form.description,
        exam_type: form.exam_type,
        price_inr: form.is_free ? 0 : Number(form.price_inr),
        is_free: form.is_free,
        status: form.status,
        subject_ids: form.subject_ids,
      };

      if (editing) {
        await api.patch(`/content/bundles/${editing.id}`, payload);
        toast.success('Course updated', `${form.title} has been updated.`);
      } else {
        await api.post('/content/bundles', payload);
        toast.success('Course created', `${form.title} has been created.`);
      }

      setFormOpen(false);
      load();
    } catch (err) {
      toast.error('Error saving course', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(course) {
    const nextStatus = course.status === 'live' ? 'unpublish' : 'publish';
    try {
      await api.post(`/content/bundles/${course.id}/${nextStatus}`);
      toast.success(
        nextStatus === 'publish' ? 'Course Published' : 'Course Unpublished',
        `${course.title} is now ${nextStatus === 'publish' ? 'live' : 'draft'}.`
      );
      load();
    } catch (err) {
      toast.error('Status change failed', err.message);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await api.delete(`/content/bundles/${confirmDelete.id}`);
      toast.success('Course archived', `${confirmDelete.title} was moved to trash.`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error('Delete failed', err.message);
    }
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Aviation Courses"
        subtitle="Manage DGCA ground school courses, syllabus packages, and subject bundles."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>
            New Course
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard icon={GraduationCap} tone="indigo" value={stats.total} label="Total Courses" sub="Aviation curriculum" />
        <KpiCard icon={Globe} tone="green" value={stats.live} label="Live & Published" sub="Enrolling students" />
        <KpiCard icon={Clock} tone="orange" value={stats.draft} label="In Draft" sub="Under curriculum review" />
        <KpiCard icon={DollarSign} tone="purple" value={stats.free} label="Free Tier Courses" sub="Available to all" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search courses by title, slug, or syllabus..."
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
              <option value="live">Live</option>
              <option value="draft">Draft</option>
            </select>

            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              className="select-filter"
            >
              <option value="all">All Exam Categories</option>
              {EXAM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : error ? (
          <ErrorState title="Failed to load courses" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No courses found"
            description={search ? 'Try adjusting your search criteria.' : 'Create your first aviation course to get started.'}
            action={
              <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>
                Create Course
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Course Title</th>
                  <th>Exam Category</th>
                  <th>Subjects Included</th>
                  <th>Pricing</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const subjectCount = Array.isArray(c.subjects) ? c.subjects.length : 0;
                  return (
                    <tr key={c.id}>
                      <td data-label="Course">
                        <strong>{c.title}</strong>
                        <div className="td-muted td-clip" style={{ fontSize: '0.78rem' }}>
                          /{c.slug}
                        </div>
                      </td>
                      <td data-label="Exam Category">
                        <Badge tone="indigo">{c.exam_type || 'CPL'}</Badge>
                      </td>
                      <td data-label="Subjects">
                        <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <BookOpen size={14} className="muted" />
                          <strong>{subjectCount}</strong> {subjectCount === 1 ? 'Subject' : 'Subjects'}
                        </span>
                      </td>
                      <td data-label="Pricing">
                        {c.is_free ? (
                          <Badge tone="green">FREE</Badge>
                        ) : (
                          <strong>₹{Number(c.price_inr).toLocaleString('en-IN')}</strong>
                        )}
                      </td>
                      <td data-label="Status">
                        <Badge tone={c.status === 'live' ? 'green' : 'amber'}>
                          {c.status === 'live' ? '● Published' : '○ Draft'}
                        </Badge>
                      </td>
                      <td data-label="Actions" style={{ textAlign: 'right' }}>
                        <RowMenu
                          items={[
                            {
                              label: c.status === 'live' ? 'Unpublish Course' : 'Publish Course',
                              icon: c.status === 'live' ? Lock : Globe,
                              onClick: () => toggleStatus(c),
                            },
                            {
                              label: 'Edit Details',
                              icon: Pencil,
                              onClick: () => openForm(c),
                            },
                            {
                              label: 'Archive to Trash',
                              icon: Trash2,
                              danger: true,
                              onClick: () => setConfirmDelete(c),
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
          title={editing ? `Edit Course: ${editing.title}` : 'Create Aviation Course'}
          subtitle="Configure syllabus scope, target DGCA exam, pricing model, and subject curriculum."
          icon={Layers}
          tone="indigo"
          badge={form.status === 'live' ? 'Active Bundle' : 'Draft'}
          onClose={() => setFormOpen(false)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submitCourse} loading={saving}>
                {editing ? 'Update Course' : 'Create Course'}
              </Button>
            </>
          )}
        >
          <form onSubmit={submitCourse} className="form-stack">
            {/* Section 1: Course Identity */}
            <div className="form-card-box form-card-blue">
              <div className="form-card-header-row">
                <span className="form-card-header">
                  <Layers size={14} /> Course Information &amp; Scope
                </span>
                <span className="form-card-badge">
                  {form.exam_type || 'CPL'}
                </span>
              </div>

              <div className="field">
                <label>Course Title <span className="field-req">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. DGCA CPL Ground School Comprehensive"
                  value={form.title}
                  onChange={handleTitleChange}
                  className={formErrors.title ? 'is-invalid' : ''}
                  required
                />
                <small className="field-hint">Primary title displayed across student syllabus catalogs.</small>
                {formErrors.title && <span className="field-error">{formErrors.title}</span>}
              </div>

              <div className="form-row-2" style={{ marginTop: 8 }}>
                <div className="field">
                  <label>Slug (URL Identifier) <span className="field-req">*</span></label>
                  <input
                    type="text"
                    placeholder="dgca-cpl-ground-school"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    className={formErrors.slug ? 'is-invalid' : ''}
                    required
                  />
                  {formErrors.slug && <span className="field-error">{formErrors.slug}</span>}
                </div>

                <div className="field">
                  <label>Target Regulatory Exam</label>
                  <select
                    value={form.exam_type}
                    onChange={(e) => setForm({ ...form, exam_type: e.target.value })}
                  >
                    {EXAM_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field" style={{ marginTop: 8 }}>
                <label>Description &amp; Syllabus Scope</label>
                <textarea
                  rows={3}
                  placeholder="Detail the subjects covered, flight simulator prep, and exam syllabus..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <small className="field-hint">Brief overview presented to students before enrollment.</small>
              </div>
            </div>

            {/* Section 2: Pricing & Access */}
            <div className="form-card-box form-card-green">
              <div className="form-card-header-row">
                <span className="form-card-header">
                  <CreditCard size={14} /> Pricing &amp; Enrollment Access
                </span>
                <span className="form-card-badge">
                  {form.is_free ? 'Free Course' : (form.price_inr ? `₹${Number(form.price_inr).toLocaleString('en-IN')}` : 'Paid')}
                </span>
              </div>

              <div className="form-row-2">
                <div className="field">
                  <label>Pricing Structure</label>
                  <label className={`check-pill ${form.is_free ? 'is-checked' : ''}`} style={{ marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={form.is_free}
                      onChange={(e) => setForm({ ...form, is_free: e.target.checked })}
                    />
                    <span>Free Course (Complimentary access)</span>
                  </label>
                  <small className="field-hint">When ticked, any pilot can enroll without payment.</small>
                </div>

                {!form.is_free ? (
                  <div className="field">
                    <label>Price (INR) <span className="field-req">*</span></label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 14999"
                      value={form.price_inr}
                      onChange={(e) => setForm({ ...form, price_inr: e.target.value })}
                      className={formErrors.price_inr ? 'is-invalid' : ''}
                      required
                    />
                    {formErrors.price_inr && <span className="field-error">{formErrors.price_inr}</span>}
                  </div>
                ) : (
                  <div className="field">
                    <label>Access Mode</label>
                    <div style={{ padding: '8px 12px', background: '#dcfce7', color: '#15803d', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700 }}>
                      ✓ Students can enroll with 1-click free access
                    </div>
                  </div>
                )}
              </div>

              <div className="field" style={{ marginTop: 8 }}>
                <label>Publish Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="draft">Draft (Hidden from students)</option>
                  <option value="live">Live (Active and open for student enrollment)</option>
                </select>
              </div>
            </div>

            {/* Section 3: Subject Curriculum Assignment */}
            <div className="form-card-box form-card-purple">
              <div className="form-card-header-row">
                <span className="form-card-header">
                  <BookOpen size={14} /> Included Subjects Curriculum
                </span>
                <span className="form-card-badge">
                  {form.subject_ids.length} of {subjects.length} selected
                </span>
              </div>

              <div className="check-pill-grid" style={{ maxHeight: 190, overflowY: 'auto', padding: 2 }}>
                {subjects.map((s) => {
                  const checked = form.subject_ids.includes(s.id);
                  return (
                    <label key={s.id} className={`check-pill ${checked ? 'is-checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...form.subject_ids, s.id]
                            : form.subject_ids.filter((id) => id !== s.id);
                          setForm({ ...form, subject_ids: updated });
                        }}
                      />
                      <span style={{ fontWeight: checked ? 700 : 500 }}>{s.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Archive Course"
          message={`Are you sure you want to archive "${confirmDelete.title}"? Students currently enrolled will keep access, but no new purchases will be permitted.`}
          confirmLabel="Archive Course"
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

