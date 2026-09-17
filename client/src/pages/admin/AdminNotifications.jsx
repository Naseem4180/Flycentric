import { useCallback, useEffect, useState } from 'react';
import { Plus, Bell, Megaphone, Radio, Trash2, Edit2 } from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  EmptyState, ErrorState, Skeleton, Badge,
} from '../../ui';

const BLANK = { type: 'ticker', content: '', link_url: '', start_datetime: '', end_datetime: '', is_active: true, target_audience: 'all' };

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusOf(n) {
  const now = Date.now();
  const start = n.start_datetime ? new Date(n.start_datetime).getTime() : null;
  const end = n.end_datetime ? new Date(n.end_datetime).getTime() : null;
  if (!n.is_active) return { label: 'Disabled', tone: 'slate' };
  if (start && start > now) return { label: 'Scheduled', tone: 'blue' };
  if (end && end < now) return { label: 'Expired', tone: 'slate' };
  return { label: 'Live', tone: 'green' };
}

export default function AdminNotifications() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setError('');
    api.get('/notifications').then((d) => setItems(d.notifications)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  function openCreate() {
    setEditing(null);
    setForm(BLANK);
    setOpen(true);
  }
  function openEdit(n) {
    setEditing(n);
    setForm({
      type: n.type,
      content: n.content,
      link_url: n.link_url || '',
      start_datetime: toLocalInput(n.start_datetime),
      end_datetime: toLocalInput(n.end_datetime),
      is_active: n.is_active,
      target_audience: n.target_audience || 'all',
    });
    setOpen(true);
  }

  async function save(e) {
    e?.preventDefault();
    if (!form.content.trim()) { toast.warning('Content is required'); return; }
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        content: form.content.trim(),
        link_url: form.link_url.trim() || null,
        start_datetime: form.start_datetime ? new Date(form.start_datetime).toISOString() : null,
        end_datetime: form.end_datetime ? new Date(form.end_datetime).toISOString() : null,
        is_active: form.is_active,
        target_audience: form.target_audience || 'all',
      };
      if (editing) {
        await api.patch(`/notifications/${editing.id}`, payload);
        toast.success('Notification updated');
      } else {
        await api.post('/notifications', payload);
        toast.success('Notification scheduled');
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error('Could not save notification', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await api.del(`/notifications/${confirmDelete.id}`);
      toast.success('Notification removed');
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error('Could not remove notification', err.message);
    }
  }

  return (
    <div className="accent-purple">
      <PageHeader
        eyebrow="Engagement"
        title="Notifications"
        subtitle="Schedule a scrolling ticker (soft) or a dashboard banner (hard) for a specific window of time."
        actions={<Button variant="primary" icon={Plus} onClick={openCreate}>New notification</Button>}
      />

      {error ? (
        <Card><ErrorState title="Could not load notifications" description={error} onRetry={load} /></Card>
      ) : !items ? (
        <Card><Skeleton style={{ height: 220 }} /></Card>
      ) : !items.length ? (
        <Card><EmptyState icon={Bell} title="No notifications yet" description="Schedule your first ticker or banner." /></Card>
      ) : (
        <Card>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th><th>Content</th><th>Audience</th><th>Window</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {items.map((n) => {
                const s = statusOf(n);
                return (
                  <tr key={n.id}>
                    <td data-label="Type">
                      {n.type === 'banner'
                        ? <Badge tone="orange"><Megaphone size={11} /> Banner</Badge>
                        : <Badge tone="blue"><Radio size={11} /> Ticker</Badge>}
                    </td>
                    <td data-label="Content" style={{ maxWidth: 320 }}>{n.content}</td>
                    <td data-label="Audience" className="td-muted" style={{ textTransform: 'capitalize' }}>
                      {n.target_audience || 'All'}
                    </td>
                    <td data-label="Window" className="td-muted">
                      {n.start_datetime ? new Date(n.start_datetime).toLocaleString() : '—'}
                      {' → '}
                      {n.end_datetime ? new Date(n.end_datetime).toLocaleString() : 'No end'}
                    </td>
                    <td data-label="Status"><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td data-label="" style={{ textAlign: 'right' }}>
                      <Button size="xs" icon={Edit2} onClick={() => openEdit(n)}>Edit</Button>
                      <Button size="xs" variant="danger" icon={Trash2} onClick={() => setConfirmDelete(n)}>Delete</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit notification' : 'New notification'}
        footer={(
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>{editing ? 'Save changes' : 'Schedule'}</Button>
          </>
        )}
      >
        <form onSubmit={save}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="n-type">Type</label>
              <select id="n-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="ticker">Ticker (soft, scrolling)</option>
                <option value="banner">Banner (hard, prominent)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="n-audience">Target Audience</label>
              <select id="n-audience" value={form.target_audience} onChange={(e) => setForm((f) => ({ ...f, target_audience: e.target.value }))}>
                <option value="all">All Users</option>
                <option value="students">Students Only</option>
                <option value="instructors">Instructors Only</option>
                <option value="paid">Paid Course Students</option>
                <option value="free">Free Students</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="n-content">Content</label>
            <textarea
              id="n-content"
              rows={3}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="e.g. New CPL Regs mock exam is live — attempt it before Friday!"
            />
          </div>
          <div className="field">
            <label htmlFor="n-link">Link URL (optional)</label>
            <input
              id="n-link"
              className="input"
              value={form.link_url}
              onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
              placeholder="https://…"
            />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="n-start">Starts</label>
              <input
                id="n-start"
                type="datetime-local"
                className="input"
                value={form.start_datetime}
                onChange={(e) => setForm((f) => ({ ...f, start_datetime: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="n-end">Ends (optional)</label>
              <input
                id="n-end"
                type="datetime-local"
                className="input"
                value={form.end_datetime}
                onChange={(e) => setForm((f) => ({ ...f, end_datetime: e.target.value }))}
              />
            </div>
          </div>
          <div className="field">
            <label className="checkbox-row" htmlFor="n-active">
              <input
                id="n-active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active
            </label>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title="Remove this notification?"
        message={confirmDelete ? `“${confirmDelete.content}” will stop showing immediately.` : ''}
        confirmLabel="Remove"
      />
    </div>
  );
}
