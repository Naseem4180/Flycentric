import { useCallback, useEffect, useState } from 'react';
import { Plus, Mail, Send, XCircle, Trash2 } from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  EmptyState, ErrorState, Skeleton, Badge,
} from '../../ui';

const BLANK = { subject: '', body: '', audience: 'all', scheduled_send_time: '' };
const STATUS_TONE = { scheduled: 'blue', sending: 'orange', sent: 'green', cancelled: 'slate' };

export default function AdminEmailCampaigns() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setError('');
    api.get('/admin/email-campaigns').then((d) => setItems(d.campaigns)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function save(e) {
    e?.preventDefault();
    if (!form.subject.trim() || !form.body.trim() || !form.scheduled_send_time) {
      toast.warning('Subject, message and send time are all required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/email-campaigns', {
        ...form,
        scheduled_send_time: new Date(form.scheduled_send_time).toISOString(),
      });
      toast.success('Campaign scheduled');
      setOpen(false);
      setForm(BLANK);
      load();
    } catch (err) {
      toast.error('Could not schedule campaign', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    try {
      await api.post(`/admin/email-campaigns/${confirmCancel.id}/cancel`);
      toast.success('Campaign cancelled');
      setConfirmCancel(null);
      load();
    } catch (err) {
      toast.error('Could not cancel campaign', err.message);
    }
  }

  async function remove() {
    try {
      await api.del(`/admin/email-campaigns/${confirmDelete.id}`);
      toast.success('Campaign removed');
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error('Could not remove campaign', err.message);
    }
  }

  return (
    <div className="accent-purple">
      <PageHeader
        eyebrow="Engagement"
        title="Email Campaigns"
        subtitle="Draft a promotional email or greeting and schedule it to send to all users at a specific date and time."
        actions={<Button variant="primary" icon={Plus} onClick={() => { setForm(BLANK); setOpen(true); }}>New campaign</Button>}
      />

      {error ? (
        <Card><ErrorState title="Could not load campaigns" description={error} onRetry={load} /></Card>
      ) : !items ? (
        <Card><Skeleton style={{ height: 220 }} /></Card>
      ) : !items.length ? (
        <Card><EmptyState icon={Mail} title="No campaigns yet" description="Schedule your first bulk email." /></Card>
      ) : (
        <Card>
          <table className="data-table">
            <thead>
              <tr><th>Subject</th><th>Audience</th><th>Scheduled for</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td data-label="Subject">{c.subject}</td>
                  <td data-label="Audience" className="td-muted" style={{ textTransform: 'capitalize' }}>{c.audience}</td>
                  <td data-label="Scheduled for" className="td-muted">{new Date(c.scheduled_send_time).toLocaleString()}</td>
                  <td data-label="Status"><Badge tone={STATUS_TONE[c.status] || 'slate'}>{c.status}</Badge></td>
                  <td data-label="" style={{ textAlign: 'right' }}>
                    {c.status === 'scheduled' && (
                      <Button size="xs" icon={XCircle} onClick={() => setConfirmCancel(c)}>Cancel</Button>
                    )}
                    {c.status !== 'sending' && (
                      <Button size="xs" variant="danger" icon={Trash2} onClick={() => setConfirmDelete(c)}>Delete</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New email campaign"
        footer={(
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Send} onClick={save} loading={saving}>Schedule</Button>
          </>
        )}
      >
        <form onSubmit={save}>
          <div className="field">
            <label htmlFor="ec-subject">Subject</label>
            <input id="ec-subject" className="input" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="ec-body">Message</label>
            <textarea id="ec-body" rows={6} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Write the email body…" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ec-audience">Audience</label>
              <select id="ec-audience" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
                <option value="all">All users</option>
                <option value="students">Students only</option>
                <option value="instructors">Instructors only</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ec-when">Send at</label>
              <input id="ec-when" type="datetime-local" className="input" value={form.scheduled_send_time} onChange={(e) => setForm((f) => ({ ...f, scheduled_send_time: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={cancel}
        tone="warning"
        title="Cancel this campaign?"
        message={confirmCancel ? `“${confirmCancel.subject}” will not be sent.` : ''}
        confirmLabel="Cancel Campaign"
      />
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title="Delete this campaign?"
        message={confirmDelete ? `“${confirmDelete.subject}” will be permanently removed.` : ''}
        confirmLabel="Delete"
      />
    </div>
  );
}
