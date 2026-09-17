import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UserCheck, Plus, Search, Filter, BookOpen, GraduationCap,
  Calendar, CheckCircle2, AlertCircle, XCircle, Trash2, Clock
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, ProgressBar
} from '../../ui';

export default function AdminEnrollments() {
  const toast = useToast();

  const [enrollments, setEnrollments] = useState(null);
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    user_id: '',
    bundle_id: '',
    batch_id: '',
    enrollment_type: 'paid',
    expires_at: '',
  });
  const [saving, setSaving] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/admin/enrollments?limit=250'),
      api.get('/admin/students?limit=500'),
      api.get('/content/bundles'),
      api.get('/batches'),
    ])
      .then(([enrRes, stuRes, bundleRes, batchRes]) => {
        setEnrollments(enrRes.enrollments || []);
        setStudents(stuRes.students || []);
        setCourses(bundleRes.bundles || []);
        setBatches(batchRes.batches || []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load enrollments');
        setEnrollments([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = enrollments || [];
    if (statusFilter !== 'all') {
      list = list.filter((e) => e.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        (e.student_name || '').toLowerCase().includes(q) ||
        (e.student_email || '').toLowerCase().includes(q) ||
        (e.bundle_title || '').toLowerCase().includes(q) ||
        (e.batch_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [enrollments, statusFilter, search]);

  const stats = useMemo(() => {
    const list = enrollments || [];
    return {
      total: list.length,
      active: list.filter((e) => e.status === 'active').length,
      paid: list.filter((e) => e.enrollment_type === 'paid').length,
      free: list.filter((e) => e.enrollment_type === 'free').length,
    };
  }, [enrollments]);

  async function submitEnrollment(e) {
    e.preventDefault();
    if (!form.user_id || !form.bundle_id) {
      toast.warning('Selection required', 'Select both a student and a course.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/admin/enrollments', {
        user_id: Number(form.user_id),
        bundle_id: Number(form.bundle_id),
        batch_id: form.batch_id ? Number(form.batch_id) : null,
        enrollment_type: form.enrollment_type,
        expires_at: form.expires_at || null,
      });

      toast.success('Access Granted', 'Student enrolled in course successfully.');
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error('Enrollment failed', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    if (!confirmRevoke) return;
    try {
      await api.delete(`/admin/enrollments/${confirmRevoke.id}`);
      toast.success('Access Revoked', `Enrollment #${confirmRevoke.id} was terminated.`);
      setConfirmRevoke(null);
      load();
    } catch (err) {
      toast.error('Revocation failed', err.message);
    }
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        title="Course Enrollments"
        subtitle="Manage student access entitlements, batch assignments, and course validity windows."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>
            Grant Course Access
          </Button>
        }
      />

      <div className="kpi-grid">
        <KpiCard icon={UserCheck} tone="indigo" value={stats.total} label="Total Enrollments" sub="Active + past" />
        <KpiCard icon={CheckCircle2} tone="green" value={stats.active} label="Active Access" sub="Currently studying" />
        <KpiCard icon={BookOpen} tone="cyan" value={stats.paid} label="Paid Seats" sub="Commercial sales" />
        <KpiCard icon={GraduationCap} tone="purple" value={stats.free} label="Scholarship / Free" sub="Complimentary tier" />
      </div>

      <Card>
        <div className="row row-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 260 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search enrollments by student name, email, or course..."
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
              <option value="all">All Access Statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={7} />
        ) : error ? (
          <ErrorState title="Failed to load enrollments" description={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="No enrollments found"
            description="Grant access to students or wait for online store checkout purchases."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>
                Grant Access
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>Student Cadet</th>
                  <th>Enrolled Course</th>
                  <th>Assigned Batch</th>
                  <th>Access Type</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Expiry</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Student">
                      <strong>{e.student_name || 'Cadet'}</strong>
                      <div className="td-muted" style={{ fontSize: '0.78rem' }}>{e.student_email}</div>
                    </td>
                    <td data-label="Course">
                      <strong>{e.bundle_title || `Course #${e.bundle_id}`}</strong>
                    </td>
                    <td data-label="Batch">
                      <span>{e.batch_name || 'General Batch'}</span>
                    </td>
                    <td data-label="Type">
                      <Badge tone={e.enrollment_type === 'paid' ? 'green' : 'purple'}>
                        {e.enrollment_type}
                      </Badge>
                    </td>
                    <td data-label="Progress">
                      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <ProgressBar percent={e.completion_pct || 0} />
                        <span style={{ fontSize: '0.8rem' }}>{e.completion_pct || 0}%</span>
                      </div>
                    </td>
                    <td data-label="Status">
                      <Badge tone={e.status === 'active' ? 'green' : 'amber'}>
                        {e.status}
                      </Badge>
                    </td>
                    <td data-label="Expiry">
                      <div className="td-muted" style={{ fontSize: '0.82rem' }}>
                        {e.expires_at ? new Date(e.expires_at).toLocaleDateString() : 'Lifetime'}
                      </div>
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        tone="danger"
                        onClick={() => setConfirmRevoke(e)}
                      >
                        Revoke
                      </Button>
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
          title="Grant Course Access"
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={submitEnrollment} className="form-stack">
            <div className="form-group">
              <label>Select Student Cadet *</label>
              <select
                value={form.user_id}
                onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                required
              >
                <option value="">Select Cadet</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Course / Bundle *</label>
                <select
                  value={form.bundle_id}
                  onChange={(e) => setForm({ ...form, bundle_id: e.target.value })}
                  required
                >
                  <option value="">Select Course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Assign Batch (Optional)</label>
                <select
                  value={form.batch_id}
                  onChange={(e) => setForm({ ...form, batch_id: e.target.value })}
                >
                  <option value="">No Specific Batch</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Access Grant Type</label>
                <select
                  value={form.enrollment_type}
                  onChange={(e) => setForm({ ...form, enrollment_type: e.target.value })}
                >
                  <option value="paid">Paid (Manual order settlement)</option>
                  <option value="free">Free / Trial Access</option>
                  <option value="scholarship">Scholarship / Academy Sponsor</option>
                </select>
              </div>

              <div className="form-group">
                <label>Access Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                />
              </div>
            </div>

            <div className="form-actions row row-end" style={{ gap: 8, marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={saving}>
                Enroll Student
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmRevoke && (
        <ConfirmModal
          title="Revoke Course Access"
          message={`Are you sure you want to revoke access to "${confirmRevoke.bundle_title}" for ${confirmRevoke.student_name}?`}
          confirmLabel="Revoke Access"
          tone="danger"
          onConfirm={handleRevoke}
          onCancel={() => setConfirmRevoke(null)}
        />
      )}
    </div>
  );
}

