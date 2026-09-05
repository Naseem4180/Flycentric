import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users as UsersIcon, GraduationCap, UserCog, ShieldCheck, UserX,
  Download, Upload, Plus, Search, Pencil, Ban, RotateCcw, FileDown, Building2,
} from 'lucide-react';
import { api, BASE_URL } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, ImportCsvModal, useToast, downloadCsv,
  KpiCard, EmptyState, ErrorState, SkeletonTable, Pagination, RowMenu, RoleBadge, StatusBadge,
} from '../../ui';

const ROLES = ['student', 'instructor', 'institution', 'admin'];
const BLANK = { name: '', email: '', password: '', role: 'student' };

const TEMPLATE_HEADER = 'name,email,password,role';
const TEMPLATE_ROWS = [
  '"Aisha Khan","aisha@example.com","ChangeMe123!","student"',
  '"Capt. Rao","rao@example.com","ChangeMe123!","instructor"',
  '"SkyHigh Academy","skyhigh@example.com","ChangeMe123!","institution"',
];

export default function AdminUsers() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    setError('');
    api.get('/admin/users?limit=500')
      .then((d) => setUsers(d.users))
      .catch((e) => { setError(e.message); setUsers([]); });
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (searchParams.get('new') === '1') { openForm(null); setSearchParams({}, { replace: true }); }
    const urlQ = searchParams.get('q');
    if (urlQ != null && urlQ !== q) setQ(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const counts = useMemo(() => {
    const list = users || [];
    return {
      total: list.length,
      students: list.filter((u) => u.role === 'student').length,
      instructors: list.filter((u) => u.role === 'instructor').length,
      admins: list.filter((u) => u.role === 'admin').length,
      inactive: list.filter((u) => u.status === 'suspended').length,
    };
  }, [users]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (users || []).filter((u) => {
      if (term && !(u.name || '').toLowerCase().includes(term) && !(u.email || '').toLowerCase().includes(term)) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      return true;
    });
  }, [users, q, roleFilter, statusFilter]);

  useEffect(() => { setPage(1); }, [q, roleFilter, statusFilter, pageSize]);
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  function openForm(user) {
    setFormErrors({});
    if (user) {
      setEditing(user);
      setForm({ name: user.name || '', email: user.email || '', password: '', role: user.role, status: user.status });
    } else {
      setEditing(null);
      setForm(BLANK);
    }
    setFormOpen(true);
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required.';
    if (!editing) {
      if (!form.email.trim()) errs.email = 'Email is required.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Please enter a valid email address.';
      if (!form.password) errs.password = 'Password is required.';
      else if (form.password.length < 8) errs.password = 'Use at least 8 characters.';
    }
    setFormErrors(errs);
    return !Object.keys(errs).length;
  }

  async function submit(e) {
    e?.preventDefault();
    if (!validate()) { toast.warning('Check the form', 'Some required fields need attention.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/admin/users/${editing.id}`, { name: form.name, role: form.role, status: form.status });
        toast.success('User updated successfully');
      } else {
        await api.post('/admin/users', form);
        toast.success('User created successfully', form.email);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error('Could not save the user', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(user, role) {
    try {
      await api.patch(`/admin/users/${user.id}`, { role });
      toast.success('Role updated', `${user.name} is now ${role}.`);
      load();
    } catch (err) {
      toast.error('Could not change role', err.message);
    }
  }

  function askSuspend(user) {
    const suspending = user.status !== 'suspended';
    setConfirm({
      tone: suspending ? 'warning' : 'success',
      title: suspending ? 'Suspend this user?' : 'Reactivate this user?',
      message: suspending
        ? `${user.name} will immediately lose access to FlyCentric. You can reactivate them at any time.`
        : `${user.name} will regain access to FlyCentric straight away.`,
      confirmLabel: suspending ? 'Suspend User' : 'Reactivate User',
      onConfirm: async () => {
        try {
          await api.post(`/admin/users/${user.id}/${suspending ? 'suspend' : 'reactivate'}`);
          toast.success(suspending ? 'User suspended' : 'User reactivated', user.name);
          load();
        } catch (err) {
          toast.error('Action failed', err.message);
        }
        setConfirm(null);
      },
    });
  }

  async function exportUsers() {
    setExporting(true);
    try {
      const token = localStorage.getItem('fc_access');
      const res = await fetch(`${BASE_URL}/admin/users/export`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      downloadCsv('users_export.csv', await res.text());
      toast.success('Users exported');
    } catch (err) {
      toast.error('Export failed', err.message);
    } finally {
      setExporting(false);
    }
  }

  function downloadTemplate() {
    downloadCsv('user_bulk_upload_template.csv', `${TEMPLATE_HEADER}\n${TEMPLATE_ROWS.join('\n')}\n`);
    toast.info('Template downloaded', 'Fill it in, then use Import CSV.');
  }

  return (
    <div className="accent-indigo">
      <PageHeader
        eyebrow="System"
        title="Users"
        subtitle="Manage platform users, roles and access."
        actions={(
          <>
            <Button icon={FileDown} onClick={downloadTemplate}>Download Template</Button>
            <Button icon={Download} onClick={exportUsers} loading={exporting} loadingLabel="Exporting…">Export CSV</Button>
            <Button variant="success" icon={Upload} onClick={() => setImportOpen(true)}>Import CSV</Button>
            <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Add User</Button>
          </>
        )}
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={load}>Retry</Button></div>}

      <div className="kpi-grid">
        <KpiCard icon={UsersIcon} tone="indigo" value={counts.total} label="Total Users" sub="All roles" />
        <KpiCard icon={GraduationCap} tone="green" value={counts.students} label="Students" sub="Learning on the platform" />
        <KpiCard icon={UserCog} tone="orange" value={counts.instructors} label="Instructors" sub="Answering doubts" />
        <KpiCard icon={ShieldCheck} tone="purple" value={counts.admins} label="Admins" sub="Full access" />
        <KpiCard icon={UserX} tone="red" value={counts.inactive} label="Inactive Users" sub="Suspended accounts" />
      </div>

      <Card flush className="table-card">
        <div className="toolbar" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <div className="toolbar-filters">
            <label className="input-with-icon">
              <Search size={15} />
              <input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
            </label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
              <option value="">All Roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            {(q || roleFilter || statusFilter) && (
              <Button variant="ghost" onClick={() => { setQ(''); setRoleFilter(''); setStatusFilter(''); }}>Reset</Button>
            )}
          </div>
          <span className="muted" style={{ fontSize: '.8rem' }}>{filtered.length} user{filtered.length === 1 ? '' : 's'}</span>
        </div>

        {users === null ? <SkeletonTable rows={5} cols={5} /> : error ? (
          <ErrorState title="Unable to load users" description="We couldn't retrieve the user list right now." onRetry={load} />
        ) : !filtered.length ? (
          users.length ? (
            <EmptyState
              icon={Search} tone="indigo" title="No users found"
              description="Try changing your search or filters."
              action={<Button variant="primary" onClick={() => { setQ(''); setRoleFilter(''); setStatusFilter(''); }}>Clear Filters</Button>}
            />
          ) : (
            <EmptyState
              icon={UsersIcon} tone="indigo" title="No Users"
              description="No users have been created yet."
              action={<Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Add User</Button>}
            />
          )
        ) : (
          <>
            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th className="td-actions">Actions</th></tr>
                </thead>
                <tbody>
                  {paged.map((u) => (
                    <tr key={u.id}>
                      <td data-label="Name" className="td-strong">{u.name}</td>
                      <td data-label="Email" className="td-muted">{u.email}</td>
                      <td data-label="Role">
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u, e.target.value)}
                          aria-label={`Role for ${u.name}`}
                          className={`role-select role-${u.role}`}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td data-label="Status"><StatusBadge status={u.status} /></td>
                      <td data-label="Created" className="td-muted td-nowrap">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                      <td data-label="Actions" className="td-actions">
                        <div className="btn-group">
                          <Button size="xs" icon={Pencil} onClick={() => openForm(u)}>Edit</Button>
                          {u.status === 'suspended'
                            ? <Button size="xs" variant="success-soft" icon={RotateCcw} onClick={() => askSuspend(u)}>Reactivate</Button>
                            : <Button size="xs" variant="warning-soft" icon={Ban} onClick={() => askSuspend(u)}>Suspend</Button>}
                          <RowMenu items={[
                            { label: 'View analytics', icon: GraduationCap, onClick: () => { window.location.href = `/admin/student-analytics?student=${u.id}`; } },
                            { label: 'Copy email', icon: Building2, onClick: () => { navigator.clipboard?.writeText(u.email); toast.info('Email copied', u.email); } },
                          ]} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        variant="drawer"
        title={editing ? `Edit ${editing.name}` : 'Add User'}
        description={editing ? 'Update this account’s details and access.' : 'Create a new FlyCentric account.'}
        footer={(
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={saving} loadingLabel="Saving…">{editing ? 'Save Changes' : 'Create User'}</Button>
          </>
        )}
      >
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="u-name">Name <span className="field-req">*</span></label>
            <input id="u-name" value={form.name} className={formErrors.name ? 'has-error' : ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {formErrors.name && <p className="field-error">{formErrors.name}</p>}
          </div>
          <div className="field">
            <label htmlFor="u-email">Email <span className="field-req">*</span></label>
            <input id="u-email" type="email" value={form.email} disabled={!!editing} className={formErrors.email ? 'has-error' : ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {editing && <p className="field-hint">Email addresses can't be changed after the account is created.</p>}
            {formErrors.email && <p className="field-error">{formErrors.email}</p>}
          </div>
          {!editing && (
            <div className="field">
              <label htmlFor="u-pass">Password <span className="field-req">*</span></label>
              <input id="u-pass" type="password" value={form.password} className={formErrors.password ? 'has-error' : ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <p className="field-hint">At least 8 characters. Share it securely with the user.</p>
              {formErrors.password && <p className="field-error">{formErrors.password}</p>}
            </div>
          )}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="u-role">Role</label>
              <select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {editing && (
              <div className="field">
                <label htmlFor="u-status">Status</label>
                <select id="u-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            )}
          </div>
          <div className="row" style={{ marginTop: 4 }}>
            <span className="muted" style={{ fontSize: '.79rem' }}>Preview:</span>
            <RoleBadge role={form.role} />
            <StatusBadge status={form.status || 'active'} />
          </div>
        </form>
      </Modal>

      <ImportCsvModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Users"
        entityLabel="users"
        requiredColumns={['name', 'email', 'password', 'role']}
        dedupeKey="email"
        onDownloadTemplate={downloadTemplate}
        validateRow={(row) => {
          if (!row.name) return { field: 'name', message: 'Name is required', value: '' };
          if (!row.email) return { field: 'email', message: 'Email is required', value: '' };
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return { field: 'email', message: 'Invalid email address', value: row.email };
          if (!row.password) return { field: 'password', message: 'Password is required', value: '' };
          if (row.password.length < 8) return { field: 'password', message: 'Password must be 8+ characters', value: row.password };
          if (!ROLES.includes((row.role || '').toLowerCase())) return { field: 'role', message: `Role must be one of ${ROLES.join(', ')}`, value: row.role };
          return null;
        }}
        onImport={(file) => {
          const fd = new FormData();
          fd.append('file', file);
          return api.postForm('/admin/users/bulk', fd);
        }}
        onDone={load}
      />

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
