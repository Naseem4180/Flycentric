import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Users as UsersIcon, Layers, CalendarClock, Pencil, Trash2, Eye,
  Search, RotateCcw, UserCog, GraduationCap,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Badge, RowMenu,
} from '../../ui';

const BLANK = { name: '', instructor_id: '', schedule: '', studentIds: [] };

export default function AdminBatches() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [batches, setBatches] = useState(null);
  const [instructors, setInstructors] = useState([]);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [viewStudents, setViewStudents] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(() => {
    setError('');
    api.get('/batches').then((d) => setBatches(d.batches)).catch((e) => { setError(e.message); setBatches([]); });
  }, []);

  useEffect(() => {
    load();
    api.get('/admin/users?role=instructor&limit=200').then((d) => setInstructors(d.users)).catch(() => {});
    api.get('/admin/users?role=student&limit=500').then((d) => setStudents(d.users)).catch(() => {});
  }, [load]);

  useEffect(() => {
    if (searchParams.get('new') === '1') { openForm(null); setSearchParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (batches || []).filter((b) => !term
      || (b.name || '').toLowerCase().includes(term)
      || (b.instructor_name || '').toLowerCase().includes(term));
  }, [batches, search]);

  const counts = useMemo(() => {
    const list = batches || [];
    return {
      total: list.length,
      withStudents: list.filter((b) => (b.student_count || 0) > 0).length,
      assigned: list.filter((b) => b.instructor_id).length,
      students: list.reduce((s, b) => s + (b.student_count || 0), 0),
    };
  }, [batches]);

  async function openForm(batch) {
    setFormErrors({});
    if (batch) {
      setEditing(batch);
      const enrolled = await api.get(`/batches/${batch.id}/students`).then((d) => d.students.map((s) => s.id)).catch(() => []);
      setForm({
        name: batch.name || '',
        instructor_id: batch.instructor_id ? String(batch.instructor_id) : '',
        schedule: batch.schedule || '',
        studentIds: enrolled,
      });
    } else {
      setEditing(null);
      setForm(BLANK);
    }
    setFormOpen(true);
  }

  async function submit(e) {
    e?.preventDefault();
    if (!form.name.trim()) {
      setFormErrors({ name: 'Batch name is required.' });
      toast.warning('Check the form', 'The batch needs a name.');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), instructor_id: form.instructor_id || null, schedule: form.schedule || null };
      let batchId = editing?.id;
      if (editing) {
        await api.patch(`/batches/${editing.id}`, payload);
      } else {
        const { batch } = await api.post('/batches', payload);
        batchId = batch.id;
      }
      if (form.studentIds.length) {
        await api.post(`/batches/${batchId}/students`, { studentIds: form.studentIds });
      }
      toast.success(editing ? 'Batch updated successfully' : 'Batch created successfully', form.name.trim());
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error('Could not save the batch', err.message);
    } finally {
      setSaving(false);
    }
  }

  function askDelete(batch) {
    setConfirm({
      title: 'Delete batch?',
      message: `“${batch.name}” will be permanently removed and its students unenrolled. Student accounts and results are not affected.`,
      warning: 'This action cannot be undone.',
      confirmLabel: 'Delete Batch',
      onConfirm: async () => {
        try {
          await api.del(`/batches/${batch.id}`);
          toast.success('Batch deleted', batch.name);
          load();
        } catch (err) { toast.error('Delete failed', err.message); }
        setConfirm(null);
      },
    });
  }

  async function openView(batch) {
    setViewing(batch);
    setViewStudents(null);
    const list = await api.get(`/batches/${batch.id}/students`).then((d) => d.students).catch(() => []);
    setViewStudents(list);
  }

  function toggleStudent(id) {
    setForm((f) => ({
      ...f,
      studentIds: f.studentIds.includes(id) ? f.studentIds.filter((s) => s !== id) : [...f.studentIds, id],
    }));
  }

  return (
    <div className="accent-blue">
      <PageHeader
        eyebrow="Academics"
        title="Batches"
        subtitle="Manage batches, instructors, schedules and students."
        actions={<Button variant="primary" icon={Plus} onClick={() => openForm(null)}>New Batch</Button>}
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={load}>Retry</Button></div>}

      <div className="kpi-grid">
        <KpiCard icon={Layers} tone="blue" value={counts.total} label="Total Batches" sub="Across the platform" />
        <KpiCard icon={GraduationCap} tone="green" value={counts.students} label="Enrolled Students" sub="Sum across all batches" />
        <KpiCard icon={UserCog} tone="orange" value={counts.assigned} label="With an Instructor" sub={`${counts.total - counts.assigned} unassigned`} />
        <KpiCard icon={UsersIcon} tone="indigo" value={counts.withStudents} label="Active Batches" sub="Have at least one student" />
      </div>

      <Card flush className="table-card">
        <div className="toolbar" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <label className="input-with-icon" style={{ maxWidth: 300 }}>
            <Search size={15} />
            <input placeholder="Search batches or instructors…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search batches" />
          </label>
          <span className="muted" style={{ fontSize: '.8rem' }}>{filtered.length} batch{filtered.length === 1 ? '' : 'es'}</span>
        </div>

        {batches === null ? <SkeletonTable rows={4} cols={5} /> : error ? (
          <ErrorState title="Unable to load batches" description="We couldn't retrieve your batches right now." onRetry={load} />
        ) : !filtered.length ? (
          batches.length ? (
            <EmptyState icon={Search} tone="blue" title="No batches found" description="Try a different search term." action={<Button variant="primary" onClick={() => setSearch('')}>Clear Search</Button>} />
          ) : (
            <EmptyState
              icon={Layers} tone="blue" title="No Batches"
              description="Create your first batch to start grouping students under an instructor."
              action={<Button variant="primary" icon={Plus} onClick={() => openForm(null)}>New Batch</Button>}
            />
          )
        ) : (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr><th>Batch</th><th>Students</th><th>Instructor</th><th>Schedule</th><th>Status</th><th className="td-actions">Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Batch" className="td-strong">{b.name}</td>
                    <td data-label="Students">
                      <span className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                        <UsersIcon size={13} style={{ color: 'var(--muted)' }} />
                        {b.student_count || 0}
                      </span>
                    </td>
                    <td data-label="Instructor">{b.instructor_name || <span className="td-muted">Unassigned</span>}</td>
                    <td data-label="Schedule" className="td-muted">{b.schedule || 'No schedule'}</td>
                    <td data-label="Status">
                      {(b.student_count || 0) > 0
                        ? <Badge tone="green" dot>Active</Badge>
                        : <Badge tone="slate" dot>Empty</Badge>}
                    </td>
                    <td data-label="Actions" className="td-actions">
                      <div className="btn-group">
                        <Button size="xs" icon={Eye} onClick={() => openView(b)}>View</Button>
                        <Button size="xs" icon={Pencil} onClick={() => openForm(b)}>Edit</Button>
                        <RowMenu items={[
                          { label: 'Delete batch', icon: Trash2, danger: true, onClick: () => askDelete(b) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        variant="drawer"
        title={editing ? `Edit ${editing.name}` : 'New Batch'}
        description="Group students under an instructor with a schedule."
        footer={(
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={saving} loadingLabel="Saving…">{editing ? 'Save Changes' : 'Create Batch'}</Button>
          </>
        )}
      >
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="b-name">Batch name <span className="field-req">*</span></label>
            <input id="b-name" value={form.name} className={formErrors.name ? 'has-error' : ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. CPL Batch — Aug 2026" />
            {formErrors.name && <p className="field-error">{formErrors.name}</p>}
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="b-inst">Instructor</label>
              <select id="b-inst" value={form.instructor_id} onChange={(e) => setForm({ ...form, instructor_id: e.target.value })}>
                <option value="">— Unassigned —</option>
                {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="b-sched">Schedule</label>
              <input id="b-sched" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="e.g. Mon/Wed/Fri 6–8pm" />
            </div>
          </div>
          <div className="field">
            <label>Students ({form.studentIds.length} selected)</label>
            <div className="check-list">
              {students.length ? students.map((s) => (
                <label key={s.id} className="check-row">
                  <input type="checkbox" checked={form.studentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span className="td-muted">{s.email}</span>
                </label>
              )) : <p className="muted" style={{ padding: 12, margin: 0 }}>No students yet. Add them from the Users page first.</p>}
            </div>
            {editing && <p className="field-hint">Ticking a student adds them to the batch. Removing a student is done from the batch detail view.</p>}
          </div>
        </form>
      </Modal>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name}
        description={viewing ? `${viewing.instructor_name || 'No instructor'} · ${viewing.schedule || 'No schedule'}` : ''}
        footer={<><Button variant="outline" onClick={() => setViewing(null)}>Close</Button><Button variant="primary" icon={Pencil} onClick={() => { openForm(viewing); setViewing(null); }}>Edit Batch</Button></>}
      >
        <strong style={{ fontSize: '.84rem', display: 'block', marginBottom: 10 }}>
          <UsersIcon size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Enrolled students
        </strong>
        {viewStudents === null ? <p className="muted">Loading…</p> : viewStudents.length ? (
          <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th className="td-actions">Action</th></tr></thead>
              <tbody>
                {viewStudents.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="td-muted">{s.email}</td>
                    <td className="td-actions">
                      <Button
                        size="xs" variant="danger-soft" icon={Trash2}
                        onClick={async () => {
                          try {
                            await api.del(`/batches/${viewing.id}/students/${s.id}`);
                            setViewStudents((list) => list.filter((x) => x.id !== s.id));
                            toast.success('Student removed from batch', s.name);
                            load();
                          } catch (err) { toast.error('Could not remove student', err.message); }
                        }}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={CalendarClock} tone="blue" title="No students yet" description="Edit the batch to enrol students." />
        )}
      </Modal>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
        title={confirm?.title}
        message={confirm?.message}
        warning={confirm?.warning}
        confirmLabel={confirm?.confirmLabel}
      />
    </div>
  );
}
