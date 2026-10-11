import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users as UsersIcon, GraduationCap, UserCog, ShieldCheck, UserX,
  Download, Upload, Plus, Search, Pencil, Ban, RotateCcw, FileDown, Building2,
  User, KeyRound, Shield, UserPlus, Copy, Check, Mail, Eye, EyeOff, Sparkles, ExternalLink,
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

function generateStrongPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const symbols = '!@#$%&*';
  let pass = 'Aero';
  for (let i = 0; i < 4; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
  pass += symbols.charAt(Math.floor(Math.random() * symbols.length));
  for (let i = 0; i < 3; i++) pass += Math.floor(Math.random() * 10);
  return pass;
}

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

  // Password reset modal states
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetTab, setResetTab] = useState('direct'); // 'direct' | 'link'
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notifyUserByEmail, setNotifyUserByEmail] = useState(true);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [passCopied, setPassCopied] = useState(false);

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

  function openResetModal(user) {
    setResetTarget(user);
    setResetTab('direct');
    setNewPassword(generateStrongPassword());
    setShowPassword(true);
    setNotifyUserByEmail(true);
    setResetError('');
    setGeneratedLink('');
    setLinkCopied(false);
    setPassCopied(false);
    setResetModalOpen(true);
  }

  async function handleDirectReset(e) {
    e?.preventDefault();
    if (!resetTarget) return;
    if (!newPassword || newPassword.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }
    setResetBusy(true);
    setResetError('');
    try {
      const res = await api.post(`/admin/users/${resetTarget.id}/reset-password`, {
        newPassword,
        sendEmail: notifyUserByEmail,
      });
      toast.success('Password updated', res.message || `Password reset for ${resetTarget.name}`);
      setResetModalOpen(false);
    } catch (err) {
      setResetError(err.message || 'Failed to update password');
      toast.error('Password reset failed', err.message);
    } finally {
      setResetBusy(false);
    }
  }

  async function handleGenerateResetLink() {
    if (!resetTarget) return;
    setResetBusy(true);
    setResetError('');
    try {
      const res = await api.post(`/admin/users/${resetTarget.id}/reset-password`, {
        sendResetLink: true,
      });
      setGeneratedLink(res.resetLink);
      toast.success(res.emailed ? 'Reset link sent & generated' : 'Reset link generated', res.message);
    } catch (err) {
      setResetError(err.message || 'Failed to generate reset link');
      toast.error('Failed to generate reset link', err.message);
    } finally {
      setResetBusy(false);
    }
  }

  function handleCopyResetLink() {
    if (!generatedLink) return;
    navigator.clipboard?.writeText(generatedLink);
    setLinkCopied(true);
    toast.info('Link copied to clipboard', 'Share it securely with the user.');
    setTimeout(() => setLinkCopied(false), 2500);
  }

  function handleCopyPassword() {
    if (!newPassword) return;
    navigator.clipboard?.writeText(newPassword);
    setPassCopied(true);
    toast.info('Password copied', 'Share it securely with the user.');
    setTimeout(() => setPassCopied(false), 2500);
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required.';
    if (!editing) {
      if (!form.email.trim()) errs.email = 'Email is required.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Please enter a valid email address.';
      if (!form.password) errs.password = 'Password is required.';
      else if (form.password.length < 8) errs.password = 'Use at least 8 characters.';
    } else {
      if (form.password && form.password.length < 8) errs.password = 'New password must be at least 8 characters.';
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
        await api.patch(`/admin/users/${editing.id}`, {
          name: form.name,
          role: form.role,
          status: form.status,
          ...(form.password ? { password: form.password } : {}),
        });
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
                            { label: 'Reset password', icon: KeyRound, onClick: () => openResetModal(u) },
                            ...(u.role === 'student' ? [{ label: 'Open 360° Cadet Record', icon: GraduationCap, onClick: () => { window.location.href = `/admin/students/${u.id}`; } }] : []),
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
        size="md"
        icon={UserPlus}
        tone="indigo"
        title={editing ? `Edit User: ${editing.name}` : 'Create User Account'}
        subtitle="Configure personal credentials, platform role access, and account status."
        footer={(
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={saving} loadingLabel="Saving…">
              {editing ? 'Save Changes' : 'Create User Account'}
            </Button>
          </>
        )}
      >
        <form onSubmit={submit}>
          {editing && editing.role === 'student' && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(79, 70, 229, 0.08)',
              border: '1px solid rgba(79, 70, 229, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <div>
                <strong style={{ fontSize: '0.82rem', color: 'var(--text)', display: 'block' }}>
                  Full 360° Cadet Record Available
                </strong>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                  Manage course enrollments, batch assignments, exam attempts &amp; analytics.
                </span>
              </div>
              <a
                href={`/admin/students/${editing.id}`}
                className="btn btn-sm btn-primary"
                style={{ flexShrink: 0, padding: '4px 12px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <GraduationCap size={14} /> Open 360° Record
              </a>
            </div>
          )}

          {/* Section 1: Blue Card - User Identity */}
          <div className="form-card-box form-card-blue">
            <div className="form-card-header-row">
              <span className="form-card-header">
                <User size={14} /> Personal Information
              </span>
              <span className="form-card-badge">
                {(form.role || 'student').toUpperCase()}
              </span>
            </div>

            <div className="field">
              <label htmlFor="u-name">Full Name <span className="field-req">*</span></label>
              <input
                id="u-name"
                value={form.name}
                className={formErrors.name ? 'has-error' : ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Capt. Vikram Sharma"
                required
              />
              <small className="field-hint">Legal student or instructor name displayed across rosters &amp; test results.</small>
              {formErrors.name && <p className="field-error">{formErrors.name}</p>}
            </div>

            <div className="field">
              <label htmlFor="u-email">Email Address <span className="field-req">*</span></label>
              <input
                id="u-email"
                type="email"
                value={form.email}
                disabled={!!editing}
                className={formErrors.email ? 'has-error' : ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="pilot@airline.com"
                required
              />
              <small className="field-hint">
                {editing ? "Email addresses cannot be changed after account creation." : "Login email used for platform access and test reports."}
              </small>
              {formErrors.email && <p className="field-error">{formErrors.email}</p>}
            </div>
          </div>

          {/* Section 2: Amber Card - Security Credentials */}
          {!editing ? (
            <div className="form-card-box form-card-amber">
              <div className="form-card-header-row">
                <span className="form-card-header">
                  <KeyRound size={14} /> Security &amp; Credentials
                </span>
                <span className="form-card-badge">Password</span>
              </div>

              <div className="field">
                <label htmlFor="u-pass">Initial Account Password <span className="field-req">*</span></label>
                <input
                  id="u-pass"
                  type="password"
                  value={form.password}
                  className={formErrors.password ? 'has-error' : ''}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimum 8 characters..."
                  required
                />
                <small className="field-hint">At least 8 characters. Please securely convey this initial password to the pilot.</small>
                {formErrors.password && <p className="field-error">{formErrors.password}</p>}
              </div>
            </div>
          ) : (
            <div className="form-card-box form-card-amber">
              <div className="form-card-header-row">
                <span className="form-card-header">
                  <KeyRound size={14} /> Password &amp; Credentials
                </span>
                <span className="form-card-badge">Optional</span>
              </div>

              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label htmlFor="u-pass-edit" style={{ margin: 0 }}>Update Password</label>
                  <button
                    type="button"
                    onClick={() => { setFormOpen(false); openResetModal(editing); }}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--primary, #4f46e5)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: 0,
                    }}
                  >
                    <KeyRound size={12} /> Open Full Reset Console →
                  </button>
                </div>
                <input
                  id="u-pass-edit"
                  type="password"
                  value={form.password}
                  className={formErrors.password ? 'has-error' : ''}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Leave blank to keep existing password..."
                />
                <small className="field-hint">Leave blank to retain current password. Enter 8+ characters to change immediately.</small>
                {formErrors.password && <p className="field-error">{formErrors.password}</p>}
              </div>
            </div>
          )}

          {/* Section 3: Purple Card - Role & Access Permissions */}
          <div className="form-card-box form-card-purple">
            <div className="form-card-header-row">
              <span className="form-card-header">
                <Shield size={14} /> Role &amp; Account Status
              </span>
              <span className="form-card-badge">
                {(form.status || 'active').toUpperCase()}
              </span>
            </div>

            <div className="form-row-2">
              <div className="field">
                <label htmlFor="u-role">Platform Role</label>
                <select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                </select>
                <small className="field-hint">Defines permissions across syllabus &amp; exams.</small>
              </div>

              {editing && (
                <div className="field">
                  <label htmlFor="u-status">Account Status</label>
                  <select id="u-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Active (Access Allowed)</option>
                    <option value="suspended">Suspended (Access Revoked)</option>
                  </select>
                  <small className="field-hint">Suspended accounts cannot sign in.</small>
                </div>
              )}
            </div>

            <div className="row" style={{ marginTop: 8, alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ fontSize: '.78rem', fontWeight: 600 }}>Active Badges:</span>
              <RoleBadge role={form.role} />
              <StatusBadge status={form.status || 'active'} />
            </div>
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

      {/* Dedicated Reset Password Modal */}
      <Modal
        open={resetModalOpen}
        onClose={() => !resetBusy && setResetModalOpen(false)}
        size="md"
        icon={KeyRound}
        tone="purple"
        title="Reset Account Password"
        subtitle={resetTarget ? `Manage authentication credentials for ${resetTarget.name || resetTarget.email}` : 'Manage credentials'}
        footer={(
          <>
            <Button variant="outline" onClick={() => setResetModalOpen(false)} disabled={resetBusy}>
              Close
            </Button>
            {resetTab === 'direct' ? (
              <Button
                variant="primary"
                icon={KeyRound}
                onClick={handleDirectReset}
                loading={resetBusy}
                loadingLabel="Updating…"
              >
                Set New Password
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={Mail}
                onClick={handleGenerateResetLink}
                loading={resetBusy}
                loadingLabel="Generating…"
              >
                Generate &amp; Dispatch Link
              </Button>
            )}
          </>
        )}
      >
        {resetTarget && (
          <div className="stack" style={{ gap: 16 }}>
            {/* User Details Pill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: 10,
              background: 'var(--surface-alt, #f8fafc)',
              border: '1px solid var(--border)',
            }}>
              <div>
                <strong style={{ display: 'block', fontSize: '0.88rem', color: 'var(--text)' }}>
                  {resetTarget.name}
                </strong>
                <span className="muted" style={{ fontSize: '0.78rem' }}>{resetTarget.email}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <RoleBadge role={resetTarget.role} />
                <StatusBadge status={resetTarget.status || 'active'} />
              </div>
            </div>

            {/* Mode Tab Switcher */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
              padding: 4,
              borderRadius: 8,
              background: 'var(--surface-2, #f1f5f9)',
            }}>
              <button
                type="button"
                onClick={() => { setResetTab('direct'); setResetError(''); }}
                style={{
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: resetTab === 'direct' ? 'var(--surface, #ffffff)' : 'transparent',
                  color: resetTab === 'direct' ? 'var(--text, #0f172a)' : 'var(--muted, #64748b)',
                  boxShadow: resetTab === 'direct' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <KeyRound size={14} /> Set New Password
              </button>
              <button
                type="button"
                onClick={() => { setResetTab('link'); setResetError(''); }}
                style={{
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: resetTab === 'link' ? 'var(--surface, #ffffff)' : 'transparent',
                  color: resetTab === 'link' ? 'var(--text, #0f172a)' : 'var(--muted, #64748b)',
                  boxShadow: resetTab === 'link' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <Mail size={14} /> Send Reset Link
              </button>
            </div>

            {resetError && (
              <div className="error-banner" style={{ margin: 0, fontSize: '0.82rem' }}>
                {resetError}
              </div>
            )}

            {/* TAB 1: Direct Reset */}
            {resetTab === 'direct' && (
              <form onSubmit={handleDirectReset} className="stack" style={{ gap: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label htmlFor="modal-new-pass" style={{ margin: 0, fontWeight: 600, fontSize: '0.82rem' }}>
                      New Account Password <span className="field-req">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => { setNewPassword(generateStrongPassword()); setShowPassword(true); }}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: 'var(--primary, #4f46e5)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: 0,
                      }}
                    >
                      <Sparkles size={12} /> Generate Strong
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        id="modal-new-pass"
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 8 characters..."
                        required
                        style={{ paddingRight: 40 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          border: 'none',
                          background: 'none',
                          color: 'var(--muted)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      icon={passCopied ? Check : Copy}
                      onClick={handleCopyPassword}
                      title="Copy password to clipboard"
                    >
                      {passCopied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <small className="field-hint" style={{ marginTop: 4 }}>
                    Updating will immediately revoke any active student exam or practice sessions for security.
                  </small>
                </div>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.82rem',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'var(--surface-alt, #f8fafc)',
                  border: '1px solid var(--border)',
                }}>
                  <input
                    type="checkbox"
                    checked={notifyUserByEmail}
                    onChange={(e) => setNotifyUserByEmail(e.target.checked)}
                    style={{ accentColor: 'var(--primary, #4f46e5)', cursor: 'pointer' }}
                  />
                  <span>Dispatch security alert email to <strong>{resetTarget.email}</strong></span>
                </label>
              </form>
            )}

            {/* TAB 2: Generate / Send Reset Link */}
            {resetTab === 'link' && (
              <div className="stack" style={{ gap: 14 }}>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  Generates a secure 24-hour single-use reset token and delivers an automated password reset email directly to the cadet's inbox.
                </p>

                {generatedLink ? (
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(79, 70, 229, 0.06)',
                    border: '1px solid rgba(79, 70, 229, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '0.8rem', color: '#4338ca' }}>Generated Reset Link:</strong>
                      <span style={{ fontSize: '0.72rem', color: '#6366f1' }}>Valid for 24 hours</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        readOnly
                        value={generatedLink}
                        style={{
                          fontSize: '0.78rem',
                          background: 'var(--surface, #ffffff)',
                          fontFamily: 'monospace',
                        }}
                      />
                      <Button
                        variant="primary"
                        icon={linkCopied ? Check : Copy}
                        onClick={handleCopyResetLink}
                      >
                        {linkCopied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                      <a
                        href={generatedLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: '0.74rem',
                          color: '#4338ca',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        Open reset link in new tab <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '16px',
                    borderRadius: 8,
                    background: 'var(--surface-alt, #f8fafc)',
                    border: '1px dashed var(--border)',
                    textAlign: 'center',
                  }}>
                    <Mail size={28} style={{ color: 'var(--muted)', margin: '0 auto 8px', display: 'block' }} />
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
                      Click below to generate the link and trigger the email dispatch.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

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
