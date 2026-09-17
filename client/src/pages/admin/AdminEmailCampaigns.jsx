import { useCallback, useEffect, useState } from 'react';
import { Plus, Mail, Send, XCircle, Trash2, Eye, Cake, CheckCircle, Clock } from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, ConfirmModal, useToast,
  EmptyState, ErrorState, Skeleton, Badge,
} from '../../ui';

const BLANK = { subject: '', body: '', audience: 'all', scheduled_send_time: '' };
const STATUS_TONE = { scheduled: 'blue', sending: 'orange', sent: 'green', cancelled: 'slate' };

const DEFAULT_BIRTHDAY = {
  subject: 'Happy Birthday from FlyCentric! 🎂',
  message: 'Wishing you clear skies and smooth tailwinds on your special day! Happy Birthday from all of us at FlyCentric.',
  branding: 'FlyCentric Team',
};

export default function AdminEmailCampaigns() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Email Preview state
  const [previewItem, setPreviewItem] = useState(null);

  // Birthday Greeting configuration state
  const [birthdayOpen, setBirthdayOpen] = useState(false);
  const [birthdayForm, setBirthdayForm] = useState(DEFAULT_BIRTHDAY);
  const [savingBirthday, setSavingBirthday] = useState(false);

  const load = useCallback(() => {
    setError('');
    api.get('/admin/email-campaigns').then((d) => setItems(d.campaigns)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const loadBirthdaySettings = useCallback(() => {
    api.get('/admin/settings/birthday_email')
      .then((res) => {
        if (res.value) {
          const val = typeof res.value === 'string' ? JSON.parse(res.value) : res.value;
          setBirthdayForm({ ...DEFAULT_BIRTHDAY, ...val });
        }
      })
      .catch(() => {});
  }, []);

  function openBirthdayModal() {
    loadBirthdaySettings();
    setBirthdayOpen(true);
  }

  async function saveBirthdaySettings(e) {
    e?.preventDefault();
    if (!birthdayForm.subject.trim() || !birthdayForm.message.trim()) {
      toast.warning('Subject and message are required');
      return;
    }
    setSavingBirthday(true);
    try {
      await api.put('/admin/settings/birthday_email', { value: birthdayForm });
      toast.success('Birthday greeting settings saved');
      setBirthdayOpen(false);
    } catch (err) {
      toast.error('Could not save settings', err.message);
    } finally {
      setSavingBirthday(false);
    }
  }

  async function save(e, sendImmediately = false) {
    e?.preventDefault();
    if (!form.subject.trim() || !form.body.trim()) {
      toast.warning('Subject and message are required');
      return;
    }
    if (!sendImmediately && !form.scheduled_send_time) {
      toast.warning('Please specify a scheduled send time, or click Send Now');
      return;
    }
    setSaving(true);
    try {
      const sendTime = sendImmediately
        ? new Date().toISOString()
        : new Date(form.scheduled_send_time).toISOString();

      await api.post('/admin/email-campaigns', {
        ...form,
        scheduled_send_time: sendTime,
      });
      toast.success(sendImmediately ? 'Campaign dispatched' : 'Campaign scheduled');
      setOpen(false);
      setForm(BLANK);
      load();
    } catch (err) {
      toast.error('Could not schedule campaign', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendNow(campaign) {
    try {
      await api.post(`/admin/email-campaigns/${campaign.id}/send-now`);
      toast.success('Campaign queued for immediate dispatch', campaign.subject);
      load();
    } catch (err) {
      toast.error('Could not send campaign', err.message);
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
        title="Email Campaigns & Communications"
        subtitle="Draft and schedule bulk emails, preview campaigns, and configure automated birthday greetings."
        actions={(
          <div className="row" style={{ gap: 8 }}>
            <Button variant="outline" icon={Cake} onClick={openBirthdayModal}>
              Birthday Greeting Setup
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => { setForm(BLANK); setOpen(true); }}>
              New campaign
            </Button>
          </div>
        )}
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
                  <td data-label="Subject">
                    <strong>{c.subject}</strong>
                  </td>
                  <td data-label="Audience" className="td-muted" style={{ textTransform: 'capitalize' }}>{c.audience}</td>
                  <td data-label="Scheduled for" className="td-muted">{new Date(c.scheduled_send_time).toLocaleString()}</td>
                  <td data-label="Status"><Badge tone={STATUS_TONE[c.status] || 'slate'}>{c.status}</Badge></td>
                  <td data-label="" style={{ textAlign: 'right' }}>
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <Button size="xs" variant="outline" icon={Eye} onClick={() => setPreviewItem(c)}>Preview</Button>
                      {c.status === 'scheduled' && (
                        <>
                          <Button size="xs" variant="primary" icon={Send} onClick={() => sendNow(c)}>Send now</Button>
                          <Button size="xs" icon={XCircle} onClick={() => setConfirmCancel(c)}>Cancel</Button>
                        </>
                      )}
                      {c.status !== 'sending' && (
                        <Button size="xs" variant="danger" icon={Trash2} onClick={() => setConfirmDelete(c)}>Delete</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Compose Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New email campaign"
        footer={(
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="outline"
              icon={Eye}
              onClick={() => setPreviewItem(form)}
              disabled={!form.subject.trim() && !form.body.trim()}
            >
              Preview
            </Button>
            <Button
              variant="secondary"
              icon={Clock}
              onClick={(e) => save(e, false)}
              loading={saving}
            >
              Schedule
            </Button>
            <Button
              variant="primary"
              icon={Send}
              onClick={(e) => save(e, true)}
              loading={saving}
            >
              Publish / Send Now
            </Button>
          </>
        )}
      >
        <form onSubmit={(e) => save(e, false)}>
          <div className="field">
            <label htmlFor="ec-subject">Subject</label>
            <input
              id="ec-subject"
              className="input"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="e.g. Special Discount: 30% Off Commercial Pilot Exam Prep"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ec-body">Message</label>
            <textarea
              id="ec-body"
              rows={6}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Write the email content here. HTML or plain text supported..."
              required
            />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ec-audience">Target Audience</label>
              <select id="ec-audience" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
                <option value="all">All Users (Students & Instructors)</option>
                <option value="students">Students Only</option>
                <option value="instructors">Instructors Only</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ec-when">Schedule Send Time (optional if sending immediately)</label>
              <input
                id="ec-when"
                type="datetime-local"
                className="input"
                value={form.scheduled_send_time}
                onChange={(e) => setForm((f) => ({ ...f, scheduled_send_time: e.target.value }))}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Email Preview Modal */}
      <Modal
        open={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title="Email Preview"
        footer={<Button variant="outline" onClick={() => setPreviewItem(null)}>Close Preview</Button>}
      >
        {previewItem && (
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            background: '#ffffff',
            overflow: 'hidden',
          }}>
            <div style={{
              background: '#f8fafc',
              padding: '12px 16px',
              borderBottom: '1px solid #e2e8f0',
              fontSize: '0.86rem',
            }}>
              <div><strong>From:</strong> FlyCentric &lt;notifications@flycentric.in&gt;</div>
              <div style={{ marginTop: 4 }}>
                <strong>To:</strong> {previewItem.audience ? `${previewItem.audience} (audience)` : 'Candidate / Student'}
              </div>
              <div style={{ marginTop: 4 }}>
                <strong>Subject:</strong> {previewItem.subject || '(No subject)'}
              </div>
            </div>
            <div style={{ padding: '24px 20px', minHeight: 180, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {previewItem.body || '(No content written yet)'}
            </div>
            <div style={{
              background: '#f8fafc',
              padding: '12px 16px',
              borderTop: '1px solid #e2e8f0',
              fontSize: '0.78rem',
              color: '#64748b',
              textAlign: 'center',
            }}>
              FlyCentric · India's Smart Aviation Exam Prep · You received this email as a registered user.
            </div>
          </div>
        )}
      </Modal>

      {/* Birthday Greeting Settings Modal */}
      <Modal
        open={birthdayOpen}
        onClose={() => setBirthdayOpen(false)}
        title="Configure Birthday Wishes"
        footer={(
          <>
            <Button variant="outline" onClick={() => setBirthdayOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={CheckCircle} onClick={saveBirthdaySettings} loading={savingBirthday}>
              Save Configuration
            </Button>
          </>
        )}
      >
        <form onSubmit={saveBirthdaySettings}>
          <p className="muted" style={{ fontSize: '0.86rem', marginTop: 0, marginBottom: 16 }}>
            The automated email engine checks students' profiles daily. Candidates celebrate with this greeting on their birthday.
          </p>
          <div className="field">
            <label htmlFor="bday-subject">Email Subject</label>
            <input
              id="bday-subject"
              className="input"
              value={birthdayForm.subject}
              onChange={(e) => setBirthdayForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="e.g. Happy Birthday from FlyCentric! 🎂"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="bday-message">Greeting Message</label>
            <textarea
              id="bday-message"
              className="input"
              rows={4}
              value={birthdayForm.message}
              onChange={(e) => setBirthdayForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Wishing you clear skies and smooth tailwinds on your special day..."
              required
            />
          </div>
          <div className="field">
            <label htmlFor="bday-branding">Sign-off / Branding</label>
            <input
              id="bday-branding"
              className="input"
              value={birthdayForm.branding}
              onChange={(e) => setBirthdayForm((f) => ({ ...f, branding: e.target.value }))}
              placeholder="e.g. FlyCentric Team"
              required
            />
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
